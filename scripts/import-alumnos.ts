/**
 * Importa el padron de alumnos desde un .xlsx por linea de comandos.
 * Uso: npm run import:alumnos -- ruta/al/Alumnos_a_ingresar.xlsx
 *
 * Hace lo mismo que el panel de admin; existe para cargas grandes o
 * automatizables sin pasar por el navegador.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SqliteRepositorio } from "../src/lib/data/sqlite";
import { cerrarDb } from "../src/lib/data/sqlite/connection";
import { parsearExcelAlumnos } from "../src/lib/import/alumnos";

async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("Falta la ruta del archivo.");
    console.error("Uso: npm run import:alumnos -- ruta/al/archivo.xlsx");
    process.exit(1);
  }

  const absoluta = resolve(ruta);
  console.log(`Leyendo ${absoluta} ...`);
  const buffer = await readFile(absoluta);

  const parseo = await parsearExcelAlumnos(buffer);
  console.log(`  filas con datos:     ${parseo.totalFilas}`);
  console.log(`  alumnos validos:     ${parseo.alumnos.length}`);
  console.log(`  filas rechazadas:    ${parseo.rechazadas.length}`);
  console.log(`  repetidos en archivo:${parseo.duplicadosEnArchivo.length}`);

  if (parseo.rechazadas.length > 0) {
    console.log("\n  Detalle de rechazadas (primeras 20):");
    for (const fila of parseo.rechazadas.slice(0, 20)) {
      console.log(`    fila ${fila.fila}: [${fila.legajo}] ${fila.valor} -> ${fila.motivo}`);
    }
  }

  const repo = new SqliteRepositorio();
  await repo.migrar();
  const resultado = await repo.importarAlumnos(parseo.alumnos);

  console.log(
    `\nImportacion terminada: ${resultado.insertados} nuevos, ` +
      `${resultado.actualizados} actualizados, ${resultado.sinCambios} sin cambios.`,
  );
  console.log(`Total de alumnos en el padron: ${await repo.contarAlumnos()}`);

  cerrarDb();
}

main().catch((error) => {
  console.error("Fallo la importacion:", error instanceof Error ? error.message : error);
  process.exit(1);
});
