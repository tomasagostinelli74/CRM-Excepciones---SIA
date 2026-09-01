/**
 * Utilidades de fecha.
 *
 * Regla del proyecto: las fechas de calendario (recuperatorio) se manejan
 * SIEMPRE como `YYYY-MM-DD` en texto. Nunca se construye un `Date` a partir
 * de ellas para mostrarlas, porque `new Date("2026-03-14")` se interpreta en
 * UTC y en Argentina (UTC-3) se muestra un dia antes.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** `YYYY-MM-DD` de hoy segun la zona horaria configurada. */
export function hoyISO(zona = process.env.TZ ?? "America/Argentina/Buenos_Aires"): string {
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formato.format(new Date());
}

/** `true` si el texto es una fecha de calendario valida (`YYYY-MM-DD`). */
export function esFechaISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number) as [number, number, number];
  if (mes < 1 || mes > 12 || dia < 1) return false;
  // El dia 0 del mes siguiente es el ultimo dia del mes pedido.
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dia <= ultimoDia;
}

/** `2026-03-14` -> `14/03/2026`. Sin construir Date, para no correr el dia. */
export function formatearFecha(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const [anio, mes, dia] = valor.split("-") as [string, string, string];
  return `${dia}/${mes}/${anio}`;
}

/** `2026-03-14` -> `14 de marzo de 2026`. */
export function formatearFechaLarga(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const [anio, mes, dia] = valor.split("-") as [string, string, string];
  const nombreMes = MESES[Number(mes) - 1] ?? mes;
  return `${Number(dia)} de ${nombreMes} de ${anio}`;
}

/** Timestamp ISO de auditoria -> `14/03/2026 09:35`. */
export function formatearInstante(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: process.env.TZ ?? "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

/** Instante actual en ISO-8601 UTC. Unico punto de verdad para auditoria. */
export function ahora(): string {
  return new Date().toISOString();
}
