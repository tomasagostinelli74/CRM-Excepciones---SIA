# Activar Supabase (hoy en stand by)

La aplicacion corre contra SQLite y disco local. Todo lo necesario para pasar
a Supabase ya esta escrito o preparado; este documento es el procedimiento.

El diseno esta hecho para que el cambio sea **un adaptador nuevo, no una
reescritura**: ninguna pagina, Server Action ni componente conoce SQLite.
Todos hablan con la interfaz `Repositorio`
(`src/lib/data/repository.ts`) y con `Storage` (`src/lib/storage/index.ts`).

## 1. Crear el proyecto

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Anotar de **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**secreta**: solo servidor,
     nunca en una variable `NEXT_PUBLIC_`)

## 2. Aplicar las migraciones

```bash
npm install -g supabase        # si no esta instalada la CLI
supabase link --project-ref <ref-del-proyecto>
supabase db push
```

Eso aplica `supabase/migrations/`, que crea:

- las tablas (`perfiles`, `alumnos`, `motivos_excepcion`,
  `fechas_recuperatorio`, `fichas_excepcion`, `auditoria`),
- las politicas **RLS** de cada una,
- el bucket **privado** `adjuntos-fichas` con sus politicas,
- el trigger de **cupo** y el indice unico de **duplicados**.

Dos diferencias a favor respecto de la version SQLite: el numero de ficha sale
de una `SEQUENCE` (seguro con concurrencia real) y el cupo se verifica dentro
de la base con `for update`, de modo que dos operadores simultaneos no lo
puedan superar.

## 3. Crear el primer administrador

Supabase Auth maneja la identidad; `perfiles` guarda el rol.

1. **Authentication → Users → Add user** y crear el usuario con su email.
2. Copiar su `id` (uuid) y correr en el SQL Editor:

```sql
insert into public.perfiles (id, usuario, nombre, rol, activo)
values ('<uuid-del-usuario>', 'Aromero', 'A. Romero', 'admin', true);
```

Desde ahi, ese admin da de alta al resto desde `/admin/usuarios`.

## 4. Implementar los adaptadores

Son los dos unicos archivos por escribir:

**`src/lib/data/supabase/index.ts`** — `class SupabaseRepositorio implements Repositorio`.
La interfaz completa esta en `src/lib/data/repository.ts` y el adaptador
SQLite (`src/lib/data/sqlite/index.ts`) sirve de referencia de la semantica
esperada. Puntos a mirar:

- Las validaciones de cupo y duplicado ya viven en la base (trigger + indice
  unico). El adaptador tiene que **traducir esos errores de Postgres** a
  `ErrorConflicto` con mensaje en espanol, como hace hoy `traducirUnicidad`.
- Para las lecturas conviene el cliente con la sesion del usuario, para que
  RLS realmente se aplique. La `service_role` ignora RLS por diseno: dejarla
  solo para el import masivo del padron.
- `importarAlumnos` deberia usar `upsert` por lotes (~500 filas); son ~2000
  registros por archivo.

**`src/lib/storage/supabase.ts`** — `class SupabaseStorage implements Storage`.
El bucket es privado, asi que `leer()` no devuelve una URL publica sino que
descarga el objeto, o bien se agrega un metodo que genere
`createSignedUrl(path, 60)` y se redirige a esa URL desde
`/api/fichas/[id]/archivo`. La ruta ya valida la sesion antes de dar acceso.

Despues, sumar el caso `supabase` al `switch` de `src/lib/data/index.ts` y al
de `src/lib/storage/index.ts`.

## 5. Variables de entorno

```bash
DATA_ADAPTER=supabase
STORAGE_ADAPTER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=adjuntos-fichas
```

## 6. Migrar los datos que ya esten cargados

Si para entonces el sistema ya se uso con SQLite, hay que mover alumnos,
motivos, fechas, fichas y los PDF. El padron se puede recargar simplemente
volviendo a importar el Excel; las fichas y sus adjuntos requieren un script
de migracion puntual.

## Por que la aplicacion sigue sirviendo mientras tanto

La autenticacion propia (`src/lib/auth/`) usa scrypt y cookies firmadas con
HMAC, y expone la misma funcion `usuarioActual()` que consumira el helper de
`@supabase/ssr`. Los roles `admin` / `operador` y los guards de servidor ya
estan, asi que el cambio de proveedor de identidad no toca las pantallas.
