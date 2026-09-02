/**
 * Errores de dominio.
 *
 * Todos llevan mensaje en espanol listo para mostrarle al operador: la UI
 * nunca tiene que traducir ni inventar textos. Cualquier error que NO sea
 * `ErrorDominio` se considera inesperado y se muestra como error generico,
 * para no filtrar detalles internos.
 */

export class ErrorDominio extends Error {
  readonly codigo: string;
  /** Campo del formulario al que corresponde el error, si aplica. */
  readonly campo?: string;

  constructor(codigo: string, mensaje: string, campo?: string) {
    super(mensaje);
    this.name = "ErrorDominio";
    this.codigo = codigo;
    this.campo = campo;
  }
}

export class ErrorValidacion extends ErrorDominio {
  constructor(mensaje: string, campo?: string) {
    super("VALIDACION", mensaje, campo);
    this.name = "ErrorValidacion";
  }
}

export class ErrorNoEncontrado extends ErrorDominio {
  constructor(mensaje: string) {
    super("NO_ENCONTRADO", mensaje);
    this.name = "ErrorNoEncontrado";
  }
}

export class ErrorConflicto extends ErrorDominio {
  constructor(mensaje: string, campo?: string) {
    super("CONFLICTO", mensaje, campo);
    this.name = "ErrorConflicto";
  }
}

export class ErrorAutenticacion extends ErrorDominio {
  constructor(mensaje = "Debes iniciar sesión para continuar.") {
    super("NO_AUTENTICADO", mensaje);
    this.name = "ErrorAutenticacion";
  }
}

export class ErrorAutorizacion extends ErrorDominio {
  constructor(mensaje = "No tenés permisos para realizar esta acción.") {
    super("NO_AUTORIZADO", mensaje);
    this.name = "ErrorAutorizacion";
  }
}

/** Convierte cualquier excepcion en un mensaje seguro para el usuario. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDominio) return error.message;
  if (process.env.NODE_ENV !== "production") {
    console.error("[error inesperado]", error);
  }
  return "Ocurrio un error inesperado. Intentalo de nuevo o avisa al administrador.";
}

/** Campo del formulario asociado al error, si el error lo declara. */
export function campoDeError(error: unknown): string | undefined {
  return error instanceof ErrorDominio ? error.campo : undefined;
}
