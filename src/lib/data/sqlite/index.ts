/**
 * Adaptador SQLite del `Repositorio`.
 *
 * better-sqlite3 es sincronico; la interfaz es async porque el futuro
 * adaptador Supabase si hara I/O de red. Envolver en promesas resueltas
 * mantiene un unico contrato para toda la aplicacion.
 */

import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";

import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from "@/lib/domain/errors";
import type {
  Alumno,
  EventoAuditoria,
  FechaRecuperatorio,
  FichaExcepcion,
  FichaExcepcionDetallada,
  MotivoExcepcion,
  Rol,
  Usuario,
  UsuarioConCredencial,
} from "@/lib/domain/types";
import { ahora, hoyISO } from "@/lib/utils/fechas";
import { escaparLike, normalizar } from "@/lib/utils/texto";
import type {
  AlumnoImportado,
  CambiosFicha,
  FiltrosFichas,
  NuevaFecha,
  NuevaFicha,
  NuevoMotivo,
  NuevoUsuario,
  Pagina,
  Paginacion,
  Repositorio,
  RegistroAuditoria,
  ResultadoImport,
} from "../repository";
import { obtenerDb } from "./connection";
import {
  aInt,
  mapearAlumno,
  mapearAuditoria,
  mapearFecha,
  mapearFicha,
  mapearFichaDetallada,
  mapearMotivo,
  mapearUsuario,
  mapearUsuarioConCredencial,
  type FilaAlumno,
  type FilaAuditoria,
  type FilaFecha,
  type FilaFicha,
  type FilaFichaDetallada,
  type FilaMotivo,
  type FilaUsuario,
} from "./mapeo";

/** SELECT reusable que resuelve todas las relaciones de una ficha. */
const SELECT_FICHA_DETALLADA = `
  SELECT f.*,
         a.apellido        AS alumno_apellido,
         a.nombre          AS alumno_nombre,
         a.nombre_completo AS alumno_nombre_completo,
         m.descripcion     AS motivo_descripcion,
         fr.fecha          AS fecha_recuperatorio,
         u.nombre          AS creado_por_nombre,
         u.usuario         AS creado_por_usuario,
         ua.nombre         AS anulada_por_nombre
    FROM fichas_excepcion f
    JOIN alumnos              a  ON a.legajo = f.legajo
    JOIN motivos_excepcion    m  ON m.id     = f.motivo_id
    JOIN fechas_recuperatorio fr ON fr.id    = f.fecha_recuperatorio_id
    JOIN usuarios             u  ON u.id     = f.creado_por
    LEFT JOIN usuarios        ua ON ua.id    = f.anulada_por
`;

/**
 * Traduce los filtros del listado a SQL.
 * Devuelve el fragmento WHERE y sus parametros, siempre bindeados por nombre
 * para que no haya forma de inyectar SQL desde la query string.
 */
function construirWhere(filtros: FiltrosFichas): { sql: string; params: Record<string, unknown> } {
  const condiciones: string[] = [];
  const params: Record<string, unknown> = {};

  if (filtros.legajo?.trim()) {
    condiciones.push("f.legajo LIKE @legajo ESCAPE '\\'");
    params.legajo = `${escaparLike(filtros.legajo.trim())}%`;
  }
  if (filtros.motivoId) {
    condiciones.push("f.motivo_id = @motivoId");
    params.motivoId = filtros.motivoId;
  }
  if (filtros.fechaRecuperatorioId) {
    condiciones.push("f.fecha_recuperatorio_id = @fechaRecuperatorioId");
    params.fechaRecuperatorioId = filtros.fechaRecuperatorioId;
  }
  if (filtros.cargaDesde) {
    // creado_en es ISO completo; comparar por prefijo de fecha alcanza.
    condiciones.push("substr(f.creado_en, 1, 10) >= @cargaDesde");
    params.cargaDesde = filtros.cargaDesde;
  }
  if (filtros.cargaHasta) {
    condiciones.push("substr(f.creado_en, 1, 10) <= @cargaHasta");
    params.cargaHasta = filtros.cargaHasta;
  }
  if (filtros.estado && filtros.estado !== "todas") {
    condiciones.push("f.estado = @estado");
    params.estado = filtros.estado;
  }
  if (filtros.texto?.trim()) {
    condiciones.push("a.busqueda LIKE @texto ESCAPE '\\'");
    params.texto = `%${escaparLike(normalizar(filtros.texto))}%`;
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "",
    params,
  };
}

/** Normaliza la paginacion a un rango sano, sin importar que llegue de la URL. */
function sanearPaginacion({ pagina, porPagina }: Paginacion): { limite: number; offset: number; pagina: number; porPagina: number } {
  const p = Number.isFinite(pagina) && pagina > 0 ? Math.floor(pagina) : 1;
  const pp = Number.isFinite(porPagina) && porPagina > 0 ? Math.min(Math.floor(porPagina), 200) : 25;
  return { limite: pp, offset: (p - 1) * pp, pagina: p, porPagina: pp };
}

export class SqliteRepositorio implements Repositorio {
  private readonly db: Database;

  constructor(db: Database = obtenerDb()) {
    this.db = db;
  }

  async migrar(): Promise<void> {
    // El esquema ya se aplica al abrir la conexion; este metodo existe para
    // que los scripts de CLI puedan forzarlo de forma explicita.
    obtenerDb();
  }

  /* ---------------------------------------------------------------- */
  /* Alumnos                                                           */
  /* ---------------------------------------------------------------- */

  async buscarAlumno(legajo: string): Promise<Alumno | null> {
    const fila = this.db
      .prepare<[string], FilaAlumno>("SELECT * FROM alumnos WHERE legajo = ?")
      .get(legajo.trim());
    return fila ? mapearAlumno(fila) : null;
  }

  async listarAlumnos(texto: string | undefined, paginacion: Paginacion): Promise<Pagina<Alumno>> {
    const { limite, offset, pagina, porPagina } = sanearPaginacion(paginacion);
    const busqueda = texto?.trim();

    if (!busqueda) {
      const total = this.db.prepare("SELECT count(*) AS n FROM alumnos").get() as { n: number };
      const items = this.db
        .prepare<[number, number], FilaAlumno>(
          "SELECT * FROM alumnos ORDER BY apellido, nombre LIMIT ? OFFSET ?",
        )
        .all(limite, offset);
      return { items: items.map(mapearAlumno), total: total.n, pagina, porPagina };
    }

    // Busca por legajo (prefijo) o por nombre normalizado (contiene).
    const patronLegajo = `${escaparLike(busqueda)}%`;
    const patronNombre = `%${escaparLike(normalizar(busqueda))}%`;
    const where = "WHERE legajo LIKE @legajo ESCAPE '\\' OR busqueda LIKE @nombre ESCAPE '\\'";
    const total = this.db
      .prepare(`SELECT count(*) AS n FROM alumnos ${where}`)
      .get({ legajo: patronLegajo, nombre: patronNombre }) as { n: number };
    const items = this.db
      .prepare<Record<string, unknown>, FilaAlumno>(
        `SELECT * FROM alumnos ${where} ORDER BY apellido, nombre LIMIT @limite OFFSET @offset`,
      )
      .all({ legajo: patronLegajo, nombre: patronNombre, limite, offset });

    return { items: items.map(mapearAlumno), total: total.n, pagina, porPagina };
  }

  async contarAlumnos(): Promise<number> {
    return (this.db.prepare("SELECT count(*) AS n FROM alumnos").get() as { n: number }).n;
  }

  async importarAlumnos(alumnos: AlumnoImportado[]): Promise<ResultadoImport> {
    const marca = ahora();
    const seleccionar = this.db.prepare<[string], FilaAlumno>(
      "SELECT * FROM alumnos WHERE legajo = ?",
    );
    const insertar = this.db.prepare(`
      INSERT INTO alumnos (legajo, apellido, nombre, nombre_completo, busqueda, actualizado_en)
      VALUES (@legajo, @apellido, @nombre, @nombreCompleto, @busqueda, @actualizadoEn)
    `);
    const actualizar = this.db.prepare(`
      UPDATE alumnos
         SET apellido = @apellido,
             nombre = @nombre,
             nombre_completo = @nombreCompleto,
             busqueda = @busqueda,
             actualizado_en = @actualizadoEn
       WHERE legajo = @legajo
    `);

    // Una sola transaccion para las ~2000 filas: sin esto SQLite hace un
    // fsync por INSERT y el import tarda minutos en vez de milisegundos.
    const ejecutar = this.db.transaction((lista: AlumnoImportado[]): ResultadoImport => {
      let insertados = 0;
      let actualizados = 0;
      let sinCambios = 0;

      for (const alumno of lista) {
        const fila = { ...alumno, busqueda: normalizar(alumno.nombreCompleto), actualizadoEn: marca };
        const existente = seleccionar.get(alumno.legajo);
        if (!existente) {
          insertar.run(fila);
          insertados += 1;
        } else if (
          existente.apellido === alumno.apellido &&
          existente.nombre === alumno.nombre &&
          existente.nombre_completo === alumno.nombreCompleto
        ) {
          sinCambios += 1;
        } else {
          actualizar.run(fila);
          actualizados += 1;
        }
      }

      return { insertados, actualizados, sinCambios };
    });

    return ejecutar(alumnos);
  }

  /* ---------------------------------------------------------------- */
  /* Motivos                                                           */
  /* ---------------------------------------------------------------- */

  async listarMotivos(soloActivos: boolean): Promise<MotivoExcepcion[]> {
    const where = soloActivos ? "WHERE activo = 1" : "";
    const filas = this.db
      .prepare<[], FilaMotivo>(`SELECT * FROM motivos_excepcion ${where} ORDER BY orden, descripcion`)
      .all();
    return filas.map(mapearMotivo);
  }

  async obtenerMotivo(id: string): Promise<MotivoExcepcion | null> {
    const fila = this.db
      .prepare<[string], FilaMotivo>("SELECT * FROM motivos_excepcion WHERE id = ?")
      .get(id);
    return fila ? mapearMotivo(fila) : null;
  }

  async crearMotivo(datos: NuevoMotivo): Promise<MotivoExcepcion> {
    const motivo: MotivoExcepcion = {
      id: randomUUID(),
      descripcion: datos.descripcion,
      activo: datos.activo,
      orden: datos.orden,
      creadoEn: ahora(),
    };
    try {
      this.db
        .prepare(
          `INSERT INTO motivos_excepcion (id, descripcion, activo, orden, creado_en)
           VALUES (@id, @descripcion, @activo, @orden, @creadoEn)`,
        )
        .run({ ...motivo, activo: aInt(motivo.activo) });
    } catch (error) {
      throw this.traducirUnicidad(error, "descripcion", "Ya existe un motivo con esa descripción.");
    }
    return motivo;
  }

  async actualizarMotivo(id: string, datos: NuevoMotivo): Promise<MotivoExcepcion> {
    const existente = await this.obtenerMotivo(id);
    if (!existente) throw new ErrorNoEncontrado("El motivo que intentas editar no existe.");

    try {
      this.db
        .prepare(
          `UPDATE motivos_excepcion
              SET descripcion = @descripcion, activo = @activo, orden = @orden
            WHERE id = @id`,
        )
        .run({ id, descripcion: datos.descripcion, activo: aInt(datos.activo), orden: datos.orden });
    } catch (error) {
      throw this.traducirUnicidad(error, "descripcion", "Ya existe un motivo con esa descripción.");
    }
    return { ...existente, ...datos };
  }

  async eliminarMotivo(id: string): Promise<void> {
    const enUso = this.db
      .prepare("SELECT count(*) AS n FROM fichas_excepcion WHERE motivo_id = ?")
      .get(id) as { n: number };
    if (enUso.n > 0) {
      throw new ErrorConflicto(
        `No se puede eliminar: hay ${enUso.n} ficha(s) usando este motivo. Desactivalo en lugar de borrarlo.`,
      );
    }
    const resultado = this.db.prepare("DELETE FROM motivos_excepcion WHERE id = ?").run(id);
    if (resultado.changes === 0) throw new ErrorNoEncontrado("El motivo que intentas eliminar no existe.");
  }

  /* ---------------------------------------------------------------- */
  /* Fechas de recuperatorio                                           */
  /* ---------------------------------------------------------------- */

  async listarFechas(opciones: { soloActivas: boolean; soloFuturas: boolean }): Promise<FechaRecuperatorio[]> {
    const condiciones: string[] = [];
    const params: Record<string, unknown> = {};
    if (opciones.soloActivas) condiciones.push("fr.activo = 1");
    if (opciones.soloFuturas) {
      condiciones.push("fr.fecha >= @hoy");
      params.hoy = hoyISO();
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const filas = this.db
      .prepare<Record<string, unknown>, FilaFecha>(`
        SELECT fr.*,
               (SELECT count(*) FROM fichas_excepcion f
                 WHERE f.fecha_recuperatorio_id = fr.id AND f.estado = 'vigente') AS fichas_asignadas
          FROM fechas_recuperatorio fr
          ${where}
         ORDER BY fr.fecha
      `)
      .all(params);
    return filas.map(mapearFecha);
  }

  async obtenerFecha(id: string): Promise<FechaRecuperatorio | null> {
    const fila = this.db
      .prepare<[string], FilaFecha>(`
        SELECT fr.*,
               (SELECT count(*) FROM fichas_excepcion f
                 WHERE f.fecha_recuperatorio_id = fr.id AND f.estado = 'vigente') AS fichas_asignadas
          FROM fechas_recuperatorio fr
         WHERE fr.id = ?
      `)
      .get(id);
    return fila ? mapearFecha(fila) : null;
  }

  async crearFecha(datos: NuevaFecha): Promise<FechaRecuperatorio> {
    const fecha: FechaRecuperatorio = {
      id: randomUUID(),
      fecha: datos.fecha,
      cupo: datos.cupo,
      activo: datos.activo,
      creadoEn: ahora(),
      fichasAsignadas: 0,
    };
    try {
      this.db
        .prepare(
          `INSERT INTO fechas_recuperatorio (id, fecha, cupo, activo, creado_en)
           VALUES (@id, @fecha, @cupo, @activo, @creadoEn)`,
        )
        .run({ ...fecha, activo: aInt(fecha.activo) });
    } catch (error) {
      throw this.traducirUnicidad(error, "fecha", "Ya existe una fecha de recuperatorio cargada para ese dia.");
    }
    return fecha;
  }

  async actualizarFecha(id: string, datos: NuevaFecha): Promise<FechaRecuperatorio> {
    const existente = await this.obtenerFecha(id);
    if (!existente) throw new ErrorNoEncontrado("La fecha que intentas editar no existe.");

    if (datos.cupo !== null && datos.cupo < existente.fichasAsignadas) {
      throw new ErrorConflicto(
        `El cupo no puede ser menor a las ${existente.fichasAsignadas} ficha(s) ya asignadas a esta fecha.`,
        "cupo",
      );
    }

    try {
      this.db
        .prepare(
          `UPDATE fechas_recuperatorio
              SET fecha = @fecha, cupo = @cupo, activo = @activo
            WHERE id = @id`,
        )
        .run({ id, fecha: datos.fecha, cupo: datos.cupo, activo: aInt(datos.activo) });
    } catch (error) {
      throw this.traducirUnicidad(error, "fecha", "Ya existe una fecha de recuperatorio cargada para ese dia.");
    }
    return { ...existente, ...datos };
  }

  async eliminarFecha(id: string): Promise<void> {
    const enUso = this.db
      .prepare("SELECT count(*) AS n FROM fichas_excepcion WHERE fecha_recuperatorio_id = ?")
      .get(id) as { n: number };
    if (enUso.n > 0) {
      throw new ErrorConflicto(
        `No se puede eliminar: hay ${enUso.n} ficha(s) asignadas a esta fecha. Desactivala en lugar de borrarla.`,
      );
    }
    const resultado = this.db.prepare("DELETE FROM fechas_recuperatorio WHERE id = ?").run(id);
    if (resultado.changes === 0) throw new ErrorNoEncontrado("La fecha que intentas eliminar no existe.");
  }

  /* ---------------------------------------------------------------- */
  /* Usuarios                                                          */
  /* ---------------------------------------------------------------- */

  async listarUsuarios(): Promise<Usuario[]> {
    const filas = this.db
      .prepare<[], FilaUsuario>("SELECT * FROM usuarios ORDER BY nombre")
      .all();
    return filas.map(mapearUsuario);
  }

  async obtenerUsuario(id: string): Promise<Usuario | null> {
    const fila = this.db.prepare<[string], FilaUsuario>("SELECT * FROM usuarios WHERE id = ?").get(id);
    return fila ? mapearUsuario(fila) : null;
  }

  async buscarUsuarioPorNombre(usuario: string): Promise<UsuarioConCredencial | null> {
    const fila = this.db
      .prepare<[string], FilaUsuario>("SELECT * FROM usuarios WHERE lower(usuario) = lower(?)")
      .get(usuario.trim());
    return fila ? mapearUsuarioConCredencial(fila) : null;
  }

  async crearUsuario(datos: NuevoUsuario): Promise<Usuario> {
    const usuario: Usuario = {
      id: randomUUID(),
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      activo: datos.activo,
      creadoEn: ahora(),
    };
    try {
      this.db
        .prepare(
          `INSERT INTO usuarios (id, usuario, nombre, rol, password_hash, activo, creado_en)
           VALUES (@id, @usuario, @nombre, @rol, @passwordHash, @activo, @creadoEn)`,
        )
        .run({ ...usuario, passwordHash: datos.passwordHash, activo: aInt(usuario.activo) });
    } catch (error) {
      throw this.traducirUnicidad(error, "usuario", "Ya existe un usuario con ese nombre.");
    }
    return usuario;
  }

  async actualizarUsuario(
    id: string,
    datos: { nombre: string; rol: Rol; activo: boolean; passwordHash?: string },
  ): Promise<Usuario> {
    const existente = await this.obtenerUsuario(id);
    if (!existente) throw new ErrorNoEncontrado("El usuario que intentas editar no existe.");

    if (datos.passwordHash) {
      this.db
        .prepare(
          `UPDATE usuarios SET nombre = @nombre, rol = @rol, activo = @activo, password_hash = @passwordHash
            WHERE id = @id`,
        )
        .run({ id, nombre: datos.nombre, rol: datos.rol, activo: aInt(datos.activo), passwordHash: datos.passwordHash });
    } else {
      this.db
        .prepare("UPDATE usuarios SET nombre = @nombre, rol = @rol, activo = @activo WHERE id = @id")
        .run({ id, nombre: datos.nombre, rol: datos.rol, activo: aInt(datos.activo) });
    }
    return { ...existente, nombre: datos.nombre, rol: datos.rol, activo: datos.activo };
  }

  /* ---------------------------------------------------------------- */
  /* Fichas                                                            */
  /* ---------------------------------------------------------------- */

  async crearFicha(datos: NuevaFicha): Promise<FichaExcepcion> {
    // Todo en una transaccion: el numero correlativo y el control de cupo
    // se calculan y usan sin que otra carga simultanea se cuele en el medio.
    const crear = this.db.transaction((entrada: NuevaFicha): FichaExcepcion => {
      this.validarReferenciasFicha(entrada.legajo, entrada.motivoId, entrada.fechaRecuperatorioId);
      this.validarCupo(entrada.fechaRecuperatorioId, null);
      this.validarSinDuplicado(entrada.legajo, entrada.fechaRecuperatorioId, null);

      const siguiente = this.db
        .prepare("SELECT coalesce(max(numero), 0) + 1 AS n FROM fichas_excepcion")
        .get() as { n: number };
      const marca = ahora();

      const ficha: FichaExcepcion = {
        id: randomUUID(),
        numero: siguiente.n,
        legajo: entrada.legajo,
        motivoId: entrada.motivoId,
        fechaRecuperatorioId: entrada.fechaRecuperatorioId,
        archivoPath: entrada.archivoPath,
        archivoNombre: entrada.archivoNombre,
        archivoTamano: entrada.archivoTamano,
        observaciones: entrada.observaciones,
        estado: "vigente",
        motivoAnulacion: null,
        anuladaEn: null,
        anuladaPor: null,
        creadoPor: entrada.creadoPor,
        creadoEn: marca,
        actualizadoEn: marca,
      };

      this.db
        .prepare(`
          INSERT INTO fichas_excepcion (
            id, numero, legajo, motivo_id, fecha_recuperatorio_id,
            archivo_path, archivo_nombre, archivo_tamano, observaciones,
            estado, creado_por, creado_en, actualizado_en
          ) VALUES (
            @id, @numero, @legajo, @motivoId, @fechaRecuperatorioId,
            @archivoPath, @archivoNombre, @archivoTamano, @observaciones,
            @estado, @creadoPor, @creadoEn, @actualizadoEn
          )
        `)
        .run({
          id: ficha.id,
          numero: ficha.numero,
          legajo: ficha.legajo,
          motivoId: ficha.motivoId,
          fechaRecuperatorioId: ficha.fechaRecuperatorioId,
          archivoPath: ficha.archivoPath,
          archivoNombre: ficha.archivoNombre,
          archivoTamano: ficha.archivoTamano,
          observaciones: ficha.observaciones,
          estado: ficha.estado,
          creadoPor: ficha.creadoPor,
          creadoEn: ficha.creadoEn,
          actualizadoEn: ficha.actualizadoEn,
        });

      this.insertarAuditoria({
        entidad: "ficha",
        entidadId: ficha.id,
        accion: "creada",
        detalle: `Ficha N° ${ficha.numero} para el legajo ${ficha.legajo}.`,
        usuarioId: ficha.creadoPor,
      });

      return ficha;
    });

    return crear(datos);
  }

  async obtenerFicha(id: string): Promise<FichaExcepcionDetallada | null> {
    const fila = this.db
      .prepare<[string], FilaFichaDetallada>(`${SELECT_FICHA_DETALLADA} WHERE f.id = ?`)
      .get(id);
    return fila ? mapearFichaDetallada(fila) : null;
  }

  async listarFichas(filtros: FiltrosFichas, paginacion: Paginacion): Promise<Pagina<FichaExcepcionDetallada>> {
    const { limite, offset, pagina, porPagina } = sanearPaginacion(paginacion);
    const { sql: where, params } = construirWhere(filtros);

    const total = this.db
      .prepare(`
        SELECT count(*) AS n
          FROM fichas_excepcion f
          JOIN alumnos a ON a.legajo = f.legajo
          ${where}
      `)
      .get(params) as { n: number };

    const filas = this.db
      .prepare<Record<string, unknown>, FilaFichaDetallada>(
        `${SELECT_FICHA_DETALLADA} ${where} ORDER BY f.numero DESC LIMIT @limite OFFSET @offset`,
      )
      .all({ ...params, limite, offset });

    return { items: filas.map(mapearFichaDetallada), total: total.n, pagina, porPagina };
  }

  async listarFichasParaExportar(filtros: FiltrosFichas): Promise<FichaExcepcionDetallada[]> {
    const { sql: where, params } = construirWhere(filtros);
    const filas = this.db
      .prepare<Record<string, unknown>, FilaFichaDetallada>(
        `${SELECT_FICHA_DETALLADA} ${where} ORDER BY f.numero DESC`,
      )
      .all(params);
    return filas.map(mapearFichaDetallada);
  }

  async actualizarFicha(id: string, cambios: CambiosFicha, usuarioId: string): Promise<FichaExcepcion> {
    const actualizar = this.db.transaction((): FichaExcepcion => {
      const fila = this.db
        .prepare<[string], FilaFicha>("SELECT * FROM fichas_excepcion WHERE id = ?")
        .get(id);
      if (!fila) throw new ErrorNoEncontrado("La ficha que intentas editar no existe.");
      const actual = mapearFicha(fila);
      if (actual.estado === "anulada") {
        throw new ErrorConflicto("La ficha está anulada y ya no se puede editar.");
      }

      this.validarReferenciasFicha(actual.legajo, cambios.motivoId, cambios.fechaRecuperatorioId);
      if (cambios.fechaRecuperatorioId !== actual.fechaRecuperatorioId) {
        this.validarCupo(cambios.fechaRecuperatorioId, id);
        this.validarSinDuplicado(actual.legajo, cambios.fechaRecuperatorioId, id);
      }

      const marca = ahora();
      const archivo = cambios.archivo;

      this.db
        .prepare(`
          UPDATE fichas_excepcion
             SET motivo_id = @motivoId,
                 fecha_recuperatorio_id = @fechaRecuperatorioId,
                 observaciones = @observaciones,
                 archivo_path = @archivoPath,
                 archivo_nombre = @archivoNombre,
                 archivo_tamano = @archivoTamano,
                 actualizado_en = @actualizadoEn
           WHERE id = @id
        `)
        .run({
          id,
          motivoId: cambios.motivoId,
          fechaRecuperatorioId: cambios.fechaRecuperatorioId,
          observaciones: cambios.observaciones,
          archivoPath: archivo?.path ?? actual.archivoPath,
          archivoNombre: archivo?.nombre ?? actual.archivoNombre,
          archivoTamano: archivo?.tamano ?? actual.archivoTamano,
          actualizadoEn: marca,
        });

      const detalles: string[] = [];
      if (cambios.motivoId !== actual.motivoId) detalles.push("motivo");
      if (cambios.fechaRecuperatorioId !== actual.fechaRecuperatorioId) detalles.push("fecha de recuperatorio");
      if ((cambios.observaciones ?? null) !== actual.observaciones) detalles.push("observaciones");
      if (archivo) detalles.push("adjunto PDF");

      this.insertarAuditoria({
        entidad: "ficha",
        entidadId: id,
        accion: "editada",
        detalle: detalles.length ? `Cambios en: ${detalles.join(", ")}.` : "Guardada sin cambios efectivos.",
        usuarioId,
      });

      return {
        ...actual,
        motivoId: cambios.motivoId,
        fechaRecuperatorioId: cambios.fechaRecuperatorioId,
        observaciones: cambios.observaciones,
        archivoPath: archivo?.path ?? actual.archivoPath,
        archivoNombre: archivo?.nombre ?? actual.archivoNombre,
        archivoTamano: archivo?.tamano ?? actual.archivoTamano,
        actualizadoEn: marca,
      };
    });

    return actualizar();
  }

  async anularFicha(id: string, motivo: string, usuarioId: string): Promise<FichaExcepcion> {
    const anular = this.db.transaction((): FichaExcepcion => {
      const fila = this.db
        .prepare<[string], FilaFicha>("SELECT * FROM fichas_excepcion WHERE id = ?")
        .get(id);
      if (!fila) throw new ErrorNoEncontrado("La ficha que intentas anular no existe.");
      const actual = mapearFicha(fila);
      if (actual.estado === "anulada") throw new ErrorConflicto("La ficha ya estaba anulada.");

      const marca = ahora();
      this.db
        .prepare(`
          UPDATE fichas_excepcion
             SET estado = 'anulada',
                 motivo_anulacion = @motivo,
                 anulada_en = @marca,
                 anulada_por = @usuarioId,
                 actualizado_en = @marca
           WHERE id = @id
        `)
        .run({ id, motivo, marca, usuarioId });

      this.insertarAuditoria({
        entidad: "ficha",
        entidadId: id,
        accion: "anulada",
        detalle: motivo,
        usuarioId,
      });

      return {
        ...actual,
        estado: "anulada",
        motivoAnulacion: motivo,
        anuladaEn: marca,
        anuladaPor: usuarioId,
        actualizadoEn: marca,
      };
    });

    return anular();
  }

  async contarFichasVigentesPorFecha(fechaRecuperatorioId: string): Promise<number> {
    const fila = this.db
      .prepare("SELECT count(*) AS n FROM fichas_excepcion WHERE fecha_recuperatorio_id = ? AND estado = 'vigente'")
      .get(fechaRecuperatorioId) as { n: number };
    return fila.n;
  }

  /* ---------------------------------------------------------------- */
  /* Auditoria                                                         */
  /* ---------------------------------------------------------------- */

  async registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
    this.insertarAuditoria(registro);
  }

  async listarAuditoria(entidadId: string): Promise<EventoAuditoria[]> {
    const filas = this.db
      .prepare<[string], FilaAuditoria>(`
        SELECT a.*, u.nombre AS usuario_nombre
          FROM auditoria a
          LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.entidad_id = ?
         ORDER BY a.creado_en DESC
      `)
      .all(entidadId);
    return filas.map(mapearAuditoria);
  }

  /* ---------------------------------------------------------------- */
  /* Resumen                                                           */
  /* ---------------------------------------------------------------- */

  async resumen(): Promise<{
    fichasVigentes: number;
    fichasAnuladas: number;
    alumnos: number;
    motivosActivos: number;
    fechasActivas: number;
    fichasUltimos7Dias: number;
  }> {
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fila = this.db
      .prepare(`
        SELECT
          (SELECT count(*) FROM fichas_excepcion WHERE estado = 'vigente')    AS fichas_vigentes,
          (SELECT count(*) FROM fichas_excepcion WHERE estado = 'anulada')    AS fichas_anuladas,
          (SELECT count(*) FROM alumnos)                                      AS alumnos,
          (SELECT count(*) FROM motivos_excepcion WHERE activo = 1)           AS motivos_activos,
          (SELECT count(*) FROM fechas_recuperatorio WHERE activo = 1)        AS fechas_activas,
          (SELECT count(*) FROM fichas_excepcion WHERE creado_en >= @desde)   AS fichas_7d
      `)
      .get({ desde: hace7Dias }) as Record<string, number>;

    return {
      fichasVigentes: fila.fichas_vigentes ?? 0,
      fichasAnuladas: fila.fichas_anuladas ?? 0,
      alumnos: fila.alumnos ?? 0,
      motivosActivos: fila.motivos_activos ?? 0,
      fechasActivas: fila.fechas_activas ?? 0,
      fichasUltimos7Dias: fila.fichas_7d ?? 0,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Helpers privados                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Revalida en el servidor que legajo, motivo y fecha existan y esten
   * habilitados. Es la contraparte de la validacion del formulario: el
   * cliente puede tener una lista vieja o el admin puede haber desactivado
   * una opcion mientras el operador completaba la ficha.
   */
  private validarReferenciasFicha(legajo: string, motivoId: string, fechaId: string): void {
    const alumno = this.db.prepare("SELECT 1 FROM alumnos WHERE legajo = ?").get(legajo);
    if (!alumno) throw new ErrorValidacion("El legajo ingresado no existe en el padrón de alumnos.", "legajo");

    const motivo = this.db
      .prepare<[string], FilaMotivo>("SELECT * FROM motivos_excepcion WHERE id = ?")
      .get(motivoId);
    if (!motivo) throw new ErrorValidacion("El motivo seleccionado no existe.", "motivoId");
    if (motivo.activo !== 1) {
      throw new ErrorValidacion("El motivo seleccionado ya no está disponible.", "motivoId");
    }

    const fecha = this.db
      .prepare<[string], FilaFecha>("SELECT * FROM fechas_recuperatorio WHERE id = ?")
      .get(fechaId);
    if (!fecha) throw new ErrorValidacion("La fecha de recuperatorio seleccionada no existe.", "fechaRecuperatorioId");
    if (fecha.activo !== 1) {
      throw new ErrorValidacion("La fecha de recuperatorio seleccionada ya no está disponible.", "fechaRecuperatorioId");
    }
  }

  /** Verifica el cupo de la fecha. `excluirFichaId` permite reasignar sin contarse a si misma. */
  private validarCupo(fechaId: string, excluirFichaId: string | null): void {
    const fecha = this.db
      .prepare<[string], FilaFecha>("SELECT * FROM fechas_recuperatorio WHERE id = ?")
      .get(fechaId);
    if (!fecha || fecha.cupo === null) return;

    const ocupadas = this.db
      .prepare(`
        SELECT count(*) AS n FROM fichas_excepcion
         WHERE fecha_recuperatorio_id = @fechaId AND estado = 'vigente'
           AND (@excluir IS NULL OR id <> @excluir)
      `)
      .get({ fechaId, excluir: excluirFichaId }) as { n: number };

    if (ocupadas.n >= fecha.cupo) {
      throw new ErrorConflicto(
        `La fecha seleccionada ya cubrió su cupo de ${fecha.cupo} alumno(s). Elegí otra fecha.`,
        "fechaRecuperatorioId",
      );
    }
  }

  /** Un alumno no puede tener dos fichas vigentes para la misma fecha. */
  private validarSinDuplicado(legajo: string, fechaId: string, excluirFichaId: string | null): void {
    const existente = this.db
      .prepare(`
        SELECT numero FROM fichas_excepcion
         WHERE legajo = @legajo AND fecha_recuperatorio_id = @fechaId AND estado = 'vigente'
           AND (@excluir IS NULL OR id <> @excluir)
         LIMIT 1
      `)
      .get({ legajo, fechaId, excluir: excluirFichaId }) as { numero: number } | undefined;

    if (existente) {
      throw new ErrorConflicto(
        `El legajo ${legajo} ya tiene la ficha N° ${existente.numero} vigente para esa fecha de recuperatorio.`,
        "legajo",
      );
    }
  }

  private insertarAuditoria(registro: RegistroAuditoria): void {
    this.db
      .prepare(`
        INSERT INTO auditoria (id, entidad, entidad_id, accion, detalle, usuario_id, creado_en)
        VALUES (@id, @entidad, @entidadId, @accion, @detalle, @usuarioId, @creadoEn)
      `)
      .run({
        id: randomUUID(),
        entidad: registro.entidad,
        entidadId: registro.entidadId,
        accion: registro.accion,
        detalle: registro.detalle ?? null,
        usuarioId: registro.usuarioId,
        creadoEn: ahora(),
      });
  }

  /** Convierte una violacion de UNIQUE de SQLite en un error de dominio legible. */
  private traducirUnicidad(error: unknown, campo: string, mensaje: string): unknown {
    const codigo = (error as { code?: string } | null)?.code;
    if (codigo === "SQLITE_CONSTRAINT_UNIQUE" || codigo === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return new ErrorConflicto(mensaje, campo);
    }
    return error;
  }
}
