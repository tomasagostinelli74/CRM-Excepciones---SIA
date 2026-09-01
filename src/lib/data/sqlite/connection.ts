import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { ESQUEMA_SQLITE } from "./schema";

/**
 * Conexion SQLite unica por proceso.
 *
 * En desarrollo Next recarga los modulos con cada cambio, asi que la
 * instancia se cachea en `globalThis` para no abrir un handle nuevo por
 * recarga (y no volver a correr el esquema en cada una).
 */

const RUTA_POR_DEFECTO = join(process.cwd(), "data", "crm-excepciones.db");

interface CacheGlobal {
  db?: Database.Database;
}

const cache = globalThis as unknown as { __crmSqlite?: CacheGlobal };
cache.__crmSqlite ??= {};

export function obtenerDb(): Database.Database {
  const existente = cache.__crmSqlite!.db;
  if (existente && existente.open) return existente;

  const ruta = process.env.SQLITE_PATH ?? RUTA_POR_DEFECTO;
  mkdirSync(dirname(ruta), { recursive: true });

  const db = new Database(ruta);
  // WAL permite lecturas concurrentes mientras se escribe: importante para
  // el listado de fichas mientras otro operador esta cargando una.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Espera hasta 5 s si otra escritura tiene el lock, en vez de fallar.
  db.pragma("busy_timeout = 5000");

  aplicarEsquema(db);

  cache.__crmSqlite!.db = db;
  return db;
}

/** Aplica el esquema. Idempotente: todo es CREATE ... IF NOT EXISTS. */
export function aplicarEsquema(db: Database.Database): void {
  db.exec(ESQUEMA_SQLITE);
}

/** Cierra la conexion. Solo lo usan los scripts de CLI. */
export function cerrarDb(): void {
  const db = cache.__crmSqlite?.db;
  if (db?.open) db.close();
  if (cache.__crmSqlite) cache.__crmSqlite.db = undefined;
}
