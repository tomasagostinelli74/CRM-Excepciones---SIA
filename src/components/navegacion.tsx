"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { Rol } from "@/lib/domain/types";

interface Enlace {
  href: string;
  texto: string;
  /** Roles que ven el enlace. La barrera real esta en el servidor. */
  roles: Rol[];
}

const ENLACES: Enlace[] = [
  { href: "/fichas", texto: "Fichas", roles: ["admin", "operador"] },
  { href: "/fichas/nueva", texto: "Nueva ficha", roles: ["admin", "operador"] },
  { href: "/admin", texto: "Tablero", roles: ["admin"] },
  { href: "/admin/motivos", texto: "Motivos", roles: ["admin"] },
  { href: "/admin/fechas", texto: "Fechas", roles: ["admin"] },
  { href: "/admin/alumnos", texto: "Alumnos", roles: ["admin"] },
  { href: "/admin/usuarios", texto: "Usuarios", roles: ["admin"] },
];

/**
 * Navegacion principal.
 *
 * Filtra por rol solo para no mostrar links inutiles: cada pagina de admin
 * vuelve a comprobar el rol en el servidor, asi que escribir la URL a mano
 * no sirve de nada.
 */
export function Navegacion({
  rol,
  nombre,
  usuario,
  alSalir,
}: {
  rol: Rol;
  nombre: string;
  usuario: string;
  alSalir: () => Promise<void>;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const visibles = ENLACES.filter((enlace) => enlace.roles.includes(rol));

  const esActivo = (href: string) =>
    href === "/fichas" || href === "/admin" ? ruta === href : ruta.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b backdrop-blur" style={{ borderColor: "var(--borde)", background: "color-mix(in srgb, var(--superficie) 88%, transparent)" }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/fichas" className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: "var(--color-acento-600)" }}
            aria-hidden
          >
            EI
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-bold leading-tight">Fichas de excepción</span>
            <span className="block text-xs leading-tight" style={{ color: "var(--texto-tenue)" }}>
              Examen de Ingreso
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden flex-1 items-center gap-1 md:flex" aria-label="Principal">
          {visibles.map((enlace) => (
            <Link
              key={enlace.href}
              href={enlace.href}
              aria-current={esActivo(enlace.href) ? "page" : undefined}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                esActivo(enlace.href)
                  ? { background: "var(--superficie-2)", color: "var(--texto)" }
                  : { color: "var(--texto-suave)" }
              }
            >
              {enlace.texto}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight">{nombre}</p>
            <p className="text-xs leading-tight" style={{ color: "var(--texto-tenue)" }}>
              {usuario} · {rol === "admin" ? "Administrador" : "Operador"}
            </p>
          </div>
          <form action={alSalir}>
            <button type="submit" className="boton boton-sutil text-sm">
              Salir
            </button>
          </form>
          <button
            type="button"
            className="boton boton-secundario px-2.5 py-1.5 md:hidden"
            aria-expanded={abierto}
            aria-controls="menu-movil"
            onClick={() => setAbierto((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <span aria-hidden>{abierto ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {abierto ? (
        <nav
          id="menu-movil"
          className="border-t px-4 py-2 md:hidden"
          style={{ borderColor: "var(--borde)", background: "var(--superficie)" }}
          aria-label="Principal"
        >
          {visibles.map((enlace) => (
            <Link
              key={enlace.href}
              href={enlace.href}
              onClick={() => setAbierto(false)}
              aria-current={esActivo(enlace.href) ? "page" : undefined}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium"
              style={
                esActivo(enlace.href)
                  ? { background: "var(--superficie-2)", color: "var(--texto)" }
                  : { color: "var(--texto-suave)" }
              }
            >
              {enlace.texto}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
