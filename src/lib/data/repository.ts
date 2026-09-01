/**
 * Contrato de la capa de datos.
 *
 * Es la unica superficie que la aplicacion conoce. Hoy la implementa el
 * adaptador SQLite (`./sqlite`); cuando Supabase salga de stand by alcanza
 * con escribir un `SupabaseRepositorio` que cumpla esta misma interfaz y
 * cambiar la variable `DATA_ADAPTER`. Ninguna pagina, Server Action ni
 * componente debe importar `better-sqlite3` ni el cliente de Supabase
 * directamente.
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

/* ------------------------------------------------------------------ */
/* Entradas                                                            */
/* ------------------------------------------------------------------ */

export interface FiltrosFichas {
  legajo?: string;
  motivoId?: string;
  fechaRecuperatorioId?: string;
  /** Fecha de carga desde, inclusive (`YYYY-MM-DD`). */
  cargaDesde?: string;
  /** Fecha de carga hasta, inclusive (`YYYY-MM-DD`). */
  cargaHasta?: string;
  estado?: EstadoFicha | "todas";
  /** Busqueda libre por apellido/nombre del alumno. */
  texto?: string;
}

export interface Paginacion {
  pagina: number;
  porPagina: number;
}

export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface NuevaFicha {
  legajo: string;
  motivoId: string;
  fechaRecuperatorioId: string;
  archivoPath: string;
  archivoNombre: string;
  archivoTamano: number;
  observaciones: string | null;
  creadoPor: string;
}

export interface CambiosFicha {
  motivoId: string;
  fechaRecuperatorioId: string;
  observaciones: string | null;
  /** Si se reemplaza el adjunto; si es `null` se conserva el actual. */
  archivo: {
    path: string;
    nombre: string;
    tamano: number;
  } | null;
}

export interface NuevoMotivo {
  descripcion: string;
  activo: boolean;
  orden: number;
}

export interface NuevaFecha {
  fecha: string;
  cupo: number | null;
  activo: boolean;
}

export interface NuevoUsuario {
  usuario: string;
  nombre: string;
  rol: Rol;
  passwordHash: string;
  activo: boolean;
}

export interface AlumnoImportado {
  legajo: string;
  apellido: string;
  nombre: string;
  nombreCompleto: string;
}

export interface ResultadoImport {
  insertados: number;
  actualizados: number;
  sinCambios: number;
}

export interface RegistroAuditoria {
  entidad: string;
  entidadId: string;
  accion: string;
  detalle?: string | null;
  usuarioId: string | null;
}

/* ------------------------------------------------------------------ */
/* Interfaz                                                            */
/* ------------------------------------------------------------------ */

export interface Repositorio {
  /** Crea el esquema si no existe. Idempotente. */
  migrar(): Promise<void>;

  // --- Alumnos ---
  buscarAlumno(legajo: string): Promise<Alumno | null>;
  listarAlumnos(texto: string | undefined, paginacion: Paginacion): Promise<Pagina<Alumno>>;
  contarAlumnos(): Promise<number>;
  /** Upsert masivo: inserta nuevos y actualiza existentes. No borra. */
  importarAlumnos(alumnos: AlumnoImportado[]): Promise<ResultadoImport>;

  // --- Motivos ---
  listarMotivos(soloActivos: boolean): Promise<MotivoExcepcion[]>;
  obtenerMotivo(id: string): Promise<MotivoExcepcion | null>;
  crearMotivo(datos: NuevoMotivo): Promise<MotivoExcepcion>;
  actualizarMotivo(id: string, datos: NuevoMotivo): Promise<MotivoExcepcion>;
  /** Baja logica. Falla si la baja fisica rompiera fichas existentes. */
  eliminarMotivo(id: string): Promise<void>;

  // --- Fechas de recuperatorio ---
  listarFechas(opciones: { soloActivas: boolean; soloFuturas: boolean }): Promise<FechaRecuperatorio[]>;
  obtenerFecha(id: string): Promise<FechaRecuperatorio | null>;
  crearFecha(datos: NuevaFecha): Promise<FechaRecuperatorio>;
  actualizarFecha(id: string, datos: NuevaFecha): Promise<FechaRecuperatorio>;
  eliminarFecha(id: string): Promise<void>;

  // --- Usuarios ---
  listarUsuarios(): Promise<Usuario[]>;
  obtenerUsuario(id: string): Promise<Usuario | null>;
  buscarUsuarioPorNombre(usuario: string): Promise<UsuarioConCredencial | null>;
  crearUsuario(datos: NuevoUsuario): Promise<Usuario>;
  actualizarUsuario(
    id: string,
    datos: { nombre: string; rol: Rol; activo: boolean; passwordHash?: string },
  ): Promise<Usuario>;

  // --- Fichas ---
  crearFicha(datos: NuevaFicha): Promise<FichaExcepcion>;
  obtenerFicha(id: string): Promise<FichaExcepcionDetallada | null>;
  listarFichas(filtros: FiltrosFichas, paginacion: Paginacion): Promise<Pagina<FichaExcepcionDetallada>>;
  /** Todas las fichas que cumplen el filtro, sin paginar. Para exportar. */
  listarFichasParaExportar(filtros: FiltrosFichas): Promise<FichaExcepcionDetallada[]>;
  actualizarFicha(id: string, cambios: CambiosFicha, usuarioId: string): Promise<FichaExcepcion>;
  anularFicha(id: string, motivo: string, usuarioId: string): Promise<FichaExcepcion>;
  /** Fichas vigentes ya asignadas a una fecha; se usa para el control de cupo. */
  contarFichasVigentesPorFecha(fechaRecuperatorioId: string): Promise<number>;

  // --- Auditoria ---
  registrarAuditoria(registro: RegistroAuditoria): Promise<void>;
  listarAuditoria(entidadId: string): Promise<EventoAuditoria[]>;

  // --- Metricas del tablero ---
  resumen(): Promise<{
    fichasVigentes: number;
    fichasAnuladas: number;
    alumnos: number;
    motivosActivos: number;
    fechasActivas: number;
    fichasUltimos7Dias: number;
  }>;
}
