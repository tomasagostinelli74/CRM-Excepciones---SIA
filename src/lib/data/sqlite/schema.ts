/**
 * Esquema SQLite del sistema de fichas de excepcion.
 *
 * Va inline como string y no como archivo .sql leido en runtime: el bundle
 * de produccion de Next no incluye archivos sueltos, y leerlo desde
 * `process.cwd()` funcionaria en dev pero fallaria al desplegar.
 *
 * Es el espejo local del esquema Postgres de /supabase/migrations.
 * Todo es CREATE ... IF NOT EXISTS, asi que aplicarlo es idempotente.
 */

export const ESQUEMA_SQLITE = `
-- Esquema SQLite del sistema de fichas de excepcion.
--
-- Es el espejo local del esquema Postgres que vive en /supabase/migrations.
-- Se aplica de forma idempotente al arrancar (ver ./connection.ts).

PRAGMA foreign_keys = ON;

-- Alumnos inscriptos: fuente de verdad para validar la LU / legajo.
CREATE TABLE IF NOT EXISTS alumnos (
  legajo          TEXT PRIMARY KEY,
  apellido        TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  -- "Apellido, Nombre" canonico, con espacios ya saneados.
  nombre_completo TEXT NOT NULL,
  -- Version sin acentos y en minusculas, para buscar sin diacriticos.
  busqueda        TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alumnos_busqueda ON alumnos (busqueda);

-- Motivos de excepcion, administrables desde el panel de admin.
CREATE TABLE IF NOT EXISTS motivos_excepcion (
  id          TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  orden       INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_motivos_descripcion
  ON motivos_excepcion (lower(descripcion));

-- Fechas de recuperatorio ofrecidas al alumno.
CREATE TABLE IF NOT EXISTS fechas_recuperatorio (
  id        TEXT PRIMARY KEY,
  fecha     TEXT NOT NULL,          -- YYYY-MM-DD
  cupo      INTEGER,                -- NULL = sin limite
  activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fechas_fecha ON fechas_recuperatorio (fecha);

-- Usuarios del sistema. Reemplazable por auth.users + perfiles en Supabase.
CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT PRIMARY KEY,
  usuario       TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin', 'operador')),
  password_hash TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en     TEXT NOT NULL
);

-- El nombre de usuario es unico sin distinguir mayusculas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios (lower(usuario));

-- Fichas de excepcion: el registro central.
CREATE TABLE IF NOT EXISTS fichas_excepcion (
  id                     TEXT PRIMARY KEY,
  numero                 INTEGER NOT NULL,
  legajo                 TEXT NOT NULL REFERENCES alumnos (legajo),
  motivo_id              TEXT NOT NULL REFERENCES motivos_excepcion (id),
  fecha_recuperatorio_id TEXT NOT NULL REFERENCES fechas_recuperatorio (id),
  archivo_path           TEXT NOT NULL,
  archivo_nombre         TEXT NOT NULL,
  archivo_tamano         INTEGER NOT NULL,
  observaciones          TEXT,
  estado                 TEXT NOT NULL DEFAULT 'vigente'
                           CHECK (estado IN ('vigente', 'anulada')),
  motivo_anulacion       TEXT,
  anulada_en             TEXT,
  anulada_por            TEXT REFERENCES usuarios (id),
  creado_por             TEXT NOT NULL REFERENCES usuarios (id),
  creado_en              TEXT NOT NULL,
  actualizado_en         TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fichas_numero ON fichas_excepcion (numero);
CREATE INDEX IF NOT EXISTS idx_fichas_legajo ON fichas_excepcion (legajo);
CREATE INDEX IF NOT EXISTS idx_fichas_motivo ON fichas_excepcion (motivo_id);
CREATE INDEX IF NOT EXISTS idx_fichas_fecha_rec ON fichas_excepcion (fecha_recuperatorio_id);
CREATE INDEX IF NOT EXISTS idx_fichas_creado_en ON fichas_excepcion (creado_en);
CREATE INDEX IF NOT EXISTS idx_fichas_estado ON fichas_excepcion (estado);

-- Un alumno no puede tener dos fichas vigentes para la misma fecha.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fichas_alumno_fecha_vigente
  ON fichas_excepcion (legajo, fecha_recuperatorio_id)
  WHERE estado = 'vigente';

-- Registro de auditoria de acciones sensibles.
CREATE TABLE IF NOT EXISTS auditoria (
  id         TEXT PRIMARY KEY,
  entidad    TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  accion     TEXT NOT NULL,
  detalle    TEXT,
  usuario_id TEXT REFERENCES usuarios (id),
  creado_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria (entidad_id, creado_en);
`;
