import "server-only";

/**
 * Contrato de storage de adjuntos.
 *
 * Mismo patron que la capa de datos: la aplicacion habla con esta interfaz
 * y no con el filesystem ni con Supabase Storage. Hoy la implementa
 * `LocalStorage` (disco del servidor); cuando Supabase salga de stand by se
 * agrega `SupabaseStorage` usando un bucket PRIVADO y `createSignedUrl` con
 * TTL corto, y se cambia `STORAGE_ADAPTER`.
 *
 * Regla que no cambia entre adaptadores: los PDF NUNCA son publicos. El
 * acceso pasa siempre por una ruta autenticada del servidor.
 */

export interface ArchivoGuardado {
  /** Ruta relativa dentro del storage. Es lo que se persiste en la ficha. */
  path: string;
  nombre: string;
  tamano: number;
}

export interface ArchivoLeido {
  contenido: Buffer;
  nombre: string;
  tipo: string;
}

export interface Storage {
  /** Guarda un PDF y devuelve la referencia a persistir. */
  guardar(archivo: File, prefijo: string): Promise<ArchivoGuardado>;
  /** Lee un archivo por su path. `null` si no existe. */
  leer(path: string): Promise<ArchivoLeido | null>;
  /** Borra un archivo. No falla si ya no esta. */
  eliminar(path: string): Promise<void>;
}

import { LocalStorage } from "./local";

export type AdaptadorStorage = "local" | "supabase";

const cache = globalThis as unknown as { __crmStorage?: Storage };

export function obtenerStorage(): Storage {
  if (cache.__crmStorage) return cache.__crmStorage;

  const adaptador = (process.env.STORAGE_ADAPTER ?? "local") as AdaptadorStorage;

  switch (adaptador) {
    case "local":
      cache.__crmStorage = new LocalStorage();
      break;
    case "supabase":
      throw new Error(
        "El storage de Supabase todavia no esta implementado (ver src/lib/data/supabase/index.ts). " +
          "Mientras tanto usa STORAGE_ADAPTER=local.",
      );
    default:
      throw new Error(`STORAGE_ADAPTER desconocido: "${adaptador}". Valores validos: local, supabase.`);
  }

  return cache.__crmStorage;
}
