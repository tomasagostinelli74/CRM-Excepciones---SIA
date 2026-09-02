-- ===========================================================================
-- PEGAR ESTE ARCHIVO ENTERO EN EL SQL EDITOR DE SUPABASE Y APRETAR "RUN".
--
-- Es la union de los archivos de supabase/migrations/, en el orden en que
-- tienen que aplicarse. Se genera con este mismo script (ver el comentario
-- al final); si alguna vez se agrega una migracion nueva a esa carpeta,
-- hay que volver a generarlo.
--
-- Es seguro correrlo mas de una vez: todo esta escrito para no romper nada
-- si ya se habia corrido antes.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Origen: supabase/migrations/20260101000000_esquema_inicial.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Sistema de fichas de excepcion a examen de ingreso
-- Esquema para Supabase (Postgres): tablas, triggers de negocio y RLS.
--
-- Se puede pegar entero en el SQL Editor de Supabase y ejecutar (Run). Es
-- idempotente: correrlo dos veces no rompe nada.
--
-- Modelo de acceso: la aplicacion es 100% server-side (paginas y Server
-- Actions de Next.js). El navegador del operador NUNCA habla directo con
-- Supabase; el unico que lo hace es el servidor de la app, con la
-- "service role key" (una clave secreta que ignora RLS por diseno). Por
-- eso las tablas quedan con RLS activado y SIN politicas permisivas: nada
-- es alcanzable salvo con esa clave, que nunca sale del servidor. La
-- autenticacion de las personas (usuario/contrasena, roles admin/operador)
-- la resuelve la aplicacion misma, en la tabla `usuarios` de aqui abajo,
-- exactamente igual que en la version de prueba con SQLite.
-- ===========================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- busqueda de alumnos por subcadena

-- ---------------------------------------------------------------------------
-- Alumnos: padron importado del Excel del sistema academico.
-- ---------------------------------------------------------------------------
create table if not exists public.alumnos (
  legajo          text primary key,
  apellido        text not null,
  nombre          text not null,
  nombre_completo text not null,
  busqueda        text not null,   -- sin acentos ni mayusculas, para buscar
  actualizado_en  timestamptz not null default now()
);

create index if not exists idx_alumnos_busqueda
  on public.alumnos using gin (busqueda gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Usuarios del sistema (no es Supabase Auth: la aplicacion maneja su propio
-- login, con la contrasena hasheada en `password_hash`).
-- ---------------------------------------------------------------------------
create table if not exists public.usuarios (
  id            uuid primary key default gen_random_uuid(),
  usuario       text not null,
  nombre        text not null,
  rol           text not null check (rol in ('admin', 'operador')),
  password_hash text not null,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create unique index if not exists idx_usuarios_usuario on public.usuarios (lower(usuario));

-- ---------------------------------------------------------------------------
-- Motivos de excepcion.
-- ---------------------------------------------------------------------------
create table if not exists public.motivos_excepcion (
  id          uuid primary key default gen_random_uuid(),
  descripcion text not null,
  activo      boolean not null default true,
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);

create unique index if not exists idx_motivos_descripcion
  on public.motivos_excepcion (lower(descripcion));

-- ---------------------------------------------------------------------------
-- Fechas de recuperatorio.
-- ---------------------------------------------------------------------------
create table if not exists public.fechas_recuperatorio (
  id        uuid primary key default gen_random_uuid(),
  fecha     date not null unique,
  cupo      integer check (cupo is null or cupo > 0),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fichas de excepcion.
--
-- `numero` sale de una secuencia y no de max(numero)+1: con dos operadores
-- cargando al mismo tiempo, el max() puede devolver el mismo valor a ambos.
-- ---------------------------------------------------------------------------
create sequence if not exists public.fichas_numero_seq as integer start 1;

create table if not exists public.fichas_excepcion (
  id                     uuid primary key default gen_random_uuid(),
  numero                 integer not null unique
                           default nextval('public.fichas_numero_seq'),
  legajo                 text not null references public.alumnos (legajo),
  motivo_id              uuid not null references public.motivos_excepcion (id),
  fecha_recuperatorio_id uuid not null references public.fechas_recuperatorio (id),
  archivo_path           text not null,
  archivo_nombre         text not null,
  archivo_tamano         bigint not null check (archivo_tamano > 0),
  observaciones          text,
  estado                 text not null default 'vigente'
                           check (estado in ('vigente', 'anulada')),
  motivo_anulacion       text,
  anulada_en             timestamptz,
  anulada_por            uuid references public.usuarios (id),
  creado_por             uuid not null references public.usuarios (id),
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),

  -- Una ficha anulada tiene que decir por que y quien la anulo.
  constraint anulacion_completa check (
    estado = 'vigente'
    or (motivo_anulacion is not null and anulada_en is not null and anulada_por is not null)
  )
);

create index if not exists idx_fichas_legajo    on public.fichas_excepcion (legajo);
create index if not exists idx_fichas_motivo    on public.fichas_excepcion (motivo_id);
create index if not exists idx_fichas_fecha_rec on public.fichas_excepcion (fecha_recuperatorio_id);
create index if not exists idx_fichas_creado_en on public.fichas_excepcion (creado_en desc);
create index if not exists idx_fichas_estado    on public.fichas_excepcion (estado);

-- Un alumno no puede tener dos fichas vigentes para la misma fecha. El
-- indice unico parcial lo garantiza a nivel base, sin depender de que la
-- aplicacion se acuerde de chequearlo.
create unique index if not exists idx_fichas_alumno_fecha_vigente
  on public.fichas_excepcion (legajo, fecha_recuperatorio_id)
  where estado = 'vigente';

-- `actualizado_en` se mantiene solo.
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_fichas_actualizado_en on public.fichas_excepcion;
create trigger trg_fichas_actualizado_en
  before update on public.fichas_excepcion
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- Control de cupo, dentro de la base.
--
-- Va en un trigger y no solo en la aplicacion: dos operadores cargando a la
-- vez pueden pasar ambos la validacion del servidor y superar el cupo. Aca
-- la comprobacion queda serializada por la base (`for update` bloquea la
-- fila de la fecha mientras se cuenta).
-- ---------------------------------------------------------------------------
create or replace function public.verificar_cupo_fecha()
returns trigger
language plpgsql
as $$
declare
  limite   integer;
  ocupadas integer;
begin
  if new.estado <> 'vigente' then
    return new;
  end if;

  select f.cupo into limite
    from public.fechas_recuperatorio f
   where f.id = new.fecha_recuperatorio_id
   for update;

  if limite is null then
    return new;
  end if;

  select count(*) into ocupadas
    from public.fichas_excepcion fe
   where fe.fecha_recuperatorio_id = new.fecha_recuperatorio_id
     and fe.estado = 'vigente'
     and fe.id <> new.id;

  if ocupadas >= limite then
    raise exception 'La fecha seleccionada ya cubrió su cupo de % alumno(s).', limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fichas_cupo on public.fichas_excepcion;
create trigger trg_fichas_cupo
  before insert or update of fecha_recuperatorio_id, estado on public.fichas_excepcion
  for each row execute function public.verificar_cupo_fecha();

-- ---------------------------------------------------------------------------
-- Auditoria.
-- ---------------------------------------------------------------------------
create table if not exists public.auditoria (
  id         uuid primary key default gen_random_uuid(),
  entidad    text not null,
  entidad_id text not null,
  accion     text not null,
  detalle    text,
  usuario_id uuid references public.usuarios (id),
  creado_en  timestamptz not null default now()
);

create index if not exists idx_auditoria_entidad
  on public.auditoria (entidad_id, creado_en desc);

-- ===========================================================================
-- Row Level Security: activado en todas las tablas, sin ninguna politica.
--
-- Sin una politica que lo permita explicitamente, nadie que use la clave
-- publica (`anon`) lee ni escribe una fila. La aplicacion no usa esa clave:
-- usa la "service role key" desde el servidor, que ignora RLS por diseno de
-- Supabase. Esto es intencional y es la configuracion mas segura para una
-- app 100% server-side: aunque alguien obtuviera la URL del proyecto y la
-- clave publica, no vería ni una fila.
-- ===========================================================================
alter table public.usuarios             enable row level security;
alter table public.alumnos              enable row level security;
alter table public.motivos_excepcion    enable row level security;
alter table public.fechas_recuperatorio enable row level security;
alter table public.fichas_excepcion     enable row level security;
alter table public.auditoria            enable row level security;

-- ---------------------------------------------------------------------------
-- Origen: supabase/migrations/20260101000100_seed_configuracion.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Datos iniciales: usuarios, motivos y fechas de ejemplo.
--
-- Se puede pegar y correr junto con el archivo anterior, o por separado
-- despues. Es idempotente: correrlo de nuevo no duplica nada.
--
-- NO incluye el padron de alumnos: son datos personales y se cargan aparte,
-- desde el panel de administracion (/admin/alumnos) una vez que el sistema
-- esta publicado.
-- ===========================================================================

-- --- Usuarios iniciales -----------------------------------------------------
-- Contrasenas ya hasheadas con scrypt (nunca se guarda texto plano). Son
-- credenciales de arranque: cambialas desde /admin/usuarios apenas entres.
--   Aromero    / LordAlan  (administrador)
--   Mfernandez / SIA2026   (operador)
insert into public.usuarios (usuario, nombre, rol, password_hash, activo) values
  ('Aromero', 'A. Romero', 'admin',
   'scrypt$16384$8$1$c7d46fb7743719eabf0b10cf9a646ac0$4bbcbe96e2be2105453cbaf63587758afeb778abe3195e7fe0aefec7c4ec22a5c482942657463f0d6ff34d6a265ae3a60a1f40a2c3df2c6f0ba4fbb9dc5e8d89',
   true),
  ('Mfernandez', 'M. Fernandez', 'operador',
   'scrypt$16384$8$1$69d7c6398d4c0cc4311a7fe117a7cc13$f4b95b11c0e53ca2d02d8be44b250b758abba4722154b337d465f6719864d2177a10221db5fdd1b7795435b9f4f8a1922aad9625888044d799616ec930fefbcb',
   true)
on conflict (lower(usuario)) do nothing;

-- --- Motivos de excepcion ----------------------------------------------------
insert into public.motivos_excepcion (descripcion, orden, activo) values
  ('Certificado medico',                        10, true),
  ('Superposicion con examen de otra carrera',  20, true),
  ('Motivo laboral certificado',                30, true),
  ('Fallecimiento de familiar directo',         40, true),
  ('Residencia fuera de la ciudad',             50, true),
  ('Otro (detallar en observaciones)',          90, true)
on conflict (lower(descripcion)) do nothing;

-- --- Fechas de recuperatorio de ejemplo -------------------------------------
insert into public.fechas_recuperatorio (fecha, cupo, activo) values
  (current_date + interval '14 days', 60,   true),
  (current_date + interval '28 days', 60,   true),
  (current_date + interval '45 days', null, true)
on conflict (fecha) do nothing;

-- ---------------------------------------------------------------------------
-- Origen: supabase/migrations/20260101000200_storage_adjuntos.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Storage: bucket PRIVADO para los comprobantes PDF.
--
-- `public = false` es lo que hace que no exista una URL publica al PDF: el
-- unico acceso es a traves del servidor de la aplicacion (que usa la
-- service role key, igual que con las tablas). No se agregan politicas de
-- storage.objects por el mismo motivo que en las tablas: nadie mas que el
-- servidor toca este bucket.
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos-fichas', 'adjuntos-fichas', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

