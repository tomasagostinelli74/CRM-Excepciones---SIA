/**
 * Adjuntos en Supabase Storage.
 *
 * El bucket (`adjuntos-fichas`, creado por
 * supabase/migrations/20260101000200_storage_adjuntos.sql) es PRIVADO: no
 * tiene URL publica. Este adaptador usa la "service role key" desde el
 * servidor, la misma clave secreta que usa el adaptador de datos, que
 * accede al bucket sin pasar por politicas de storage (igual que el resto
 * de la app: el unico que le habla a Supabase es el servidor de Next, nunca
 * el navegador).
 *
 * Sin `server-only`: mismo motivo que en el resto de los adaptadores, para
 * que los scripts de CLI puedan usarlo fuera del bundler de Next.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ErrorValidacion } from "@/lib/domain/errors";
import type { ArchivoGuardado, ArchivoLeido, Storage } from "./index";
import { sanearNombreArchivo, validarPdf } from "./pdf";

const NOMBRE_BUCKET_POR_DEFECTO = "adjuntos-fichas";

function credenciales(): { url: string; claveServicio: string } {
  const url = process.env.SUPABASE_URL;
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !claveServicio) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. " +
        "Estan en el proyecto de Supabase, en Project Settings -> API.",
    );
  }
  return { url, claveServicio };
}

export class SupabaseStorage implements Storage {
  private readonly bucket: string;
  private cliente: SupabaseClient | null = null;

  constructor(bucket = process.env.SUPABASE_STORAGE_BUCKET ?? NOMBRE_BUCKET_POR_DEFECTO) {
    this.bucket = bucket;
  }

  private obtenerCliente(): SupabaseClient {
    if (this.cliente) return this.cliente;
    const { url, claveServicio } = credenciales();
    // `persistSession: false`: este cliente vive en el servidor, no hay
    // sesion de navegador que persistir, y evita que intente usar
    // localStorage (que no existe en Node).
    this.cliente = createClient(url, claveServicio, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.cliente;
  }

  async guardar(archivo: File, prefijo: string): Promise<ArchivoGuardado> {
    const contenido = await validarPdf(archivo);
    const nombre = sanearNombreArchivo(archivo.name);

    const hoy = new Date();
    const carpeta = `${hoy.getUTCFullYear()}/${String(hoy.getUTCMonth() + 1).padStart(2, "0")}`;
    const path = `${carpeta}/${prefijo}-${crypto.randomUUID()}-${nombre}`;

    const { error } = await this.obtenerCliente()
      .storage.from(this.bucket)
      .upload(path, contenido, { contentType: "application/pdf", upsert: false });

    if (error) {
      throw new ErrorValidacion(`No se pudo guardar el adjunto en Supabase Storage: ${error.message}`, "archivo");
    }

    return { path, nombre, tamano: contenido.byteLength };
  }

  async leer(path: string): Promise<ArchivoLeido | null> {
    const { data, error } = await this.obtenerCliente().storage.from(this.bucket).download(path);

    if (error) {
      // Supabase Storage devuelve un error generico tanto para "no existe"
      // como para otras fallas; se trata como "no encontrado" en vez de
      // relanzar, para que la ruta de descarga pueda responder 404 en
      // limpio (ver src/app/api/fichas/[id]/archivo/route.ts).
      return null;
    }

    const contenido = Buffer.from(await data.arrayBuffer());
    return {
      contenido,
      nombre: path.split("/").pop() ?? "adjunto.pdf",
      tipo: "application/pdf",
    };
  }

  async eliminar(path: string): Promise<void> {
    // `.remove()` de Supabase Storage no falla si el archivo ya no esta,
    // asi que no hace falta un chequeo previo de existencia.
    const { error } = await this.obtenerCliente().storage.from(this.bucket).remove([path]);
    if (error) {
      throw new Error(`No se pudo eliminar el adjunto de Supabase Storage: ${error.message}`);
    }
  }
}
