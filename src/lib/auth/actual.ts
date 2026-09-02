import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { obtenerRepositorio } from "@/lib/data";
import { ErrorAutorizacion } from "@/lib/domain/errors";
import type { Rol, Usuario } from "@/lib/domain/types";
import { leerSesion } from "./session";

/**
 * Resolucion del usuario de la request.
 *
 * `cache()` de React memoiza por request: aunque el layout, la pagina y tres
 * Server Actions pregunten quien es el usuario, la base se consulta una sola
 * vez.
 *
 * Se recarga desde la base (y no se confia solo en la cookie) para que
 * desactivar un usuario o cambiarle el rol tenga efecto inmediato, sin
 * esperar a que expire la sesion.
 */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const sesion = await leerSesion();
  if (!sesion) return null;

  const usuario = await obtenerRepositorio().obtenerUsuario(sesion.usuarioId);
  if (!usuario || !usuario.activo) return null;
  return usuario;
});

/**
 * Exige sesion. Si no hay, redirige al login conservando el destino para
 * volver despues de entrar.
 */
export async function requerirUsuario(destino?: string): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) {
    const siguiente = destino ? `?siguiente=${encodeURIComponent(destino)}` : "";
    redirect(`/login${siguiente}`);
  }
  return usuario;
}

/**
 * Exige rol admin. Es la barrera real de autorizacion: ocultar el link en el
 * menu no alcanza, porque la URL se puede escribir a mano.
 */
export async function requerirAdmin(destino?: string): Promise<Usuario> {
  const usuario = await requerirUsuario(destino);
  if (usuario.rol !== "admin") {
    redirect("/fichas?error=solo-admin");
  }
  return usuario;
}

/**
 * Version para Server Actions: lanza en vez de redirigir, asi la accion
 * devuelve un error que el formulario puede mostrar.
 */
export async function requerirUsuarioEnAccion(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) {
    throw new ErrorAutorizacion("Tu sesión expiró. Volvé a iniciar sesión para continuar.");
  }
  return usuario;
}

export async function requerirRolEnAccion(rol: Rol): Promise<Usuario> {
  const usuario = await requerirUsuarioEnAccion();
  if (usuario.rol !== rol) {
    throw new ErrorAutorizacion("No tenés permisos para realizar esta acción.");
  }
  return usuario;
}
