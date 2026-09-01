/**
 * Borra la base local y los adjuntos. Solo para desarrollo.
 * Uso: npm run db:reset
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("db:reset no se puede correr con NODE_ENV=production.");
  process.exit(1);
}

const rutaDb = process.env.SQLITE_PATH ?? join(process.cwd(), "data", "crm-excepciones.db");
const rutaStorage = process.env.STORAGE_PATH ?? join(process.cwd(), "storage", "adjuntos");

// WAL deja tambien -wal y -shm al lado del archivo principal.
for (const archivo of [rutaDb, `${rutaDb}-wal`, `${rutaDb}-shm`]) {
  rmSync(archivo, { force: true });
}
rmSync(rutaStorage, { recursive: true, force: true });

console.log("Base y adjuntos eliminados.");
console.log("Corre `npm run db:seed` para volver a cargar los datos de prueba.");
