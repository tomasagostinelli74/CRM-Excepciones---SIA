/**
 * Entidades del dominio.
 *
 * Estos tipos son la moneda de cambio entre la capa de datos y la UI.
 * No dependen de ningun motor de base de datos: tanto el adaptador SQLite
 * como el futuro adaptador Supabase deben producir exactamente estas formas.
 *
 * Convenciones:
 *  - Los ids son `string` (uuid v4) para que el swap a Postgres/Supabase
 *    sea directo.
 *  - Las fechas de auditoria son ISO 8601 en UTC (`2026-03-14T12:00:00.000Z`).
 *  - Las fechas de calendario (fecha de recuperatorio) son `YYYY-MM-DD` sin
 *    hora ni zona, para que no se corran de dia al serializar.
 */

export type Rol = "admin" | "operador";

export const ROLES: readonly Rol[] = ["admin", "operador"] as const;

/** Alumno inscripto. Fuente de verdad para validar el legajo (LU). */
export interface Alumno {
  /** Libreta universitaria. Se guarda como texto para no perder formato. */
  legajo: string;
  apellido: string;
  nombre: string;
  /** `"Apellido, Nombre"` canonico, con los espacios ya saneados. */
  nombreCompleto: string;
  actualizadoEn: string;
}

/** Motivo de excepcion, administrable por el admin. */
export interface MotivoExcepcion {
  id: string;
  descripcion: string;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

/** Fecha de recuperatorio ofrecida al alumno, administrable por el admin. */
export interface FechaRecuperatorio {
  id: string;
  /** `YYYY-MM-DD` */
  fecha: string;
  /** Cupo maximo de fichas. `null` = sin limite. */
  cupo: number | null;
  activo: boolean;
  creadoEn: string;
  /** Fichas vigentes (no anuladas) asignadas a esta fecha. */
  fichasAsignadas: number;
}

/** Usuario del sistema. Nunca se expone el hash fuera de la capa de datos. */
export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
}

/** Usuario + credencial. Uso exclusivo del modulo de autenticacion. */
export interface UsuarioConCredencial extends Usuario {
  passwordHash: string;
}

export type EstadoFicha = "vigente" | "anulada";

/** Ficha de excepcion: el registro central del sistema. */
export interface FichaExcepcion {
  id: string;
  /** Numero correlativo legible, para referirse a la ficha en papel. */
  numero: number;
  legajo: string;
  motivoId: string;
  fechaRecuperatorioId: string;
  /** Ruta del PDF dentro del storage (no es una URL publica). */
  archivoPath: string;
  archivoNombre: string;
  archivoTamano: number;
  observaciones: string | null;
  estado: EstadoFicha;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  anuladaPor: string | null;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
}

/** Ficha con los datos relacionados ya resueltos, lista para mostrar. */
export interface FichaExcepcionDetallada extends FichaExcepcion {
  alumnoApellido: string;
  alumnoNombre: string;
  alumnoNombreCompleto: string;
  motivoDescripcion: string;
  /** `YYYY-MM-DD` */
  fechaRecuperatorio: string;
  creadoPorNombre: string;
  creadoPorUsuario: string;
  anuladaPorNombre: string | null;
}

/** Entrada del registro de auditoria. */
export interface EventoAuditoria {
  id: string;
  entidad: string;
  entidadId: string;
  accion: string;
  detalle: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  creadoEn: string;
}
