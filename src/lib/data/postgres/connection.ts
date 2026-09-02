import { Pool, type PoolClient } from "pg";
import { types } from "pg";

/**
 * Conexion a Postgres para el adaptador de Supabase.
 *
 * Se conecta directo a la base Postgres del proyecto (con la connection
 * string de Project Settings -> Database, o construida a partir de
 * SUPABASE_DB_* ), no a traves de la API REST de Supabase. Esto permite usar
 * transacciones reales (BEGIN/COMMIT), igual que el adaptador SQLite, en vez
 * de pelear con el query builder de PostgREST para algo tan central como el
 * alta de una ficha.
 *
 * Sin `server-only`: igual que el adaptador SQLite, los scripts de CLI
 * (import-alumnos, etc.) necesitan poder importar este modulo directo,
 * fuera del bundler de Next. La barrera real contra el bundle de cliente es
 * que ninguna pagina importa esto directo, solo a traves del factory de
 * src/lib/data/index.ts (que si tiene `server-only`), y que `pg` esta
 * declarado en next.config.ts como paquete externo del servidor.
 */

// Ajustes de parseo de columnas, para que los valores salgan con la misma
// forma que usa el resto de la aplicacion (ver src/lib/utils/fechas.ts):
//
//  - `date` (OID 1082): por defecto `pg` lo convierte a un objeto `Date`, que
//    es exactamente el error que el resto del codigo evita a proposito
//    (`new Date("2026-03-14")` se interpreta en UTC y en Argentina se
//    muestra un dia antes). Se deja tal cual como texto `YYYY-MM-DD`.
//  - `int8`/`bigint` (OID 20): `pg` los devuelve como string por defecto,
//    porque en JS un numero no representa todo el rango de un bigint. Los
//    tamanos de archivo de este sistema nunca se acercan a ese limite, asi
//    que se convierten a `number` para que calcen con el tipo de dominio.
types.setTypeParser(1082, (valor) => valor);
types.setTypeParser(20, (valor) => Number(valor));

const cache = globalThis as unknown as { __crmPgPool?: Pool };

function connectionString(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "Falta SUPABASE_DB_URL. Es la cadena de conexion de Project Settings -> " +
        "Database -> Connection string (modo \"URI\") del proyecto de Supabase.",
    );
  }
  return url;
}

export function obtenerPool(): Pool {
  if (cache.__crmPgPool) return cache.__crmPgPool;

  cache.__crmPgPool = new Pool({
    connectionString: connectionString(),
    // Supabase exige TLS; en Postgres administrado no hace falta validar la
    // cadena de certificados contra una CA local.
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  return cache.__crmPgPool;
}

/**
 * Corre `fn` dentro de una transaccion: BEGIN, la funcion, COMMIT si todo
 * sale bien o ROLLBACK si algo lanza. El cliente siempre se libera al final,
 * incluso si `fn` lanza.
 */
export async function conTransaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {
      /* si el rollback falla, se prioriza el error original */
    });
    throw error;
  } finally {
    cliente.release();
  }
}
