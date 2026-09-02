/**
 * Adaptador de datos para Supabase.
 *
 * La implementacion vive en `../postgres/`: se conecta directo a la base
 * Postgres del proyecto de Supabase (con transacciones reales), en vez de
 * pasar por la API REST (PostgREST) que expone el cliente `supabase-js`.
 * Es la misma base de datos —el mismo proyecto de Supabase— por otra
 * puerta: la que permite usar `BEGIN`/`COMMIT` como lo hace el adaptador
 * SQLite, en vez de reconstruir esa logica arriba de llamadas REST
 * independientes. Ver docs/supabase.md para la puesta en marcha completa.
 */

export { PostgresRepositorio as SupabaseRepositorio } from "../postgres";
