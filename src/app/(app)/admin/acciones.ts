"use server";

import { revalidatePath } from "next/cache";

import { hashearPassword, requerirRolEnAccion } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { campoDeError, ErrorValidacion, mensajeDeError } from "@/lib/domain/errors";
import { parsearExcelAlumnos } from "@/lib/import/alumnos";
import {
  erroresDeZod,
  esquemaFecha,
  esquemaMotivo,
  esquemaPassword,
  esquemaUsuario,
} from "@/lib/validacion/esquemas";

/**
 * Server Actions del panel de administracion.
 *
 * TODAS empiezan con `requerirRolEnAccion("admin")`. Esa linea es la barrera
 * real: la navegacion oculta estos enlaces al operador, pero una Server
 * Action es un endpoint HTTP y se puede invocar directamente.
 */

export interface EstadoAdmin {
  ok?: boolean;
  mensaje?: string;
  error?: string;
  errores?: Record<string, string>;
}

/** `on` es lo que manda un checkbox marcado; ausente significa desmarcado. */
const marcado = (valor: FormDataEntryValue | null): boolean => valor === "on" || valor === "true";

function alFallar(error: unknown): EstadoAdmin {
  const campo = campoDeError(error);
  const mensaje = mensajeDeError(error);
  return { error: mensaje, errores: campo ? { [campo]: mensaje } : undefined };
}

/* ------------------------------------------------------------------ */
/* Motivos                                                             */
/* ------------------------------------------------------------------ */

export async function guardarMotivo(_previo: EstadoAdmin, datos: FormData): Promise<EstadoAdmin> {
  try {
    await requerirRolEnAccion("admin");

    const parseo = esquemaMotivo.safeParse({
      descripcion: datos.get("descripcion"),
      activo: marcado(datos.get("activo")),
      orden: datos.get("orden") || 0,
    });
    if (!parseo.success) {
      return { error: "Revisa los campos marcados.", errores: erroresDeZod(parseo.error) };
    }

    const repo = obtenerRepositorio();
    const id = datos.get("id");

    if (typeof id === "string" && id) {
      await repo.actualizarMotivo(id, parseo.data);
      revalidatePath("/admin/motivos");
      return { ok: true, mensaje: "Motivo actualizado." };
    }

    await repo.crearMotivo(parseo.data);
    revalidatePath("/admin/motivos");
    return { ok: true, mensaje: "Motivo creado." };
  } catch (error) {
    return alFallar(error);
  }
}

export async function eliminarMotivo(_previo: EstadoAdmin, datos: FormData): Promise<EstadoAdmin> {
  try {
    await requerirRolEnAccion("admin");
    const id = datos.get("id");
    if (typeof id !== "string" || !id) return { error: "No se pudo identificar el motivo." };

    await obtenerRepositorio().eliminarMotivo(id);
    revalidatePath("/admin/motivos");
    return { ok: true, mensaje: "Motivo eliminado." };
  } catch (error) {
    return alFallar(error);
  }
}

/* ------------------------------------------------------------------ */
/* Fechas de recuperatorio                                             */
/* ------------------------------------------------------------------ */

export async function guardarFecha(_previo: EstadoAdmin, datos: FormData): Promise<EstadoAdmin> {
  try {
    await requerirRolEnAccion("admin");

    const parseo = esquemaFecha.safeParse({
      fecha: datos.get("fecha"),
      cupo: datos.get("cupo") ?? "",
      activo: marcado(datos.get("activo")),
    });
    if (!parseo.success) {
      return { error: "Revisa los campos marcados.", errores: erroresDeZod(parseo.error) };
    }

    const repo = obtenerRepositorio();
    const id = datos.get("id");

    if (typeof id === "string" && id) {
      await repo.actualizarFecha(id, parseo.data);
      revalidatePath("/admin/fechas");
      return { ok: true, mensaje: "Fecha actualizada." };
    }

    await repo.crearFecha(parseo.data);
    revalidatePath("/admin/fechas");
    return { ok: true, mensaje: "Fecha creada." };
  } catch (error) {
    return alFallar(error);
  }
}

export async function eliminarFecha(_previo: EstadoAdmin, datos: FormData): Promise<EstadoAdmin> {
  try {
    await requerirRolEnAccion("admin");
    const id = datos.get("id");
    if (typeof id !== "string" || !id) return { error: "No se pudo identificar la fecha." };

    await obtenerRepositorio().eliminarFecha(id);
    revalidatePath("/admin/fechas");
    return { ok: true, mensaje: "Fecha eliminada." };
  } catch (error) {
    return alFallar(error);
  }
}

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

export async function guardarUsuario(_previo: EstadoAdmin, datos: FormData): Promise<EstadoAdmin> {
  try {
    const admin = await requerirRolEnAccion("admin");

    const parseo = esquemaUsuario.safeParse({
      usuario: datos.get("usuario"),
      nombre: datos.get("nombre"),
      rol: datos.get("rol"),
      activo: marcado(datos.get("activo")),
    });
    if (!parseo.success) {
      return { error: "Revisa los campos marcados.", errores: erroresDeZod(parseo.error) };
    }

    const repo = obtenerRepositorio();
    const id = datos.get("id");
    const passwordCrudo = datos.get("password");
    const password = typeof passwordCrudo === "string" ? passwordCrudo : "";

    if (typeof id === "string" && id) {
      // Un admin no puede quitarse a si mismo el rol ni desactivarse: si lo
      // hiciera perderia el acceso al panel en el mismo click, y si es el
      // unico admin el sistema queda sin administrador.
      if (id === admin.id && (parseo.data.rol !== "admin" || !parseo.data.activo)) {
        throw new ErrorValidacion(
          "No podés quitarte tu propio rol de administrador ni desactivar tu usuario.",
        );
      }

      let passwordHash: string | undefined;
      if (password) {
        const validacion = esquemaPassword.safeParse(password);
        if (!validacion.success) {
          return {
            error: "Revisa los campos marcados.",
            errores: { password: validacion.error.issues[0]?.message ?? "Contrasena invalida." },
          };
        }
        passwordHash = await hashearPassword(validacion.data);
      }

      await repo.actualizarUsuario(id, { ...parseo.data, passwordHash });
      revalidatePath("/admin/usuarios");
      return { ok: true, mensaje: passwordHash ? "Usuario y contraseña actualizados." : "Usuario actualizado." };
    }

    // Al crear, la contrasena es obligatoria.
    const validacion = esquemaPassword.safeParse(password);
    if (!validacion.success) {
      return {
        error: "Revisa los campos marcados.",
        errores: { password: validacion.error.issues[0]?.message ?? "Contrasena invalida." },
      };
    }

    await repo.crearUsuario({
      ...parseo.data,
      passwordHash: await hashearPassword(validacion.data),
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, mensaje: "Usuario creado." };
  } catch (error) {
    return alFallar(error);
  }
}

/* ------------------------------------------------------------------ */
/* Import del padron de alumnos                                        */
/* ------------------------------------------------------------------ */

export interface EstadoImport extends EstadoAdmin {
  vista?: {
    totalFilas: number;
    validos: number;
    rechazadas: { fila: number; legajo: string; valor: string; motivo: string }[];
    duplicados: string[];
    muestra: { legajo: string; apellido: string; nombre: string }[];
  };
  resultado?: { insertados: number; actualizados: number; sinCambios: number };
}

/**
 * Vista previa del Excel: parsea y muestra que se va a cargar, SIN escribir
 * en la base. El admin confirma despues. Es deliberado: un import a ciegas
 * sobre 2000 alumnos es dificil de deshacer.
 */
export async function previsualizarPadron(
  _previo: EstadoImport,
  datos: FormData,
): Promise<EstadoImport> {
  try {
    await requerirRolEnAccion("admin");

    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new ErrorValidacion("Selecciona el archivo Excel del padrón.", "archivo");
    }
    if (!/\.xlsx$/i.test(archivo.name)) {
      throw new ErrorValidacion("El padrón debe ser un archivo Excel (.xlsx).", "archivo");
    }

    const parseo = await parsearExcelAlumnos(Buffer.from(await archivo.arrayBuffer()));

    return {
      ok: true,
      vista: {
        totalFilas: parseo.totalFilas,
        validos: parseo.alumnos.length,
        rechazadas: parseo.rechazadas.slice(0, 50),
        duplicados: parseo.duplicadosEnArchivo.slice(0, 50),
        muestra: parseo.alumnos
          .slice(0, 8)
          .map(({ legajo, apellido, nombre }) => ({ legajo, apellido, nombre })),
      },
    };
  } catch (error) {
    return alFallar(error);
  }
}

/**
 * Confirma el import. Es un upsert: agrega los legajos nuevos y actualiza los
 * que cambiaron. NO borra a los que no aparecen en el archivo, para que subir
 * un padron parcial por error no deje sin validar a media facultad.
 */
export async function importarPadron(
  _previo: EstadoImport,
  datos: FormData,
): Promise<EstadoImport> {
  try {
    const admin = await requerirRolEnAccion("admin");

    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new ErrorValidacion("Selecciona el archivo Excel del padrón.", "archivo");
    }

    const parseo = await parsearExcelAlumnos(Buffer.from(await archivo.arrayBuffer()));
    const repo = obtenerRepositorio();
    const resultado = await repo.importarAlumnos(parseo.alumnos);

    await repo.registrarAuditoria({
      entidad: "padron",
      entidadId: "alumnos",
      accion: "importado",
      detalle:
        `Archivo "${archivo.name}": ${resultado.insertados} nuevos, ` +
        `${resultado.actualizados} actualizados, ${resultado.sinCambios} sin cambios, ` +
        `${parseo.rechazadas.length} filas rechazadas.`,
      usuarioId: admin.id,
    });

    revalidatePath("/admin/alumnos");
    revalidatePath("/admin");

    return {
      ok: true,
      mensaje: `Padron actualizado: ${resultado.insertados} nuevos, ${resultado.actualizados} actualizados.`,
      resultado,
    };
  } catch (error) {
    return alFallar(error);
  }
}
