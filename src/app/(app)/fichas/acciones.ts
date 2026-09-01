"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requerirUsuarioEnAccion } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { campoDeError, ErrorValidacion, mensajeDeError } from "@/lib/domain/errors";
import { obtenerStorage } from "@/lib/storage";
import {
  erroresDeZod,
  esquemaAnulacion,
  esquemaEdicionFicha,
  esquemaLegajo,
  esquemaNuevaFicha,
} from "@/lib/validacion/esquemas";

/**
 * Server Actions del circuito de fichas.
 *
 * Todas revalidan la sesion y los datos del formulario en el servidor. Lo que
 * valida el navegador es solo para dar feedback rapido; estas funciones son
 * el unico lugar donde la validacion es vinculante.
 */

export interface EstadoFormulario {
  ok?: boolean;
  error?: string;
  errores?: Record<string, string>;
  /** Id de la ficha creada, para que el cliente navegue al detalle. */
  fichaId?: string;
}

export interface ResultadoBusquedaAlumno {
  encontrado: boolean;
  mensaje?: string;
  alumno?: { legajo: string; apellido: string; nombre: string; nombreCompleto: string };
}

/**
 * Busca un alumno por legajo para autocompletar el formulario.
 * Requiere sesion: el padron no se expone a cualquiera que pruebe legajos.
 */
export async function buscarAlumnoPorLegajo(legajo: string): Promise<ResultadoBusquedaAlumno> {
  try {
    await requerirUsuarioEnAccion();

    const parseo = esquemaLegajo.safeParse(legajo);
    if (!parseo.success) {
      return { encontrado: false, mensaje: parseo.error.issues[0]?.message ?? "Legajo invalido." };
    }

    const alumno = await obtenerRepositorio().buscarAlumno(parseo.data);
    if (!alumno) {
      return {
        encontrado: false,
        mensaje: `El legajo ${parseo.data} no existe en el padron de alumnos inscriptos.`,
      };
    }

    return {
      encontrado: true,
      alumno: {
        legajo: alumno.legajo,
        apellido: alumno.apellido,
        nombre: alumno.nombre,
        nombreCompleto: alumno.nombreCompleto,
      },
    };
  } catch (error) {
    return { encontrado: false, mensaje: mensajeDeError(error) };
  }
}

export async function crearFicha(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const storage = obtenerStorage();
  let pathGuardado: string | null = null;
  let creada: string | null = null;

  try {
    const usuario = await requerirUsuarioEnAccion();

    const parseo = esquemaNuevaFicha.safeParse({
      legajo: datos.get("legajo"),
      motivoId: datos.get("motivoId"),
      fechaRecuperatorioId: datos.get("fechaRecuperatorioId"),
      observaciones: datos.get("observaciones") ?? undefined,
    });
    if (!parseo.success) {
      return { error: "Revisa los campos marcados.", errores: erroresDeZod(parseo.error) };
    }

    const archivo = datos.get("archivo");
    if (!(archivo instanceof File)) {
      throw new ErrorValidacion("Tenes que adjuntar el comprobante en PDF.", "archivo");
    }

    // El archivo se guarda antes de insertar la ficha porque el path es un
    // campo obligatorio del registro. Si el INSERT despues falla (cupo,
    // duplicado), el catch borra el archivo para no dejar huerfanos.
    const guardado = await storage.guardar(archivo, parseo.data.legajo);
    pathGuardado = guardado.path;

    const ficha = await obtenerRepositorio().crearFicha({
      legajo: parseo.data.legajo,
      motivoId: parseo.data.motivoId,
      fechaRecuperatorioId: parseo.data.fechaRecuperatorioId,
      observaciones: parseo.data.observaciones,
      archivoPath: guardado.path,
      archivoNombre: guardado.nombre,
      archivoTamano: guardado.tamano,
      creadoPor: usuario.id,
    });

    revalidatePath("/fichas");
    revalidatePath("/admin");
    creada = ficha.id;
  } catch (error) {
    if (pathGuardado) {
      await storage.eliminar(pathGuardado).catch(() => {
        /* si no se puede borrar, no se pisa el error original */
      });
    }
    const campo = campoDeError(error);
    return {
      error: mensajeDeError(error),
      errores: campo ? { [campo]: mensajeDeError(error) } : undefined,
    };
  }

  // Fuera del try: `redirect` funciona lanzando una excepcion de control que
  // Next intercepta, y atraparla aca la convertiria en un error de formulario.
  // Redirigir desde el servidor (en vez de navegar desde el cliente) hace que
  // el circuito funcione igual con JavaScript deshabilitado.
  redirect(`/fichas/${creada}?creada=1`);
}

export async function editarFicha(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const storage = obtenerStorage();
  let pathNuevo: string | null = null;
  let editada: string | null = null;

  try {
    const usuario = await requerirUsuarioEnAccion();

    const id = datos.get("id");
    if (typeof id !== "string" || !id) {
      return { error: "No se pudo identificar la ficha a editar." };
    }

    const parseo = esquemaEdicionFicha.safeParse({
      motivoId: datos.get("motivoId"),
      fechaRecuperatorioId: datos.get("fechaRecuperatorioId"),
      observaciones: datos.get("observaciones") ?? undefined,
    });
    if (!parseo.success) {
      return { error: "Revisa los campos marcados.", errores: erroresDeZod(parseo.error) };
    }

    const repo = obtenerRepositorio();
    const actual = await repo.obtenerFicha(id);
    if (!actual) return { error: "La ficha que intentas editar no existe." };

    // El adjunto es opcional al editar: si no se sube uno nuevo, se conserva.
    const archivo = datos.get("archivo");
    let cambioArchivo: { path: string; nombre: string; tamano: number } | null = null;
    if (archivo instanceof File && archivo.size > 0) {
      const guardado = await storage.guardar(archivo, actual.legajo);
      pathNuevo = guardado.path;
      cambioArchivo = guardado;
    }

    await repo.actualizarFicha(
      id,
      {
        motivoId: parseo.data.motivoId,
        fechaRecuperatorioId: parseo.data.fechaRecuperatorioId,
        observaciones: parseo.data.observaciones,
        archivo: cambioArchivo,
      },
      usuario.id,
    );

    // Recien con el UPDATE confirmado se borra el PDF viejo: si se borrara
    // antes y la actualizacion fallara, la ficha quedaria apuntando a nada.
    if (cambioArchivo) {
      await storage.eliminar(actual.archivoPath).catch(() => {
        /* el adjunto viejo puede haber desaparecido; no es motivo de error */
      });
    }

    revalidatePath("/fichas");
    revalidatePath(`/fichas/${id}`);
    editada = id;
  } catch (error) {
    if (pathNuevo) {
      await storage.eliminar(pathNuevo).catch(() => {});
    }
    const campo = campoDeError(error);
    return {
      error: mensajeDeError(error),
      errores: campo ? { [campo]: mensajeDeError(error) } : undefined,
    };
  }

  redirect(`/fichas/${editada}?editada=1`);
}

/**
 * Anula una ficha. Es una baja logica: el registro y el adjunto se conservan
 * para que quede la trazabilidad de lo que se cargo y por que se dio de baja.
 */
export async function anularFicha(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  let anulada: string | null = null;

  try {
    const usuario = await requerirUsuarioEnAccion();

    const id = datos.get("id");
    if (typeof id !== "string" || !id) {
      return { error: "No se pudo identificar la ficha a anular." };
    }

    const parseo = esquemaAnulacion.safeParse({ motivo: datos.get("motivo") });
    if (!parseo.success) {
      return { error: "Revisa los campos marcados.", errores: erroresDeZod(parseo.error) };
    }

    await obtenerRepositorio().anularFicha(id, parseo.data.motivo, usuario.id);

    revalidatePath("/fichas");
    revalidatePath(`/fichas/${id}`);
    revalidatePath("/admin");
    anulada = id;
  } catch (error) {
    return { error: mensajeDeError(error) };
  }

  redirect(`/fichas/${anulada}?anulada=1`);
}
