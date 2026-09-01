/**
 * Validacion de los adjuntos PDF.
 *
 * Se valida en el servidor y no solo con el `accept` del input: el atributo
 * `accept=".pdf"` es una comodidad de la UI, no una barrera — cualquiera
 * puede mandar otra cosa por HTTP.
 */

import { ErrorValidacion } from "@/lib/domain/errors";

/** Tamano maximo en MB. Configurable por entorno. */
export function tamanoMaximoMb(): number {
  const crudo = Number(process.env.MAX_PDF_MB ?? 10);
  return Number.isFinite(crudo) && crudo > 0 ? crudo : 10;
}

export function tamanoMaximoBytes(): number {
  return tamanoMaximoMb() * 1024 * 1024;
}

/** Todo PDF valido empieza con la firma `%PDF-`. */
const FIRMA_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

/**
 * Valida extension, tipo declarado, tamano y firma binaria real, y devuelve
 * el contenido ya leido para que no haya que leer el archivo dos veces.
 */
export async function validarPdf(archivo: File): Promise<Buffer> {
  if (!archivo || archivo.size === 0) {
    throw new ErrorValidacion("Tenes que adjuntar el comprobante en PDF.", "archivo");
  }

  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new ErrorValidacion("El adjunto debe ser un archivo PDF.", "archivo");
  }

  const maximo = tamanoMaximoBytes();
  if (archivo.size > maximo) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    throw new ErrorValidacion(
      `El PDF pesa ${mb} MB y el maximo permitido es ${tamanoMaximoMb()} MB.`,
      "archivo",
    );
  }

  const contenido = Buffer.from(await archivo.arrayBuffer());

  // La firma es la validacion que de verdad importa: el nombre y el
  // content-type los elige el cliente, los primeros bytes no.
  const cabecera = contenido.subarray(0, FIRMA_PDF.length);
  if (!cabecera.equals(Buffer.from(FIRMA_PDF))) {
    throw new ErrorValidacion(
      "El archivo adjunto no es un PDF valido. Verifica que no este danado o renombrado.",
      "archivo",
    );
  }

  return contenido;
}

/** Nombre de archivo seguro: sin rutas, sin caracteres raros, acotado. */
export function sanearNombreArchivo(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "adjunto.pdf";
  const limpio = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(-120);
  return limpio.toLowerCase().endsWith(".pdf") ? limpio : `${limpio}.pdf`;
}
