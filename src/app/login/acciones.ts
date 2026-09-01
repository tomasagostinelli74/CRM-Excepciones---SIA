"use server";

import { redirect } from "next/navigation";

import { crearSesion, verificarPassword } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { esquemaLogin } from "@/lib/validacion/esquemas";

export interface EstadoLogin {
  error?: string;
}

/**
 * Verifica credenciales y abre sesion.
 *
 * El mensaje de error es deliberadamente el mismo para "usuario inexistente"
 * y "contrasena incorrecta": distinguirlos le permitiria a un atacante
 * enumerar que usuarios existen.
 */
export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  datos: FormData,
): Promise<EstadoLogin> {
  const parseo = esquemaLogin.safeParse({
    usuario: datos.get("usuario"),
    password: datos.get("password"),
  });

  if (!parseo.success) {
    return { error: "Completa el usuario y la contrasena." };
  }

  const repo = obtenerRepositorio();
  const usuario = await repo.buscarUsuarioPorNombre(parseo.data.usuario);

  // Se verifica el hash incluso si el usuario no existe, contra un hash
  // ficticio, para que el tiempo de respuesta no revele la diferencia.
  const hash =
    usuario?.passwordHash ??
    "scrypt$16384$8$1$00000000000000000000000000000000$" + "0".repeat(128);
  const coincide = await verificarPassword(parseo.data.password, hash);

  if (!usuario || !coincide) {
    return { error: "Usuario o contrasena incorrectos." };
  }
  if (!usuario.activo) {
    return { error: "Tu usuario esta desactivado. Comunicate con el administrador." };
  }

  await crearSesion({ usuarioId: usuario.id, usuario: usuario.usuario, rol: usuario.rol });

  const siguiente = datos.get("siguiente");
  // Solo se acepta una ruta interna: un "siguiente" con host propio
  // convertiria el login en un redirector abierto hacia sitios de phishing.
  const destino =
    typeof siguiente === "string" && siguiente.startsWith("/") && !siguiente.startsWith("//")
      ? siguiente
      : "/fichas";

  redirect(destino);
}
