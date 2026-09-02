/**
 * Conversion fila SQL -> entidad de dominio, para el adaptador Postgres.
 *
 * A diferencia de SQLite, Postgres ya tiene booleanos nativos y devuelve los
 * timestamps como objetos `Date`; esta capa homogeneiza eso a la forma que
 * espera el resto de la aplicacion (ISO-8601 en string).
 */

import type {
  Alumno,
  EstadoFicha,
  EventoAuditoria,
  FechaRecuperatorio,
  FichaExcepcion,
  FichaExcepcionDetallada,
  MotivoExcepcion,
  Rol,
  Usuario,
  UsuarioConCredencial,
} from "@/lib/domain/types";

export interface FilaAlumno {
  legajo: string;
  apellido: string;
  nombre: string;
  nombre_completo: string;
  actualizado_en: Date;
}

export interface FilaMotivo {
  id: string;
  descripcion: string;
  activo: boolean;
  orden: number;
  creado_en: Date;
}

export interface FilaFecha {
  id: string;
  fecha: string;
  cupo: number | null;
  activo: boolean;
  creado_en: Date;
  fichas_asignadas?: string | number;
}

export interface FilaUsuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
  password_hash: string;
  activo: boolean;
  creado_en: Date;
}

export interface FilaFicha {
  id: string;
  numero: number;
  legajo: string;
  motivo_id: string;
  fecha_recuperatorio_id: string;
  archivo_path: string;
  archivo_nombre: string;
  archivo_tamano: number;
  observaciones: string | null;
  estado: string;
  motivo_anulacion: string | null;
  anulada_en: Date | null;
  anulada_por: string | null;
  creado_por: string;
  creado_en: Date;
  actualizado_en: Date;
}

const aIso = (valor: Date): string => valor.toISOString();

export function mapearAlumno(fila: FilaAlumno): Alumno {
  return {
    legajo: fila.legajo,
    apellido: fila.apellido,
    nombre: fila.nombre,
    nombreCompleto: fila.nombre_completo,
    actualizadoEn: aIso(fila.actualizado_en),
  };
}

export function mapearMotivo(fila: FilaMotivo): MotivoExcepcion {
  return {
    id: fila.id,
    descripcion: fila.descripcion,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: aIso(fila.creado_en),
  };
}

export function mapearFecha(fila: FilaFecha): FechaRecuperatorio {
  return {
    id: fila.id,
    fecha: fila.fecha,
    cupo: fila.cupo,
    activo: fila.activo,
    creadoEn: aIso(fila.creado_en),
    fichasAsignadas: Number(fila.fichas_asignadas ?? 0),
  };
}

export function mapearUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    rol: fila.rol as Rol,
    activo: fila.activo,
    creadoEn: aIso(fila.creado_en),
  };
}

export function mapearUsuarioConCredencial(fila: FilaUsuario): UsuarioConCredencial {
  return { ...mapearUsuario(fila), passwordHash: fila.password_hash };
}

export function mapearFicha(fila: FilaFicha): FichaExcepcion {
  return {
    id: fila.id,
    numero: fila.numero,
    legajo: fila.legajo,
    motivoId: fila.motivo_id,
    fechaRecuperatorioId: fila.fecha_recuperatorio_id,
    archivoPath: fila.archivo_path,
    archivoNombre: fila.archivo_nombre,
    archivoTamano: fila.archivo_tamano,
    observaciones: fila.observaciones,
    estado: fila.estado as EstadoFicha,
    motivoAnulacion: fila.motivo_anulacion,
    anuladaEn: fila.anulada_en ? aIso(fila.anulada_en) : null,
    anuladaPor: fila.anulada_por,
    creadoPor: fila.creado_por,
    creadoEn: aIso(fila.creado_en),
    actualizadoEn: aIso(fila.actualizado_en),
  };
}

/**
 * Arma una `FichaExcepcionDetallada` a partir de la fila base y los mapas de
 * entidades relacionadas ya resueltos (ver ./index.ts). Se arma en JS y no
 * con un JOIN embebido de PostgREST para no depender de nombres de
 * constraint que no se pueden verificar sin una base Supabase real.
 */
export function mapearFichaDetallada(
  fila: FilaFicha,
  relacionados: {
    alumnos: Map<string, Alumno>;
    motivos: Map<string, MotivoExcepcion>;
    fechas: Map<string, FechaRecuperatorio>;
    usuarios: Map<string, Usuario>;
  },
): FichaExcepcionDetallada {
  const alumno = relacionados.alumnos.get(fila.legajo);
  const motivo = relacionados.motivos.get(fila.motivo_id);
  const fecha = relacionados.fechas.get(fila.fecha_recuperatorio_id);
  const creador = relacionados.usuarios.get(fila.creado_por);
  const anulador = fila.anulada_por ? relacionados.usuarios.get(fila.anulada_por) : undefined;

  return {
    ...mapearFicha(fila),
    alumnoApellido: alumno?.apellido ?? "",
    alumnoNombre: alumno?.nombre ?? "",
    alumnoNombreCompleto: alumno?.nombreCompleto ?? fila.legajo,
    motivoDescripcion: motivo?.descripcion ?? "",
    fechaRecuperatorio: fecha?.fecha ?? "",
    creadoPorNombre: creador?.nombre ?? "",
    creadoPorUsuario: creador?.usuario ?? "",
    anuladaPorNombre: anulador?.nombre ?? null,
  };
}

export interface FilaAuditoria {
  id: string;
  entidad: string;
  entidad_id: string;
  accion: string;
  detalle: string | null;
  usuario_id: string | null;
  creado_en: Date;
}

export function mapearAuditoria(fila: FilaAuditoria, usuarios: Map<string, Usuario>): EventoAuditoria {
  return {
    id: fila.id,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    accion: fila.accion,
    detalle: fila.detalle,
    usuarioId: fila.usuario_id,
    usuarioNombre: fila.usuario_id ? (usuarios.get(fila.usuario_id)?.nombre ?? null) : null,
    creadoEn: aIso(fila.creado_en),
  };
}
