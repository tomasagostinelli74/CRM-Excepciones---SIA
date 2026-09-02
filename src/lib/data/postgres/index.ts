/**
 * Adaptador Postgres (Supabase) del `Repositorio`.
 *
 * Habla directo con la base Postgres del proyecto de Supabase (ver
 * ./connection.ts) usando transacciones reales, con la misma semantica que
 * el adaptador SQLite: mismos mensajes de error, mismas reglas de negocio.
 * El control de cupo y de fichas duplicadas esta ademas garantizado a nivel
 * de base (trigger + indice unico parcial, ver supabase/migrations); este
 * adaptador pre-valida para dar un mensaje especifico en el caso comun, y
 * traduce el error de la base a un mensaje igual de claro si dos cargas
 * simultaneas se cruzan justo en el medio.
 */

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

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
import { conTransaccion, obtenerPool } from "./connection";
import {
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
  type FilaMotivo,
  type FilaUsuario,
} from "./mapeo";

/** Ejecuta en el pool o, si se pasa un cliente de transaccion, en ese cliente. */
type Ejecutor = Pool | PoolClient;

function sanearPaginacion({ pagina, porPagina }: Paginacion) {
  const p = Number.isFinite(pagina) && pagina > 0 ? Math.floor(pagina) : 1;
  const pp = Number.isFinite(porPagina) && porPagina > 0 ? Math.min(Math.floor(porPagina), 200) : 25;
  return { limite: pp, offset: (p - 1) * pp, pagina: p, porPagina: pp };
}

/** Divide un arreglo en bloques, para no mandar `IN (...)` con miles de valores. */
function enBloques<T>(items: T[], tamano: number): T[][] {
  const bloques: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) bloques.push(items.slice(i, i + tamano));
  return bloques;
}

export class PostgresRepositorio implements Repositorio {
  private readonly pool: Pool;

  constructor(pool: Pool = obtenerPool()) {
    this.pool = pool;
  }

  async migrar(): Promise<void> {
    // El esquema de Supabase se aplica pegando supabase/migrations/*.sql en
    // el SQL Editor del proyecto (ver docs/supabase.md); este adaptador no
    // lo corre por su cuenta porque necesitaria permisos de administracion
    // sobre extensiones y storage que la app no debe tener.
    await this.pool.query("select 1");
  }

  /* ---------------------------------------------------------------- */
  /* Alumnos                                                           */
  /* ---------------------------------------------------------------- */

  async buscarAlumno(legajo: string): Promise<Alumno | null> {
    const { rows } = await this.pool.query<FilaAlumno>(
      "select * from alumnos where legajo = $1",
      [legajo.trim()],
    );
    return rows[0] ? mapearAlumno(rows[0]) : null;
  }

  async listarAlumnos(texto: string | undefined, paginacion: Paginacion): Promise<Pagina<Alumno>> {
    const { limite, offset, pagina, porPagina } = sanearPaginacion(paginacion);
    const busqueda = texto?.trim();

    if (!busqueda) {
      const total = await this.pool.query<{ n: string }>("select count(*) as n from alumnos");
      const { rows } = await this.pool.query<FilaAlumno>(
        "select * from alumnos order by apellido, nombre limit $1 offset $2",
        [limite, offset],
      );
      return { items: rows.map(mapearAlumno), total: Number(total.rows[0]?.n ?? 0), pagina, porPagina };
    }

    const patronLegajo = `${escaparLike(busqueda)}%`;
    const patronNombre = `%${escaparLike(normalizar(busqueda))}%`;
    const where = "where legajo ilike $1 or busqueda ilike $2";

    const total = await this.pool.query<{ n: string }>(
      `select count(*) as n from alumnos ${where}`,
      [patronLegajo, patronNombre],
    );
    const { rows } = await this.pool.query<FilaAlumno>(
      `select * from alumnos ${where} order by apellido, nombre limit $3 offset $4`,
      [patronLegajo, patronNombre, limite, offset],
    );

    return { items: rows.map(mapearAlumno), total: Number(total.rows[0]?.n ?? 0), pagina, porPagina };
  }

  async contarAlumnos(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>("select count(*) as n from alumnos");
    return Number(rows[0]?.n ?? 0);
  }

  async importarAlumnos(alumnos: AlumnoImportado[]): Promise<ResultadoImport> {
    if (alumnos.length === 0) return { insertados: 0, actualizados: 0, sinCambios: 0 };

    return conTransaccion(async (cliente) => {
      let insertados = 0;
      let actualizados = 0;
      let sinCambios = 0;
      const marca = ahora();

      // Se procesa en bloques: mandar los ~2000 legajos de un padron real en
      // un solo `IN (...)` corre el riesgo de pasarse del limite de
      // parametros de una consulta.
      for (const bloque of enBloques(alumnos, 500)) {
        const legajos = bloque.map((a) => a.legajo);
        const { rows: existentes } = await cliente.query<FilaAlumno>(
          "select legajo, apellido, nombre, nombre_completo from alumnos where legajo = any($1::text[])",
          [legajos],
        );
        const porLegajo = new Map(existentes.map((f) => [f.legajo, f]));

        const aEscribir: AlumnoImportado[] = [];
        for (const alumno of bloque) {
          const existente = porLegajo.get(alumno.legajo);
          if (!existente) {
            insertados += 1;
            aEscribir.push(alumno);
          } else if (
            existente.apellido === alumno.apellido &&
            existente.nombre === alumno.nombre &&
            existente.nombre_completo === alumno.nombreCompleto
          ) {
            sinCambios += 1;
          } else {
            actualizados += 1;
            aEscribir.push(alumno);
          }
        }

        if (aEscribir.length === 0) continue;

        // Upsert por lote: se arman los `VALUES` de la consulta a mano en
        // vez de una fila por INSERT, para que 2000 alumnos se escriban en
        // un puñado de round-trips y no en miles.
        const valores: string[] = [];
        const params: unknown[] = [];
        aEscribir.forEach((alumno, indice) => {
          const base = indice * 5;
          valores.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
          params.push(alumno.legajo, alumno.apellido, alumno.nombre, alumno.nombreCompleto, normalizar(alumno.nombreCompleto));
        });
        params.push(marca);
        const marcaParam = `$${params.length}`;

        await cliente.query(
          `insert into alumnos (legajo, apellido, nombre, nombre_completo, busqueda, actualizado_en)
           select v.legajo, v.apellido, v.nombre, v.nombre_completo, v.busqueda, ${marcaParam}::timestamptz
             from (values ${valores.join(", ")}) as v(legajo, apellido, nombre, nombre_completo, busqueda)
           on conflict (legajo) do update
              set apellido = excluded.apellido,
                  nombre = excluded.nombre,
                  nombre_completo = excluded.nombre_completo,
                  busqueda = excluded.busqueda,
                  actualizado_en = excluded.actualizado_en`,
          params,
        );
      }

      return { insertados, actualizados, sinCambios };
    });
  }

  /* ---------------------------------------------------------------- */
  /* Motivos                                                           */
  /* ---------------------------------------------------------------- */

  async listarMotivos(soloActivos: boolean): Promise<MotivoExcepcion[]> {
    const where = soloActivos ? "where activo = true" : "";
    const { rows } = await this.pool.query<FilaMotivo>(
      `select * from motivos_excepcion ${where} order by orden, descripcion`,
    );
    return rows.map(mapearMotivo);
  }

  async obtenerMotivo(id: string): Promise<MotivoExcepcion | null> {
    const { rows } = await this.pool.query<FilaMotivo>("select * from motivos_excepcion where id = $1", [id]);
    return rows[0] ? mapearMotivo(rows[0]) : null;
  }

  async crearMotivo(datos: NuevoMotivo): Promise<MotivoExcepcion> {
    try {
      const { rows } = await this.pool.query<FilaMotivo>(
        `insert into motivos_excepcion (id, descripcion, activo, orden, creado_en)
         values ($1, $2, $3, $4, $5) returning *`,
        [randomUUID(), datos.descripcion, datos.activo, datos.orden, ahora()],
      );
      return mapearMotivo(rows[0]!);
    } catch (error) {
      throw this.traducirError(error, {
        idx_motivos_descripcion: { mensaje: "Ya existe un motivo con esa descripción.", campo: "descripcion" },
      });
    }
  }

  async actualizarMotivo(id: string, datos: NuevoMotivo): Promise<MotivoExcepcion> {
    try {
      const { rows } = await this.pool.query<FilaMotivo>(
        `update motivos_excepcion set descripcion = $2, activo = $3, orden = $4 where id = $1 returning *`,
        [id, datos.descripcion, datos.activo, datos.orden],
      );
      if (!rows[0]) throw new ErrorNoEncontrado("El motivo que intentas editar no existe.");
      return mapearMotivo(rows[0]);
    } catch (error) {
      throw this.traducirError(error, {
        idx_motivos_descripcion: { mensaje: "Ya existe un motivo con esa descripción.", campo: "descripcion" },
      });
    }
  }

  async eliminarMotivo(id: string): Promise<void> {
    const { rows: enUso } = await this.pool.query<{ n: string }>(
      "select count(*) as n from fichas_excepcion where motivo_id = $1",
      [id],
    );
    const n = Number(enUso[0]?.n ?? 0);
    if (n > 0) {
      throw new ErrorConflicto(
        `No se puede eliminar: hay ${n} ficha(s) usando este motivo. Desactivalo en lugar de borrarlo.`,
      );
    }
    const resultado = await this.pool.query("delete from motivos_excepcion where id = $1", [id]);
    if (resultado.rowCount === 0) throw new ErrorNoEncontrado("El motivo que intentas eliminar no existe.");
  }

  /* ---------------------------------------------------------------- */
  /* Fechas de recuperatorio                                           */
  /* ---------------------------------------------------------------- */

  async listarFechas(opciones: { soloActivas: boolean; soloFuturas: boolean }): Promise<FechaRecuperatorio[]> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (opciones.soloActivas) condiciones.push("fr.activo = true");
    if (opciones.soloFuturas) {
      params.push(hoyISO());
      condiciones.push(`fr.fecha >= $${params.length}`);
    }
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

    const { rows } = await this.pool.query<FilaFecha>(
      `select fr.*,
              (select count(*) from fichas_excepcion f
                where f.fecha_recuperatorio_id = fr.id and f.estado = 'vigente') as fichas_asignadas
         from fechas_recuperatorio fr
         ${where}
        order by fr.fecha`,
      params,
    );
    return rows.map(mapearFecha);
  }

  async obtenerFecha(id: string): Promise<FechaRecuperatorio | null> {
    const { rows } = await this.pool.query<FilaFecha>(
      `select fr.*,
              (select count(*) from fichas_excepcion f
                where f.fecha_recuperatorio_id = fr.id and f.estado = 'vigente') as fichas_asignadas
         from fechas_recuperatorio fr
        where fr.id = $1`,
      [id],
    );
    return rows[0] ? mapearFecha(rows[0]) : null;
  }

  async crearFecha(datos: NuevaFecha): Promise<FechaRecuperatorio> {
    try {
      const { rows } = await this.pool.query<FilaFecha>(
        `insert into fechas_recuperatorio (id, fecha, cupo, activo, creado_en)
         values ($1, $2, $3, $4, $5) returning *, 0 as fichas_asignadas`,
        [randomUUID(), datos.fecha, datos.cupo, datos.activo, ahora()],
      );
      return mapearFecha(rows[0]!);
    } catch (error) {
      throw this.traducirError(error, {
        fechas_recuperatorio_fecha_key: {
          mensaje: "Ya existe una fecha de recuperatorio cargada para ese dia.",
          campo: "fecha",
        },
      });
    }
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
      await this.pool.query(
        "update fechas_recuperatorio set fecha = $2, cupo = $3, activo = $4 where id = $1",
        [id, datos.fecha, datos.cupo, datos.activo],
      );
    } catch (error) {
      throw this.traducirError(error, {
        fechas_recuperatorio_fecha_key: {
          mensaje: "Ya existe una fecha de recuperatorio cargada para ese dia.",
          campo: "fecha",
        },
      });
    }
    return { ...existente, ...datos };
  }

  async eliminarFecha(id: string): Promise<void> {
    const { rows: enUso } = await this.pool.query<{ n: string }>(
      "select count(*) as n from fichas_excepcion where fecha_recuperatorio_id = $1",
      [id],
    );
    const n = Number(enUso[0]?.n ?? 0);
    if (n > 0) {
      throw new ErrorConflicto(
        `No se puede eliminar: hay ${n} ficha(s) asignadas a esta fecha. Desactivala en lugar de borrarla.`,
      );
    }
    const resultado = await this.pool.query("delete from fechas_recuperatorio where id = $1", [id]);
    if (resultado.rowCount === 0) throw new ErrorNoEncontrado("La fecha que intentas eliminar no existe.");
  }

  /* ---------------------------------------------------------------- */
  /* Usuarios                                                          */
  /* ---------------------------------------------------------------- */

  async listarUsuarios(): Promise<Usuario[]> {
    const { rows } = await this.pool.query<FilaUsuario>("select * from usuarios order by nombre");
    return rows.map(mapearUsuario);
  }

  async obtenerUsuario(id: string): Promise<Usuario | null> {
    const { rows } = await this.pool.query<FilaUsuario>("select * from usuarios where id = $1", [id]);
    return rows[0] ? mapearUsuario(rows[0]) : null;
  }

  async buscarUsuarioPorNombre(usuario: string): Promise<UsuarioConCredencial | null> {
    const { rows } = await this.pool.query<FilaUsuario>(
      "select * from usuarios where lower(usuario) = lower($1)",
      [usuario.trim()],
    );
    return rows[0] ? mapearUsuarioConCredencial(rows[0]) : null;
  }

  async crearUsuario(datos: NuevoUsuario): Promise<Usuario> {
    try {
      const { rows } = await this.pool.query<FilaUsuario>(
        `insert into usuarios (id, usuario, nombre, rol, password_hash, activo, creado_en)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [randomUUID(), datos.usuario, datos.nombre, datos.rol, datos.passwordHash, datos.activo, ahora()],
      );
      return mapearUsuario(rows[0]!);
    } catch (error) {
      throw this.traducirError(error, {
        idx_usuarios_usuario: { mensaje: "Ya existe un usuario con ese nombre.", campo: "usuario" },
      });
    }
  }

  async actualizarUsuario(
    id: string,
    datos: { nombre: string; rol: Rol; activo: boolean; passwordHash?: string },
  ): Promise<Usuario> {
    const existente = await this.obtenerUsuario(id);
    if (!existente) throw new ErrorNoEncontrado("El usuario que intentas editar no existe.");

    if (datos.passwordHash) {
      await this.pool.query(
        "update usuarios set nombre = $2, rol = $3, activo = $4, password_hash = $5 where id = $1",
        [id, datos.nombre, datos.rol, datos.activo, datos.passwordHash],
      );
    } else {
      await this.pool.query(
        "update usuarios set nombre = $2, rol = $3, activo = $4 where id = $1",
        [id, datos.nombre, datos.rol, datos.activo],
      );
    }
    return { ...existente, nombre: datos.nombre, rol: datos.rol, activo: datos.activo };
  }

  /* ---------------------------------------------------------------- */
  /* Fichas                                                            */
  /* ---------------------------------------------------------------- */

  async crearFicha(datos: NuevaFicha): Promise<FichaExcepcion> {
    return conTransaccion(async (cliente) => {
      await this.validarReferenciasFicha(cliente, datos.legajo, datos.motivoId, datos.fechaRecuperatorioId);
      await this.validarCupo(cliente, datos.fechaRecuperatorioId, null);
      await this.validarSinDuplicado(cliente, datos.legajo, datos.fechaRecuperatorioId, null);

      try {
        const marca = ahora();
        const { rows } = await cliente.query<FilaFicha>(
          `insert into fichas_excepcion (
             id, legajo, motivo_id, fecha_recuperatorio_id,
             archivo_path, archivo_nombre, archivo_tamano, observaciones,
             estado, creado_por, creado_en, actualizado_en
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'vigente', $9, $10, $10)
           returning *`,
          [
            randomUUID(),
            datos.legajo,
            datos.motivoId,
            datos.fechaRecuperatorioId,
            datos.archivoPath,
            datos.archivoNombre,
            datos.archivoTamano,
            datos.observaciones,
            datos.creadoPor,
            marca,
          ],
        );
        const ficha = mapearFicha(rows[0]!);

        await this.insertarAuditoria(cliente, {
          entidad: "ficha",
          entidadId: ficha.id,
          accion: "creada",
          detalle: `Ficha N° ${ficha.numero} para el legajo ${ficha.legajo}.`,
          usuarioId: ficha.creadoPor,
        });

        return ficha;
      } catch (error) {
        // Si dos operadores cargaron al mismo tiempo, la pre-validacion de
        // arriba puede haber pasado en ambas transacciones y ser la base la
        // que corta una de las dos con el trigger de cupo o el indice unico
        // de duplicados.
        throw this.traducirError(error, {
          idx_fichas_alumno_fecha_vigente: {
            mensaje: "Justo se cargó otra ficha para ese legajo y esa fecha. Volvé a intentar.",
            campo: "legajo",
          },
        });
      }
    });
  }

  async obtenerFicha(id: string): Promise<FichaExcepcionDetallada | null> {
    const { rows } = await this.pool.query<FilaFicha>("select * from fichas_excepcion where id = $1", [id]);
    if (!rows[0]) return null;
    const relacionados = await this.resolverRelacionados(this.pool, rows);
    return mapearFichaDetallada(rows[0], relacionados);
  }

  async listarFichas(filtros: FiltrosFichas, paginacion: Paginacion): Promise<Pagina<FichaExcepcionDetallada>> {
    const { limite, offset, pagina, porPagina } = sanearPaginacion(paginacion);
    const { where, params } = await this.construirWhere(filtros);

    const total = await this.pool.query<{ n: string }>(
      `select count(*) as n from fichas_excepcion f ${where}`,
      params,
    );

    const { rows } = await this.pool.query<FilaFicha>(
      `select * from fichas_excepcion f ${where}
        order by f.numero desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limite, offset],
    );

    const relacionados = await this.resolverRelacionados(this.pool, rows);
    return {
      items: rows.map((fila) => mapearFichaDetallada(fila, relacionados)),
      total: Number(total.rows[0]?.n ?? 0),
      pagina,
      porPagina,
    };
  }

  async listarFichasParaExportar(filtros: FiltrosFichas): Promise<FichaExcepcionDetallada[]> {
    const { where, params } = await this.construirWhere(filtros);
    const { rows } = await this.pool.query<FilaFicha>(
      `select * from fichas_excepcion f ${where} order by f.numero desc`,
      params,
    );
    const relacionados = await this.resolverRelacionados(this.pool, rows);
    return rows.map((fila) => mapearFichaDetallada(fila, relacionados));
  }

  async actualizarFicha(id: string, cambios: CambiosFicha, usuarioId: string): Promise<FichaExcepcion> {
    return conTransaccion(async (cliente) => {
      const { rows } = await cliente.query<FilaFicha>(
        "select * from fichas_excepcion where id = $1 for update",
        [id],
      );
      if (!rows[0]) throw new ErrorNoEncontrado("La ficha que intentas editar no existe.");
      const actual = mapearFicha(rows[0]);
      if (actual.estado === "anulada") {
        throw new ErrorConflicto("La ficha está anulada y ya no se puede editar.");
      }

      await this.validarReferenciasFicha(cliente, actual.legajo, cambios.motivoId, cambios.fechaRecuperatorioId);
      if (cambios.fechaRecuperatorioId !== actual.fechaRecuperatorioId) {
        await this.validarCupo(cliente, cambios.fechaRecuperatorioId, id);
        await this.validarSinDuplicado(cliente, actual.legajo, cambios.fechaRecuperatorioId, id);
      }

      const archivo = cambios.archivo;

      try {
        const { rows: actualizadas } = await cliente.query<FilaFicha>(
          `update fichas_excepcion
              set motivo_id = $2, fecha_recuperatorio_id = $3, observaciones = $4,
                  archivo_path = $5, archivo_nombre = $6, archivo_tamano = $7
            where id = $1
            returning *`,
          [
            id,
            cambios.motivoId,
            cambios.fechaRecuperatorioId,
            cambios.observaciones,
            archivo?.path ?? actual.archivoPath,
            archivo?.nombre ?? actual.archivoNombre,
            archivo?.tamano ?? actual.archivoTamano,
          ],
        );

        const detalles: string[] = [];
        if (cambios.motivoId !== actual.motivoId) detalles.push("motivo");
        if (cambios.fechaRecuperatorioId !== actual.fechaRecuperatorioId) detalles.push("fecha de recuperatorio");
        if ((cambios.observaciones ?? null) !== actual.observaciones) detalles.push("observaciones");
        if (archivo) detalles.push("adjunto PDF");

        await this.insertarAuditoria(cliente, {
          entidad: "ficha",
          entidadId: id,
          accion: "editada",
          detalle: detalles.length ? `Cambios en: ${detalles.join(", ")}.` : "Guardada sin cambios efectivos.",
          usuarioId,
        });

        return mapearFicha(actualizadas[0]!);
      } catch (error) {
        throw this.traducirError(error, {
          idx_fichas_alumno_fecha_vigente: {
            mensaje: "Justo se cargó otra ficha para ese legajo y esa fecha. Volvé a intentar.",
            campo: "fechaRecuperatorioId",
          },
        });
      }
    });
  }

  async anularFicha(id: string, motivo: string, usuarioId: string): Promise<FichaExcepcion> {
    return conTransaccion(async (cliente) => {
      const { rows } = await cliente.query<FilaFicha>(
        "select * from fichas_excepcion where id = $1 for update",
        [id],
      );
      if (!rows[0]) throw new ErrorNoEncontrado("La ficha que intentas anular no existe.");
      const actual = mapearFicha(rows[0]);
      if (actual.estado === "anulada") throw new ErrorConflicto("La ficha ya estaba anulada.");

      const marca = ahora();
      const { rows: anuladas } = await cliente.query<FilaFicha>(
        `update fichas_excepcion
            set estado = 'anulada', motivo_anulacion = $2, anulada_en = $3, anulada_por = $4
          where id = $1
          returning *`,
        [id, motivo, marca, usuarioId],
      );

      await this.insertarAuditoria(cliente, {
        entidad: "ficha",
        entidadId: id,
        accion: "anulada",
        detalle: motivo,
        usuarioId,
      });

      return mapearFicha(anuladas[0]!);
    });
  }

  async contarFichasVigentesPorFecha(fechaRecuperatorioId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      "select count(*) as n from fichas_excepcion where fecha_recuperatorio_id = $1 and estado = 'vigente'",
      [fechaRecuperatorioId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /* ---------------------------------------------------------------- */
  /* Auditoria                                                         */
  /* ---------------------------------------------------------------- */

  async registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
    await this.insertarAuditoria(this.pool, registro);
  }

  async listarAuditoria(entidadId: string): Promise<EventoAuditoria[]> {
    const { rows } = await this.pool.query<FilaAuditoria>(
      "select * from auditoria where entidad_id = $1 order by creado_en desc",
      [entidadId],
    );
    const idsUsuarios = [...new Set(rows.map((f) => f.usuario_id).filter((id): id is string => Boolean(id)))];
    const usuarios = await this.mapaUsuarios(this.pool, idsUsuarios);
    return rows.map((fila) => mapearAuditoria(fila, usuarios));
  }

  /* ---------------------------------------------------------------- */
  /* Resumen                                                           */
  /* ---------------------------------------------------------------- */

  async resumen() {
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { rows } = await this.pool.query<{
      fichas_vigentes: string;
      fichas_anuladas: string;
      alumnos: string;
      motivos_activos: string;
      fechas_activas: string;
      fichas_7d: string;
    }>(
      `select
         (select count(*) from fichas_excepcion where estado = 'vigente')  as fichas_vigentes,
         (select count(*) from fichas_excepcion where estado = 'anulada')  as fichas_anuladas,
         (select count(*) from alumnos)                                    as alumnos,
         (select count(*) from motivos_excepcion where activo = true)      as motivos_activos,
         (select count(*) from fechas_recuperatorio where activo = true)   as fechas_activas,
         (select count(*) from fichas_excepcion where creado_en >= $1)     as fichas_7d`,
      [hace7Dias],
    );
    const fila = rows[0]!;
    return {
      fichasVigentes: Number(fila.fichas_vigentes),
      fichasAnuladas: Number(fila.fichas_anuladas),
      alumnos: Number(fila.alumnos),
      motivosActivos: Number(fila.motivos_activos),
      fechasActivas: Number(fila.fechas_activas),
      fichasUltimos7Dias: Number(fila.fichas_7d),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Helpers privados                                                  */
  /* ---------------------------------------------------------------- */

  private async construirWhere(filtros: FiltrosFichas): Promise<{ where: string; params: unknown[] }> {
    const condiciones: string[] = [];
    const params: unknown[] = [];

    if (filtros.legajo?.trim()) {
      params.push(`${escaparLike(filtros.legajo.trim())}%`);
      condiciones.push(`f.legajo ilike $${params.length}`);
    }
    if (filtros.motivoId) {
      params.push(filtros.motivoId);
      condiciones.push(`f.motivo_id = $${params.length}`);
    }
    if (filtros.fechaRecuperatorioId) {
      params.push(filtros.fechaRecuperatorioId);
      condiciones.push(`f.fecha_recuperatorio_id = $${params.length}`);
    }
    if (filtros.cargaDesde) {
      params.push(filtros.cargaDesde);
      condiciones.push(`f.creado_en >= $${params.length}::date`);
    }
    if (filtros.cargaHasta) {
      // Se suma un dia y se compara con `<`, para incluir todo el dia
      // `cargaHasta` sin importar la hora del timestamp.
      params.push(filtros.cargaHasta);
      condiciones.push(`f.creado_en < ($${params.length}::date + interval '1 day')`);
    }
    if (filtros.estado && filtros.estado !== "todas") {
      params.push(filtros.estado);
      condiciones.push(`f.estado = $${params.length}`);
    }
    if (filtros.texto?.trim()) {
      // Sin JOIN embebido: se resuelven primero los legajos que matchean el
      // texto y se filtra fichas por esa lista. Ver el comentario de arriba
      // sobre por que no se usa la sintaxis de embedding de PostgREST.
      const patron = `%${escaparLike(normalizar(filtros.texto))}%`;
      const { rows } = await this.pool.query<{ legajo: string }>(
        "select legajo from alumnos where busqueda ilike $1",
        [patron],
      );
      if (rows.length === 0) {
        // Ningun alumno matchea: se fuerza un WHERE que no devuelve nada,
        // en vez de omitir el filtro (lo que mostraria todas las fichas).
        condiciones.push("false");
      } else {
        params.push(rows.map((r) => r.legajo));
        condiciones.push(`f.legajo = any($${params.length}::text[])`);
      }
    }

    return { where: condiciones.length ? `where ${condiciones.join(" and ")}` : "", params };
  }

  /** Resuelve alumnos/motivos/fechas/usuarios referenciados por un conjunto de fichas, en batch. */
  private async resolverRelacionados(
    ejecutor: Ejecutor,
    fichas: FilaFicha[],
  ): Promise<{
    alumnos: Map<string, Alumno>;
    motivos: Map<string, MotivoExcepcion>;
    fechas: Map<string, FechaRecuperatorio>;
    usuarios: Map<string, Usuario>;
  }> {
    const legajos = [...new Set(fichas.map((f) => f.legajo))];
    const motivoIds = [...new Set(fichas.map((f) => f.motivo_id))];
    const fechaIds = [...new Set(fichas.map((f) => f.fecha_recuperatorio_id))];
    const usuarioIds = [
      ...new Set([...fichas.map((f) => f.creado_por), ...fichas.map((f) => f.anulada_por).filter((x): x is string => Boolean(x))]),
    ];

    const [alumnos, motivos, fechas, usuarios] = await Promise.all([
      this.mapaAlumnos(ejecutor, legajos),
      this.mapaMotivos(ejecutor, motivoIds),
      this.mapaFechas(ejecutor, fechaIds),
      this.mapaUsuarios(ejecutor, usuarioIds),
    ]);

    return { alumnos, motivos, fechas, usuarios };
  }

  private async mapaAlumnos(ejecutor: Ejecutor, legajos: string[]): Promise<Map<string, Alumno>> {
    if (legajos.length === 0) return new Map();
    const { rows } = await ejecutor.query<FilaAlumno>("select * from alumnos where legajo = any($1::text[])", [legajos]);
    return new Map(rows.map((f) => [f.legajo, mapearAlumno(f)]));
  }

  private async mapaMotivos(ejecutor: Ejecutor, ids: string[]): Promise<Map<string, MotivoExcepcion>> {
    if (ids.length === 0) return new Map();
    const { rows } = await ejecutor.query<FilaMotivo>("select * from motivos_excepcion where id = any($1::uuid[])", [ids]);
    return new Map(rows.map((f) => [f.id, mapearMotivo(f)]));
  }

  private async mapaFechas(ejecutor: Ejecutor, ids: string[]): Promise<Map<string, FechaRecuperatorio>> {
    if (ids.length === 0) return new Map();
    const { rows } = await ejecutor.query<FilaFecha>(
      "select *, 0 as fichas_asignadas from fechas_recuperatorio where id = any($1::uuid[])",
      [ids],
    );
    return new Map(rows.map((f) => [f.id, mapearFecha(f)]));
  }

  private async mapaUsuarios(ejecutor: Ejecutor, ids: string[]): Promise<Map<string, Usuario>> {
    if (ids.length === 0) return new Map();
    const { rows } = await ejecutor.query<FilaUsuario>("select * from usuarios where id = any($1::uuid[])", [ids]);
    return new Map(rows.map((f) => [f.id, mapearUsuario(f)]));
  }

  /** Repite en el servidor la validacion que ya hizo el formulario: nunca confiar solo en el cliente. */
  private async validarReferenciasFicha(
    ejecutor: Ejecutor,
    legajo: string,
    motivoId: string,
    fechaId: string,
  ): Promise<void> {
    const { rows: alumnoRows } = await ejecutor.query("select 1 from alumnos where legajo = $1", [legajo]);
    if (alumnoRows.length === 0) {
      throw new ErrorValidacion("El legajo ingresado no existe en el padrón de alumnos.", "legajo");
    }

    const { rows: motivoRows } = await ejecutor.query<FilaMotivo>(
      "select * from motivos_excepcion where id = $1",
      [motivoId],
    );
    if (!motivoRows[0]) throw new ErrorValidacion("El motivo seleccionado no existe.", "motivoId");
    if (!motivoRows[0].activo) {
      throw new ErrorValidacion("El motivo seleccionado ya no está disponible.", "motivoId");
    }

    const { rows: fechaRows } = await ejecutor.query<FilaFecha>(
      "select * from fechas_recuperatorio where id = $1",
      [fechaId],
    );
    if (!fechaRows[0]) {
      throw new ErrorValidacion("La fecha de recuperatorio seleccionada no existe.", "fechaRecuperatorioId");
    }
    if (!fechaRows[0].activo) {
      throw new ErrorValidacion("La fecha de recuperatorio seleccionada ya no está disponible.", "fechaRecuperatorioId");
    }
  }

  private async validarCupo(ejecutor: Ejecutor, fechaId: string, excluirFichaId: string | null): Promise<void> {
    const { rows: fechaRows } = await ejecutor.query<FilaFecha>(
      "select * from fechas_recuperatorio where id = $1",
      [fechaId],
    );
    const fecha = fechaRows[0];
    if (!fecha || fecha.cupo === null) return;

    const { rows } = await ejecutor.query<{ n: string }>(
      `select count(*) as n from fichas_excepcion
        where fecha_recuperatorio_id = $1 and estado = 'vigente'
          and ($2::uuid is null or id <> $2)`,
      [fechaId, excluirFichaId],
    );
    const ocupadas = Number(rows[0]?.n ?? 0);

    if (ocupadas >= fecha.cupo) {
      throw new ErrorConflicto(
        `La fecha seleccionada ya cubrió su cupo de ${fecha.cupo} alumno(s). Elegí otra fecha.`,
        "fechaRecuperatorioId",
      );
    }
  }

  private async validarSinDuplicado(
    ejecutor: Ejecutor,
    legajo: string,
    fechaId: string,
    excluirFichaId: string | null,
  ): Promise<void> {
    const { rows } = await ejecutor.query<{ numero: number }>(
      `select numero from fichas_excepcion
        where legajo = $1 and fecha_recuperatorio_id = $2 and estado = 'vigente'
          and ($3::uuid is null or id <> $3)
        limit 1`,
      [legajo, fechaId, excluirFichaId],
    );
    if (rows[0]) {
      throw new ErrorConflicto(
        `El legajo ${legajo} ya tiene la ficha N° ${rows[0].numero} vigente para esa fecha de recuperatorio.`,
        "legajo",
      );
    }
  }

  private async insertarAuditoria(ejecutor: Ejecutor, registro: RegistroAuditoria): Promise<void> {
    await ejecutor.query(
      `insert into auditoria (id, entidad, entidad_id, accion, detalle, usuario_id, creado_en)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), registro.entidad, registro.entidadId, registro.accion, registro.detalle ?? null, registro.usuarioId, ahora()],
    );
  }

  /**
   * Traduce una violacion de restriccion de Postgres (codigo SQLSTATE) a un
   * error de dominio legible. `mapa` asocia el nombre de la constraint o
   * indice con el mensaje que corresponde; lo que no esta mapeado cae en un
   * mensaje generico en vez de filtrar el error crudo de la base.
   */
  private traducirError(
    error: unknown,
    mapa: Record<string, { mensaje: string; campo?: string }>,
  ): unknown {
    const pgError = error as { code?: string; constraint?: string; message?: string } | null;
    if (!pgError?.code) return error;

    // 23505 = unique_violation
    if (pgError.code === "23505" && pgError.constraint) {
      const traduccion = mapa[pgError.constraint];
      if (traduccion) return new ErrorConflicto(traduccion.mensaje, traduccion.campo);
      return new ErrorConflicto("Ese valor ya existe. Revisa los datos e intenta de nuevo.");
    }

    // 23514 = check_violation. El trigger de cupo usa RAISE EXCEPTION con un
    // mensaje ya pensado para el usuario final, en espanol: se relaya tal
    // cual en vez de generar uno generico.
    if (pgError.code === "23514" && pgError.message) {
      const mensaje = pgError.message.replace(/^.*?:\s*/, "").trim();
      return new ErrorConflicto(mensaje || "No se pudo guardar por una regla de negocio.");
    }

    return error;
  }
}
