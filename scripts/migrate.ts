/**
 * Crea (o actualiza) el esquema de la base local.
 * Uso: npm run db:migrate
 */
import { aplicarEsquema, cerrarDb, obtenerDb } from "../src/lib/data/sqlite/connection";

function main(): void {
  const db = obtenerDb();
  aplicarEsquema(db);
  const tablas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];

  console.log(`Esquema aplicado en: ${db.name}`);
  console.log(`Tablas: ${tablas.map((t) => t.name).join(", ")}`);
  cerrarDb();
}

main();
