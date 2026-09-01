-- ===========================================================================
-- Sistema de fichas de excepcion a examen de ingreso
-- Esquema inicial para Supabase (Postgres) + politicas RLS + bucket privado.
--
-- ESTADO: preparado, sin aplicar. El proyecto corre hoy contra SQLite
-- (DATA_ADAPTER=sqlite). Esta migracion es el destino cuando Supabase salga
-- de stand by; ver docs/supabase.md para el procedimiento completo.
--
-- Aplicar con:  supabase db push
-- ===========================================================================

-- gen_random_uuid() viene de pgcrypto (en Supabase suele estar ya activa).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Perfiles: extiende auth.users con el rol de la aplicacion.
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  usuario   text not null,
  nombre    text not null,
  rol       text not null check (rol in ('admin', 'operador')),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

create unique index if not exists idx_perfiles_usuario on public.perfiles (lower(usuario));

comment on table public.perfiles is
  'Rol de aplicacion de cada usuario. La identidad la maneja Supabase Auth.';

-- ---------------------------------------------------------------------------
-- Helpers de autorizacion.
--
-- SECURITY DEFINER a proposito: las politicas RLS de otras tablas necesitan
-- leer `perfiles`, y si esa lectura pasara por RLS se generaria recursion
-- infinita. `search_path` fijo evita que un search_path manipulado redirija
-- las consultas de la funcion a tablas de otro esquema.
-- ---------------------------------------------------------------------------
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.rol
    from public.perfiles p
   where p.id = auth.uid() and p.activo
   limit 1;
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() = 'admin', false);
$$;

create or replace function public.es_usuario_habilitado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rol_actual() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Alumnos: padron importado del Excel del sistema academico.
-- ---------------------------------------------------------------------------
create table if not exists public.alumnos (
  legajo          text primary key,
  apellido        text not null,
  nombre          text not null,
  nombre_completo text not null,
  -- Version sin acentos ni mayusculas, para buscar sin diacriticos.
  busqueda        text not null,
  actualizado_en  timestamptz not null default now()
);

create index if not exists idx_alumnos_busqueda
  on public.alumnos using gin (busqueda gin_trgm_ops);

-- pg_trgm habilita el indice de busqueda por subcadena de arriba.
create extension if not exists pg_trgm;

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
  anulada_por            uuid references public.perfiles (id),
  creado_por             uuid not null references public.perfiles (id),
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),

  -- Una ficha anulada tiene que decir por que y quien la anulo.
  constraint anulacion_completa check (
    estado = 'vigente'
    or (motivo_anulacion is not null and anulada_en is not null and anulada_por is not null)
  )
);

create index if not exists idx_fichas_legajo     on public.fichas_excepcion (legajo);
create index if not exists idx_fichas_motivo     on public.fichas_excepcion (motivo_id);
create index if not exists idx_fichas_fecha_rec  on public.fichas_excepcion (fecha_recuperatorio_id);
create index if not exists idx_fichas_creado_en  on public.fichas_excepcion (creado_en desc);
create index if not exists idx_fichas_estado     on public.fichas_excepcion (estado);

-- Un alumno no puede tener dos fichas vigentes para la misma fecha.
-- El indice unico parcial lo garantiza a nivel base: no depende de que la
-- aplicacion se acuerde de chequearlo.
create unique index if not exists idx_fichas_alumno_fecha_vigente
  on public.fichas_excepcion (legajo, fecha_recuperatorio_id)
  where estado = 'vigente';

-- `actualizado_en` se mantiene solo, para que ninguna ruta de escritura
-- pueda olvidarse de tocarlo.
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
-- Control de cupo.
--
-- Va en un trigger y no solo en la aplicacion: dos operadores cargando a la
-- vez pueden pasar ambos la validacion del servidor y superar el cupo. Aca la
-- comprobacion es serializada por la base.
-- ---------------------------------------------------------------------------
create or replace function public.verificar_cupo_fecha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limite    integer;
  ocupadas  integer;
begin
  if new.estado <> 'vigente' then
    return new;
  end if;

  select f.cupo into limite
    from public.fechas_recuperatorio f
   where f.id = new.fecha_recuperatorio_id
   for update;   -- serializa las cargas concurrentes sobre la misma fecha

  if limite is null then
    return new;
  end if;

  select count(*) into ocupadas
    from public.fichas_excepcion fe
   where fe.fecha_recuperatorio_id = new.fecha_recuperatorio_id
     and fe.estado = 'vigente'
     and fe.id <> new.id;

  if ocupadas >= limite then
    raise exception 'La fecha seleccionada ya cubrio su cupo de % alumno(s).', limite
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
  usuario_id uuid references public.perfiles (id),
  creado_en  timestamptz not null default now()
);

create index if not exists idx_auditoria_entidad
  on public.auditoria (entidad_id, creado_en desc);

-- ===========================================================================
-- Row Level Security
--
-- Se habilita en TODAS las tablas. Sin una politica que lo permita, nadie
-- lee ni escribe: el default es negar.
--
-- Nota: la service role key ignora RLS por diseno, asi que el servidor de la
-- aplicacion debe usar la clave anonima + la sesion del usuario para las
-- operaciones normales, y reservar la service role para tareas de
-- mantenimiento (por ejemplo, el import masivo del padron).
-- ===========================================================================

alter table public.perfiles             enable row level security;
alter table public.alumnos              enable row level security;
alter table public.motivos_excepcion    enable row level security;
alter table public.fechas_recuperatorio enable row level security;
alter table public.fichas_excepcion     enable row level security;
alter table public.auditoria            enable row level security;

-- --- Perfiles --------------------------------------------------------------
drop policy if exists perfiles_lectura_propia on public.perfiles;
create policy perfiles_lectura_propia on public.perfiles
  for select using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_admin_escribe on public.perfiles;
create policy perfiles_admin_escribe on public.perfiles
  for all using (public.es_admin()) with check (public.es_admin());

-- --- Alumnos: cualquiera habilitado consulta; solo admin modifica ----------
drop policy if exists alumnos_lectura on public.alumnos;
create policy alumnos_lectura on public.alumnos
  for select using (public.es_usuario_habilitado());

drop policy if exists alumnos_admin_escribe on public.alumnos;
create policy alumnos_admin_escribe on public.alumnos
  for all using (public.es_admin()) with check (public.es_admin());

-- --- Motivos: el operador solo lee; el admin administra -------------------
drop policy if exists motivos_lectura on public.motivos_excepcion;
create policy motivos_lectura on public.motivos_excepcion
  for select using (public.es_usuario_habilitado());

drop policy if exists motivos_admin_escribe on public.motivos_excepcion;
create policy motivos_admin_escribe on public.motivos_excepcion
  for all using (public.es_admin()) with check (public.es_admin());

-- --- Fechas: idem motivos -------------------------------------------------
drop policy if exists fechas_lectura on public.fechas_recuperatorio;
create policy fechas_lectura on public.fechas_recuperatorio
  for select using (public.es_usuario_habilitado());

drop policy if exists fechas_admin_escribe on public.fechas_recuperatorio;
create policy fechas_admin_escribe on public.fechas_recuperatorio
  for all using (public.es_admin()) with check (public.es_admin());

-- --- Fichas ---------------------------------------------------------------
drop policy if exists fichas_lectura on public.fichas_excepcion;
create policy fichas_lectura on public.fichas_excepcion
  for select using (public.es_usuario_habilitado());

-- Al insertar, `creado_por` tiene que ser el propio usuario: nadie puede
-- cargar una ficha a nombre de otro.
drop policy if exists fichas_insercion on public.fichas_excepcion;
create policy fichas_insercion on public.fichas_excepcion
  for insert with check (
    public.es_usuario_habilitado() and creado_por = auth.uid()
  );

drop policy if exists fichas_edicion on public.fichas_excepcion;
create policy fichas_edicion on public.fichas_excepcion
  for update using (public.es_usuario_habilitado())
  with check (public.es_usuario_habilitado());

-- No se define politica de DELETE: las fichas se anulan, nunca se borran.
-- Sin politica, RLS niega el borrado incluso para el admin.

-- --- Auditoria: se lee y se agrega; nunca se modifica ni se borra ---------
drop policy if exists auditoria_lectura on public.auditoria;
create policy auditoria_lectura on public.auditoria
  for select using (public.es_usuario_habilitado());

drop policy if exists auditoria_insercion on public.auditoria;
create policy auditoria_insercion on public.auditoria
  for insert with check (public.es_usuario_habilitado());

-- ===========================================================================
-- Storage: bucket PRIVADO para los comprobantes.
--
-- `public = false` es lo que hace que no exista una URL publica al PDF. El
-- acceso se da con createSignedUrl() de vida corta desde el servidor.
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos-fichas', 'adjuntos-fichas', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists adjuntos_lectura on storage.objects;
create policy adjuntos_lectura on storage.objects
  for select using (
    bucket_id = 'adjuntos-fichas' and public.es_usuario_habilitado()
  );

drop policy if exists adjuntos_subida on storage.objects;
create policy adjuntos_subida on storage.objects
  for insert with check (
    bucket_id = 'adjuntos-fichas' and public.es_usuario_habilitado()
  );

drop policy if exists adjuntos_borrado on storage.objects;
create policy adjuntos_borrado on storage.objects
  for delete using (
    bucket_id = 'adjuntos-fichas' and public.es_admin()
  );
