import { NextResponse } from "next/server";

import { usuarioActual } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { obtenerStorage } from "@/lib/storage";

/**
 * Descarga del PDF adjunto de una ficha.
 *
 * Es el UNICO camino hacia los archivos: el storage vive fuera de /public,
 * asi que no existe una URL directa al PDF. Cada descarga verifica sesion,
 * igual que cuando se pase a Supabase Storage con bucket privado + signed
 * URLs de vida corta.
 */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const usuario = await usuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
  }

  const { id } = await params;
  const ficha = await obtenerRepositorio().obtenerFicha(id);
  if (!ficha) {
    return NextResponse.json({ error: "La ficha no existe." }, { status: 404 });
  }

  const archivo = await obtenerStorage().leer(ficha.archivoPath);
  if (!archivo) {
    return NextResponse.json(
      { error: "El archivo adjunto no se encuentra en el almacenamiento." },
      { status: 404 },
    );
  }

  // Nombre legible al descargar: ficha-000123-1250123.pdf
  const nombre = `ficha-${String(ficha.numero).padStart(6, "0")}-${ficha.legajo}.pdf`;

  return new NextResponse(new Uint8Array(archivo.contenido), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` abre el PDF en el visor del navegador, que es lo que quiere
      // el operador; el navegador igual ofrece guardarlo.
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Content-Length": String(archivo.contenido.byteLength),
      // Documentacion personal de un alumno: no debe quedar en caches
      // intermedias ni en el disco del navegador.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
