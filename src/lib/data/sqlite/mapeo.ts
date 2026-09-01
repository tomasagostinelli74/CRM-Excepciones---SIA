/**
 * Conversion fila SQL -> entidad de dominio.
 *
 * SQLite no tiene booleanos ni nulls tipados, asi que la traduccion vive
 * concentrada aca y no desparramada por las consultas.
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
  actualizado_en: string;
}

export interface FilaMotivo {
  id: string;
  descripcion: string;
  activo: number;
  orden: number;
  creado_en: string;
}

export interface FilaFecha {
  id: string;
  fecha: string;
  cupo: number | null;
  activo: number;
  creado_en: string;
  fichas_asignadas?: number;
}

export interface FilaUsuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
  password_hash: string;
  activo: number;
  creado_en: string;
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
  anulada_en: string | null;
  anulada_por: string | null;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
}

export interface FilaFichaDetallada extends FilaFicha {
  alumno_apellido: string;
  alumno_nombre: string;
  alumno_nombre_completo: string;
  motivo_descripcion: string;
  fecha_recuperatorio: string;
  creado_por_nombre: string;
  creado_por_usuario: string;
  anulada_por_nombre: string | null;
}

export interface FilaAuditoria {
  id: string;
  entidad: string;
  entidad_id: string;
  accion: string;
  detalle: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  creado_en: string;
}

export const aBool = (valor: number): boolean => valor === 1;
export const aInt = (valor: boolean): number => (valor ? 1 : 0);

export function mapearAlumno(fila: FilaAlumno): Alumno {
  return {
    legajo: fila.legajo,
    apellido: fila.apellido,
    nombre: fila.nombre,
    nombreCompleto: fila.nombre_completo,
    actualizadoEn: fila.actualizado_en,
  };
}

export function mapearMotivo(fila: FilaMotivo): MotivoExcepcion {
  return {
    id: fila.id,
    descripcion: fila.descripcion,
    activo: aBool(fila.activo),
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function mapearFecha(fila: FilaFecha): FechaRecuperatorio {
  return {
    id: fila.id,
    fecha: fila.fecha,
    cupo: fila.cupo,
    activo: aBool(fila.activo),
    creadoEn: fila.creado_en,
    fichasAsignadas: fila.fichas_asignadas ?? 0,
  };
}

export function mapearUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    rol: fila.rol as Rol,
    activo: aBool(fila.activo),
    creadoEn: fila.creado_en,
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
    anuladaEn: fila.anulada_en,
    anuladaPor: fila.anulada_por,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function mapearFichaDetallada(fila: FilaFichaDetallada): FichaExcepcionDetallada {
  return {
    ...mapearFicha(fila),
    alumnoApellido: fila.alumno_apellido,
    alumnoNombre: fila.alumno_nombre,
    alumnoNombreCompleto: fila.alumno_nombre_completo,
    motivoDescripcion: fila.motivo_descripcion,
    fechaRecuperatorio: fila.fecha_recuperatorio,
    creadoPorNombre: fila.creado_por_nombre,
    creadoPorUsuario: fila.creado_por_usuario,
    anuladaPorNombre: fila.anulada_por_nombre,
  };
}

export function mapearAuditoria(fila: FilaAuditoria): EventoAuditoria {
  return {
    id: fila.id,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    accion: fila.accion,
    detalle: fila.detalle,
    usuarioId: fila.usuario_id,
    usuarioNombre: fila.usuario_nombre,
    creadoEn: fila.creado_en,
  };
}
