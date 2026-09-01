import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import type { Rol } from "@/lib/domain/types";

/**
 * Sesiones en cookie firmada (HMAC-SHA256).
 *
 * Es sin estado a proposito: no hay tabla de sesiones que limpiar. La
 * revocacion igual funciona porque cada request recarga el usuario desde la
 * base y verifica que siga activo (ver ./actual.ts), asi que desactivar un
 * usuario lo deja afuera en el siguiente click.
 *
 * Cuando entre Supabase Auth, este modulo se reemplaza por el helper de
 * sesion de @supabase/ssr y el resto de la app no se toca: todos consumen
 * `usuarioActual()`.
 */

const NOMBRE_COOKIE = "crm_sesion";
const DURACION_SEGUNDOS = 60 * 60 * 8; // 8 horas: una jornada de mesa de entrada

export interface DatosSesion {
  usuarioId: string;
  usuario: string;
  rol: Rol;
  /** Epoch en segundos. */
  expira: number;
}

/**
 * Secreto de firma. En produccion es obligatorio definirlo: sin el, quien
 * conozca el default podria fabricarse una cookie de admin.
 */
function secreto(): string {
  const valor = process.env.SESSION_SECRET;
  if (valor && valor.length >= 32) return valor;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta SESSION_SECRET (minimo 32 caracteres). Generalo con: openssl rand -base64 32",
    );
  }
  // Solo desarrollo: efimero por proceso, se pierde al reiniciar.
  const cache = globalThis as unknown as { __crmSecretoDev?: string };
  cache.__crmSecretoDev ??= randomBytes(32).toString("hex");
  return cache.__crmSecretoDev;
}

function firmar(payload: string): string {
  return createHmac("sha256", secreto()).update(payload).digest("base64url");
}

function serializar(datos: DatosSesion): string {
  const payload = Buffer.from(JSON.stringify(datos), "utf8").toString("base64url");
  return `${payload}.${firmar(payload)}`;
}

function deserializar(token: string): DatosSesion | null {
  const punto = token.lastIndexOf(".");
  if (punto <= 0) return null;

  const payload = token.slice(0, punto);
  const firma = token.slice(punto + 1);

  const esperada = Buffer.from(firmar(payload));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const datos = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DatosSesion;
    if (typeof datos.usuarioId !== "string" || typeof datos.expira !== "number") return null;
    if (datos.expira * 1000 < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

export async function crearSesion(datos: Omit<DatosSesion, "expira">): Promise<void> {
  const sesion: DatosSesion = {
    ...datos,
    expira: Math.floor(Date.now() / 1000) + DURACION_SEGUNDOS,
  };
  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, serializar(sesion), {
    httpOnly: true, // el JS del navegador no puede leerla
    sameSite: "lax", // corta CSRF desde otro sitio sin romper la navegacion normal
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SEGUNDOS,
  });
}

export async function leerSesion(): Promise<DatosSesion | null> {
  const almacen = await cookies();
  const token = almacen.get(NOMBRE_COOKIE)?.value;
  return token ? deserializar(token) : null;
}

export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  almacen.delete(NOMBRE_COOKIE);
}

export { NOMBRE_COOKIE };
