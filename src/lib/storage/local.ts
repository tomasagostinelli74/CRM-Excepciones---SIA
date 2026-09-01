import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

import { ErrorValidacion } from "@/lib/domain/errors";
import type { ArchivoGuardado, ArchivoLeido, Storage } from "./index";
import { sanearNombreArchivo, validarPdf } from "./pdf";

/**
 * Adjuntos en el disco del servidor.
 *
 * El directorio esta FUERA de /public a proposito: si estuviera adentro,
 * Next lo serviria como estatico y cualquiera con la URL podria bajar el
 * PDF de un alumno sin sesion. El unico acceso es la ruta autenticada
 * /api/fichas/[id]/archivo.
 *
 * Nota de despliegue: esto asume un filesystem persistente. En Vercel el
 * filesystem es efimero y de solo lectura, asi que este adaptador sirve
 * para desarrollo y para un servidor propio; para produccion en Vercel hay
 * que activar el adaptador de Supabase Storage.
 */
export class LocalStorage implements Storage {
  private readonly raiz: string;

  constructor(raiz = process.env.STORAGE_PATH ?? join(process.cwd(), "storage", "adjuntos")) {
    this.raiz = resolve(raiz);
  }

  async guardar(archivo: File, prefijo: string): Promise<ArchivoGuardado> {
    const contenido = await validarPdf(archivo);
    const nombre = sanearNombreArchivo(archivo.name);

    // Se agrupa por ano/mes para que el directorio no junte decenas de miles
    // de archivos sueltos, y se antepone un uuid para que dos adjuntos con el
    // mismo nombre no se pisen.
    const hoy = new Date();
    const carpeta = `${hoy.getUTCFullYear()}/${String(hoy.getUTCMonth() + 1).padStart(2, "0")}`;
    const path = `${carpeta}/${prefijo}-${randomUUID()}-${nombre}`;
    const destino = this.rutaAbsoluta(path);

    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, contenido);

    return { path, nombre, tamano: contenido.byteLength };
  }

  async leer(path: string): Promise<ArchivoLeido | null> {
    try {
      const contenido = await readFile(this.rutaAbsoluta(path));
      return {
        contenido,
        nombre: path.split("/").pop() ?? "adjunto.pdf",
        tipo: "application/pdf",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async eliminar(path: string): Promise<void> {
    try {
      await unlink(this.rutaAbsoluta(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  /**
   * Resuelve el path relativo dentro de la raiz, rechazando cualquier intento
   * de salirse de ella (`../../etc/passwd`). El path viene de la base de
   * datos, pero eso no lo hace confiable: si alguna vez se pudiera escribir
   * un path arbitrario, esta comprobacion es la que evita leer medio disco.
   */
  private rutaAbsoluta(path: string): string {
    const destino = resolve(this.raiz, normalize(path));
    if (destino !== this.raiz && !destino.startsWith(this.raiz + sep)) {
      throw new ErrorValidacion("Ruta de archivo invalida.");
    }
    return destino;
  }
}
