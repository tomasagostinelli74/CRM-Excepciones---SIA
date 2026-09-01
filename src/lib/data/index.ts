import "server-only";

import type { Repositorio } from "./repository";
import { SqliteRepositorio } from "./sqlite";

/**
 * Punto unico de acceso a los datos.
 *
 * Toda la aplicacion pide el repositorio por aca. Cambiar de motor es
 * cambiar `DATA_ADAPTER` y agregar el caso en el switch: ninguna pagina ni
 * Server Action necesita enterarse.
 */

export type AdaptadorDatos = "sqlite" | "supabase";

const cache = globalThis as unknown as { __crmRepo?: Repositorio };

export function obtenerRepositorio(): Repositorio {
  if (cache.__crmRepo) return cache.__crmRepo;

  const adaptador = (process.env.DATA_ADAPTER ?? "sqlite") as AdaptadorDatos;

  switch (adaptador) {
    case "sqlite":
      cache.__crmRepo = new SqliteRepositorio();
      break;
    case "supabase":
      throw new Error(
        "El adaptador Supabase todavia no esta implementado. " +
          "Ver src/lib/data/supabase/index.ts y docs/supabase.md. " +
          "Mientras tanto usa DATA_ADAPTER=sqlite.",
      );
    default:
      throw new Error(`DATA_ADAPTER desconocido: "${adaptador}". Valores validos: sqlite, supabase.`);
  }

  return cache.__crmRepo;
}

export type { Repositorio } from "./repository";
