import { z } from "zod";

import { esFechaISO } from "@/lib/utils/fechas";

/**
 * Esquemas de validacion.
 *
 * Se aplican en el servidor, dentro de cada Server Action, antes de tocar la
 * base. El formulario ademas valida en el cliente, pero eso es solo para dar
 * feedback rapido: la validacion que cuenta es esta.
 *
 * Los mensajes estan en espanol y van directo a la UI.
 */

const textoRequerido = (campo: string, max = 200) =>
  z
    .string({ message: `Completa ${campo}.` })
    .trim()
    .min(1, `Completa ${campo}.`)
    .max(max, `${campo} no puede superar los ${max} caracteres.`);

const uuid = (campo: string) =>
  z
    .string({ message: `Selecciona ${campo}.` })
    .trim()
    .min(1, `Selecciona ${campo}.`)
    .uuid(`La opcion seleccionada en ${campo} no es valida.`);

const fechaISO = z
  .string({ message: "Ingresa una fecha." })
  .trim()
  .refine(esFechaISO, "La fecha no es valida. Usa el formato dd/mm/aaaa.");

/** El legajo del padron es numerico; se guarda como texto. */
export const esquemaLegajo = z
  .string({ message: "Ingresa el legajo." })
  .trim()
  .min(1, "Ingresa el legajo del alumno.")
  .max(20, "El legajo no puede tener mas de 20 caracteres.")
  .regex(/^\d+$/, "El legajo debe contener solo numeros.");

export const esquemaLogin = z.object({
  usuario: textoRequerido("el usuario", 60),
  password: z.string({ message: "Ingresa la contrasena." }).min(1, "Ingresa la contrasena."),
});

export const esquemaNuevaFicha = z.object({
  legajo: esquemaLegajo,
  motivoId: uuid("el motivo de excepcion"),
  fechaRecuperatorioId: uuid("la fecha de recuperatorio"),
  observaciones: z
    .string()
    .trim()
    .max(1000, "Las observaciones no pueden superar los 1000 caracteres.")
    .optional()
    .transform((valor) => (valor ? valor : null)),
});

export const esquemaEdicionFicha = z.object({
  motivoId: uuid("el motivo de excepcion"),
  fechaRecuperatorioId: uuid("la fecha de recuperatorio"),
  observaciones: z
    .string()
    .trim()
    .max(1000, "Las observaciones no pueden superar los 1000 caracteres.")
    .optional()
    .transform((valor) => (valor ? valor : null)),
});

export const esquemaAnulacion = z.object({
  motivo: textoRequerido("el motivo de la anulacion", 500).refine(
    (valor) => valor.length >= 10,
    "Explica el motivo de la anulacion con al menos 10 caracteres.",
  ),
});

export const esquemaMotivo = z.object({
  descripcion: textoRequerido("la descripcion del motivo", 200),
  activo: z.boolean(),
  orden: z.coerce
    .number({ message: "El orden debe ser un numero." })
    .int("El orden debe ser un numero entero.")
    .min(0, "El orden no puede ser negativo.")
    .max(9999, "El orden no puede superar 9999."),
});

export const esquemaFecha = z.object({
  fecha: fechaISO,
  cupo: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(100000)])
    .transform((valor) => (valor === "" ? null : (valor as number)))
    .nullable()
    .catch(null),
  activo: z.boolean(),
});

export const esquemaUsuario = z.object({
  usuario: textoRequerido("el nombre de usuario", 60).regex(
    /^[A-Za-z0-9._-]+$/,
    "El usuario solo puede tener letras, numeros, punto, guion y guion bajo.",
  ),
  nombre: textoRequerido("el nombre y apellido", 120),
  rol: z.enum(["admin", "operador"], { message: "Selecciona un rol valido." }),
  activo: z.boolean(),
});

export const esquemaPassword = z
  .string({ message: "Ingresa una contrasena." })
  .min(8, "La contrasena debe tener al menos 8 caracteres.")
  .max(200, "La contrasena no puede superar los 200 caracteres.");

export const esquemaFiltrosFichas = z.object({
  legajo: z.string().trim().max(20).optional(),
  motivoId: z.string().trim().uuid().optional().catch(undefined),
  fechaRecuperatorioId: z.string().trim().uuid().optional().catch(undefined),
  cargaDesde: z.string().trim().refine(esFechaISO).optional().catch(undefined),
  cargaHasta: z.string().trim().refine(esFechaISO).optional().catch(undefined),
  estado: z.enum(["vigente", "anulada", "todas"]).optional().catch(undefined),
  texto: z.string().trim().max(100).optional(),
});

/**
 * Convierte los errores de Zod al formato { campo: mensaje } que usa la UI.
 * Se queda con el primer error de cada campo: mostrar tres mensajes sobre el
 * mismo input confunde mas de lo que ayuda.
 */
export function erroresDeZod(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join(".") || "_";
    salida[campo] ??= issue.message;
  }
  return salida;
}
