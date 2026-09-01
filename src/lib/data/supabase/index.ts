/**
 * Adaptador Supabase — PENDIENTE (stand by por decision del proyecto).
 *
 * Este archivo documenta como conectar Supabase cuando se decida activarlo.
 * NO esta implementado a proposito: la aplicacion corre hoy contra SQLite y
 * el swap es exactamente esto y nada mas.
 *
 * Pasos para activarlo:
 *
 *  1. `npm install @supabase/supabase-js @supabase/ssr`
 *
 *  2. Aplicar /supabase/migrations/0001_esquema_inicial.sql en el proyecto
 *     Supabase (con la CLI: `supabase db push`). Ese archivo ya trae el
 *     esquema Postgres, las politicas RLS y el bucket privado.
 *
 *  3. Implementar `class SupabaseRepositorio implements Repositorio` con la
 *     misma semantica que `SqliteRepositorio`. Cosas a tener en cuenta:
 *
 *     - `numero` de ficha: en Postgres usar una SEQUENCE (ya definida en la
 *       migracion) en vez de `max(numero) + 1`, que no es seguro con
 *       concurrencia real.
 *     - Cupo y duplicados: mover la validacion a una funcion Postgres o a
 *       constraints, para que dos operadores simultaneos no pasen el cupo.
 *       La migracion ya incluye el indice unico parcial de duplicados.
 *     - Las operaciones de escritura deben usar la service role key desde el
 *       servidor; las de lectura, el cliente con la sesion del usuario para
 *       que RLS aplique de verdad.
 *
 *  4. Implementar el `Storage` equivalente en src/lib/storage/supabase.ts
 *     usando `createSignedUrl` con TTL corto (ver src/lib/storage/index.ts).
 *
 *  5. Setear `DATA_ADAPTER=supabase` y `STORAGE_ADAPTER=supabase`, y sumar
 *     el caso al switch de src/lib/data/index.ts.
 *
 * La interfaz completa a cumplir esta en src/lib/data/repository.ts.
 */

export {};
