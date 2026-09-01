/**
 * Piezas de UI compartidas.
 *
 * Son componentes de servidor salvo que se indique lo contrario: no llevan
 * estado, solo estructura y estilos consistentes.
 */

import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Avisos                                                              */
/* ------------------------------------------------------------------ */

export function Aviso({
  tipo = "info",
  titulo,
  children,
}: {
  tipo?: "error" | "ok" | "info";
  titulo?: string;
  children: ReactNode;
}) {
  const iconos = { error: "!", ok: "✓", info: "i" } as const;
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      <span
        aria-hidden
        className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold"
      >
        {iconos[tipo]}
      </span>
      <div className="min-w-0">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        <div className={titulo ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estructura de pagina                                                */
/* ------------------------------------------------------------------ */

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descripcion ? (
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            {descripcion}
          </p>
        ) : null}
      </div>
      {acciones ? <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div> : null}
    </div>
  );
}

export function Panel({
  titulo,
  descripcion,
  acciones,
  children,
  sinPadding = false,
}: {
  titulo?: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
  sinPadding?: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      {titulo ? (
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="min-w-0">
            <h2 className="font-semibold">{titulo}</h2>
            {descripcion ? (
              <p className="mt-0.5 text-sm" style={{ color: "var(--texto-suave)" }}>
                {descripcion}
              </p>
            ) : null}
          </div>
          {acciones ? <div className="flex gap-2">{acciones}</div> : null}
        </header>
      ) : null}
      <div className={sinPadding ? undefined : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

/** Estado vacio: explica que pasa y cual es el proximo paso, no solo "sin datos". */
export function Vacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="font-semibold">{titulo}</p>
      {descripcion ? (
        <p className="max-w-md text-sm" style={{ color: "var(--texto-suave)" }}>
          {descripcion}
        </p>
      ) : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export function Chip({ estado }: { estado: "vigente" | "anulada" }) {
  return (
    <span className={`chip chip-${estado}`}>
      {estado === "vigente" ? "Vigente" : "Anulada"}
    </span>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-tenue)" }}>
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

/** Tarjeta de metrica del tablero. */
export function Metrica({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-tenue)" }}>
        {etiqueta}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      {detalle ? (
        <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
          {detalle}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paginacion                                                          */
/* ------------------------------------------------------------------ */

export function Paginador({
  pagina,
  porPagina,
  total,
  href,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  /** Construye la URL de una pagina conservando los filtros actuales. */
  href: (pagina: number) => string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
      style={{ borderColor: "var(--borde)" }}
      aria-label="Paginacion"
    >
      <p className="text-sm tabular-nums" style={{ color: "var(--texto-suave)" }}>
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-2">
        {pagina > 1 ? (
          <Link className="boton boton-secundario" href={href(pagina - 1)} rel="prev">
            Anterior
          </Link>
        ) : (
          <span className="boton boton-secundario opacity-50" aria-disabled>
            Anterior
          </span>
        )}
        <span className="text-sm tabular-nums" style={{ color: "var(--texto-suave)" }}>
          {pagina} / {paginas}
        </span>
        {pagina < paginas ? (
          <Link className="boton boton-secundario" href={href(pagina + 1)} rel="next">
            Siguiente
          </Link>
        ) : (
          <span className="boton boton-secundario opacity-50" aria-disabled>
            Siguiente
          </span>
        )}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Panel desplegable                                                   */
/* ------------------------------------------------------------------ */

/**
 * Panel que se abre y cierra, construido sobre `<details>`.
 *
 * A diferencia de montar el contenido solo cuando esta abierto, el formulario
 * queda SIEMPRE en el HTML: funciona con JavaScript deshabilitado, el teclado
 * lo maneja el navegador y no hace falta cablear aria-expanded a mano.
 */
export function PanelDesplegable({
  titulo,
  resumen,
  abierto,
  alCambiar,
  children,
}: {
  titulo: string;
  resumen: string;
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="panel overflow-hidden"
      open={abierto}
      onToggle={(evento) => alCambiar((evento.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold sm:px-5">
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-xs" style={{ color: "var(--texto-tenue)" }}>
            {abierto ? "▾" : "▸"}
          </span>
          {abierto ? titulo : resumen}
        </span>
      </summary>
      <div className="border-t p-4 sm:p-5" style={{ borderColor: "var(--borde)" }}>
        {children}
      </div>
    </details>
  );
}
