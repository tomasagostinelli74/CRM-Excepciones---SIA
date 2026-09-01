/**
 * Normalizacion de texto compartida entre el importador, la busqueda y la UI.
 */

/** Colapsa espacios repetidos y recorta los de los extremos. */
export function limpiarEspacios(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
}

/**
 * Version comparable de un texto: sin acentos, sin signos y en minusculas.
 * Se usa para buscar "Perez" y que encuentre "Perez", "Pérez" y "PEREZ".
 */
export function normalizar(valor: string): string {
  return limpiarEspacios(valor)
    .normalize("NFD")
    // Quita los diacriticos combinantes que dejo el NFD.
    .replace(/[\u0300-\u036f]/g, "")
    // El Excel del padron usa el acento agudo suelto como apostrofo
    // ("D´Amore"); lo unificamos con el apostrofo recto.
    .replace(/[´‘’]/g, "'")
    .toLowerCase();
}

/** Capitaliza cada palabra respetando particulas y guiones. */
export function capitalizarNombre(valor: string): string {
  const particulas = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "di", "van", "von"]);
  return limpiarEspacios(valor)
    .toLowerCase()
    .split(" ")
    .map((palabra, indice) => {
      if (indice > 0 && particulas.has(palabra)) return palabra;
      return palabra.replace(/(^|[-'´])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase());
    })
    .join(" ");
}

/** Escapa los comodines de LIKE para que una busqueda literal no los active. */
export function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}
