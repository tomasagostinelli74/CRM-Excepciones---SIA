import ExcelJS from "exceljs";

import { ErrorValidacion } from "@/lib/domain/errors";
import type { AlumnoImportado } from "@/lib/data/repository";
import { limpiarEspacios } from "@/lib/utils/texto";

/**
 * Importador del padron de alumnos desde el Excel del sistema academico.
 *
 * Sin `server-only` a proposito: es parseo puro, sin secretos ni acceso a
 * datos, y lo comparten la Server Action del panel y el script de CLI
 * (`npm run import:alumnos`), que corre fuera del bundler de Next.
 *
 * Formato esperado (verificado contra "Alumnos_a_ingresar_*.xlsx"):
 *   fila 1  -> encabezados: `legajo`, `alumno`
 *   fila 2+ -> legajo numerico de 7 digitos y `"Apellido, Nombre"`
 *
 * Particularidades reales del archivo que este parser contempla:
 *   - ~8 % de las filas traen espacios de mas ("Cvitanich  , Luana Abril ").
 *   - Cuatro apellidos usan el acento agudo suelto como apostrofo
 *     ("D´Amore"); se conserva tal cual para mostrar y se normaliza solo
 *     para la busqueda.
 *   - El legajo viene como numero; se guarda como texto para no perder
 *     formato si algun dia cambia.
 */

/** Nombres de columna aceptados, ya normalizados a minusculas. */
const COLUMNAS_LEGAJO = ["legajo", "lu", "libreta", "documento"];
const COLUMNAS_ALUMNO = ["alumno", "nombre", "apellido y nombre", "apellido, nombre", "nombre completo"];

export interface FilaRechazada {
  fila: number;
  legajo: string;
  valor: string;
  motivo: string;
}

export interface ResultadoParseo {
  alumnos: AlumnoImportado[];
  rechazadas: FilaRechazada[];
  /** Legajos repetidos dentro del propio archivo. Gana la ultima aparicion. */
  duplicadosEnArchivo: string[];
  totalFilas: number;
}

/**
 * Separa `"Apellido, Nombre"` en sus dos partes.
 *
 * Si no hay coma no se puede saber donde termina el apellido (los apellidos
 * compuestos son frecuentes: "Lovera Roja, Daniel"), asi que en vez de
 * adivinar se toma todo como apellido y se deja `nombre` vacio: es
 * preferible un dato incompleto pero fiel al archivo antes que uno inventado.
 */
export function separarNombre(valor: string): { apellido: string; nombre: string } {
  const limpio = limpiarEspacios(valor);
  const coma = limpio.indexOf(",");
  if (coma === -1) return { apellido: limpio, nombre: "" };
  return {
    apellido: limpiarEspacios(limpio.slice(0, coma)),
    nombre: limpiarEspacios(limpio.slice(coma + 1)),
  };
}

/** Convierte a texto el valor de una celda, sea numero, texto o formula. */
function celdaATexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "boolean") return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    // Celdas con formula, texto enriquecido o hipervinculo.
    if ("result" in valor && valor.result !== undefined) return celdaATexto(valor.result as ExcelJS.CellValue);
    if ("richText" in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((t) => t.text).join("");
    }
    if ("text" in valor && typeof valor.text === "string") return valor.text;
  }
  return String(valor);
}

/** Ubica las columnas de legajo y alumno por su encabezado. */
function ubicarColumnas(hoja: ExcelJS.Worksheet): { colLegajo: number; colAlumno: number } {
  const encabezado = hoja.getRow(1);
  let colLegajo = 0;
  let colAlumno = 0;

  encabezado.eachCell({ includeEmpty: false }, (celda, numero) => {
    const titulo = limpiarEspacios(celdaATexto(celda.value)).toLowerCase();
    if (!colLegajo && COLUMNAS_LEGAJO.includes(titulo)) colLegajo = numero;
    if (!colAlumno && COLUMNAS_ALUMNO.includes(titulo)) colAlumno = numero;
  });

  if (!colLegajo || !colAlumno) {
    throw new ErrorValidacion(
      "El Excel debe tener una fila de encabezados con las columnas \"legajo\" y \"alumno\". " +
        "Verifica que la primera fila tenga esos titulos.",
      "archivo",
    );
  }

  return { colLegajo, colAlumno };
}

/**
 * Lee el .xlsx y devuelve los alumnos listos para el upsert, junto con el
 * detalle de lo que se descarto. Nunca lanza por una fila mala: las junta en
 * `rechazadas` para que el admin las vea en la vista previa y decida.
 */
export async function parsearExcelAlumnos(buffer: Buffer): Promise<ResultadoParseo> {
  const libro = new ExcelJS.Workbook();
  try {
    // El tipo de exceljs pide ArrayBuffer; el Buffer de Node lo satisface.
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ErrorValidacion(
      "No se pudo leer el archivo. Asegurate de que sea un Excel (.xlsx) valido y no este danado.",
      "archivo",
    );
  }

  const hoja = libro.worksheets[0];
  if (!hoja) {
    throw new ErrorValidacion("El archivo no tiene ninguna hoja con datos.", "archivo");
  }

  const { colLegajo, colAlumno } = ubicarColumnas(hoja);

  const porLegajo = new Map<string, AlumnoImportado>();
  const rechazadas: FilaRechazada[] = [];
  const duplicados = new Set<string>();
  let totalFilas = 0;

  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila += 1) {
    const fila = hoja.getRow(numeroFila);
    const legajoCrudo = limpiarEspacios(celdaATexto(fila.getCell(colLegajo).value));
    const alumnoCrudo = celdaATexto(fila.getCell(colAlumno).value);

    // Fila totalmente vacia: es relleno del final del archivo, no un error.
    if (!legajoCrudo && !limpiarEspacios(alumnoCrudo)) continue;

    totalFilas += 1;

    if (!legajoCrudo) {
      rechazadas.push({ fila: numeroFila, legajo: "", valor: alumnoCrudo, motivo: "Falta el legajo." });
      continue;
    }
    if (!/^\d+$/.test(legajoCrudo)) {
      rechazadas.push({
        fila: numeroFila,
        legajo: legajoCrudo,
        valor: alumnoCrudo,
        motivo: "El legajo tiene caracteres que no son numeros.",
      });
      continue;
    }

    const nombreCompleto = limpiarEspacios(alumnoCrudo);
    if (!nombreCompleto) {
      rechazadas.push({
        fila: numeroFila,
        legajo: legajoCrudo,
        valor: "",
        motivo: "Falta el nombre del alumno.",
      });
      continue;
    }

    const { apellido, nombre } = separarNombre(nombreCompleto);
    if (!apellido) {
      rechazadas.push({
        fila: numeroFila,
        legajo: legajoCrudo,
        valor: nombreCompleto,
        motivo: "No se pudo determinar el apellido.",
      });
      continue;
    }

    if (porLegajo.has(legajoCrudo)) duplicados.add(legajoCrudo);
    // Ante repetidos dentro del archivo gana el ultimo, igual que haria una
    // planilla leida de arriba hacia abajo.
    porLegajo.set(legajoCrudo, {
      legajo: legajoCrudo,
      apellido,
      nombre,
      // Se reconstruye a partir de las partes ya recortadas para que quede
      // canonico: el archivo trae cosas como "Cvitanich  , Luana Abril ".
      nombreCompleto: nombre ? `${apellido}, ${nombre}` : apellido,
    });
  }

  if (porLegajo.size === 0) {
    throw new ErrorValidacion(
      "No se encontro ningun alumno valido en el archivo. Revisa que los datos empiecen en la fila 2.",
      "archivo",
    );
  }

  return {
    alumnos: [...porLegajo.values()],
    rechazadas,
    duplicadosEnArchivo: [...duplicados],
    totalFilas,
  };
}
