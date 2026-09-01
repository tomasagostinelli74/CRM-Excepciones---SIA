/**
 * Carga datos de ejemplo para desarrollo.
 * Uso: npm run db:seed
 *
 * Es idempotente: si el dato ya existe no lo duplica, asi que se puede
 * correr las veces que haga falta.
 *
 * IMPORTANTE: los alumnos que carga son FICTICIOS. El padron real
 * (Alumnos_a_ingresar_*.xlsx) contiene datos personales de alumnos y por eso
 * no se versiona: se carga aparte con `npm run import:alumnos -- <ruta>` o
 * desde el panel de admin.
 */
import { hashearPassword } from "../src/lib/auth/password";
import { SqliteRepositorio } from "../src/lib/data/sqlite";
import { cerrarDb } from "../src/lib/data/sqlite/connection";
import { separarNombre } from "../src/lib/import/alumnos";

/**
 * Alumnos de prueba, con la misma forma "Apellido, Nombre" del Excel real.
 *
 * Los legajos van en el rango 99xxxxx, fuera del que usa el padron real
 * (1045322-1251210): si se solaparan, correr el seed sobre una base con el
 * padron cargado pisaria alumnos de verdad con datos ficticios.
 */
const ALUMNOS_DEMO = [
  "9900001|Alvarez Prat, Camila Ines",
  "9900002|Benitez, Joaquin",
  "9900003|Cabrera Ledesma, Martina Sol",
  "9900004|D'Angelo, Lorenzo",
  "9900005|Escobar, Valentina",
  "9900006|Fernandez Rios, Tomas Agustin",
  "9900007|Gimenez, Delfina Paz",
  "9900008|Herrera Nunez, Bautista",
  "9900009|Ibarra, Micaela Belen",
  "9900010|Juarez Peralta, Santino",
  "9900011|Ledesma, Abril Guadalupe",
  "9900012|Molina Vega, Franco Nicolas",
];

const MOTIVOS_DEMO = [
  { descripcion: "Certificado medico", orden: 10 },
  { descripcion: "Superposicion con examen de otra carrera", orden: 20 },
  { descripcion: "Motivo laboral certificado", orden: 30 },
  { descripcion: "Fallecimiento de familiar directo", orden: 40 },
  { descripcion: "Residencia fuera de la ciudad", orden: 50 },
  { descripcion: "Otro (detallar en observaciones)", orden: 90 },
];

/** Devuelve `YYYY-MM-DD` sumando dias a hoy. */
function enDias(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const FECHAS_DEMO = [
  { fecha: enDias(14), cupo: 60 },
  { fecha: enDias(28), cupo: 60 },
  { fecha: enDias(45), cupo: null },
];

async function main(): Promise<void> {
  const repo = new SqliteRepositorio();
  await repo.migrar();

  // --- Usuarios ---------------------------------------------------------
  // Credenciales iniciales acordadas con el departamento. Se guardan
  // hasheadas con scrypt; el texto plano solo existe aca y en el README, y
  // deben cambiarse antes de usar el sistema en produccion.
  const usuarios = [
    { usuario: "Aromero", nombre: "A. Romero", rol: "admin" as const, password: "LordAlan" },
    { usuario: "Mfernandez", nombre: "M. Fernandez", rol: "operador" as const, password: "SIA2026" },
  ];

  for (const datos of usuarios) {
    const existente = await repo.buscarUsuarioPorNombre(datos.usuario);
    if (existente) {
      console.log(`  usuario ${datos.usuario} ya existe, se omite`);
      continue;
    }
    await repo.crearUsuario({
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      passwordHash: await hashearPassword(datos.password),
      activo: true,
    });
    console.log(`  usuario ${datos.usuario} (${datos.rol}) creado`);
  }

  // --- Motivos ----------------------------------------------------------
  const motivosExistentes = await repo.listarMotivos(false);
  const descripciones = new Set(motivosExistentes.map((m) => m.descripcion.toLowerCase()));
  for (const motivo of MOTIVOS_DEMO) {
    if (descripciones.has(motivo.descripcion.toLowerCase())) continue;
    await repo.crearMotivo({ ...motivo, activo: true });
    console.log(`  motivo "${motivo.descripcion}" creado`);
  }

  // --- Fechas de recuperatorio -----------------------------------------
  const fechasExistentes = await repo.listarFechas({ soloActivas: false, soloFuturas: false });
  const dias = new Set(fechasExistentes.map((f) => f.fecha));
  for (const fecha of FECHAS_DEMO) {
    if (dias.has(fecha.fecha)) continue;
    await repo.crearFecha({ ...fecha, activo: true });
    console.log(`  fecha ${fecha.fecha} creada`);
  }

  // --- Alumnos de prueba ------------------------------------------------
  const alumnos = ALUMNOS_DEMO.map((linea) => {
    const [legajo, nombreCompleto] = linea.split("|") as [string, string];
    return { legajo, nombreCompleto, ...separarNombre(nombreCompleto) };
  });
  const resultado = await repo.importarAlumnos(alumnos);
  console.log(
    `  alumnos demo: ${resultado.insertados} nuevos, ${resultado.actualizados} actualizados, ${resultado.sinCambios} sin cambios`,
  );

  const total = await repo.contarAlumnos();
  console.log(`\nListo. Alumnos en el padron: ${total}`);
  console.log("Ingresar con:  Aromero / LordAlan  (admin)");
  console.log("               Mfernandez / SIA2026 (operador)");
  console.log("\nPara cargar el padron real:  npm run import:alumnos -- ruta/al/archivo.xlsx");

  cerrarDb();
}

main().catch((error) => {
  console.error("Fallo el seed:", error);
  process.exit(1);
});
