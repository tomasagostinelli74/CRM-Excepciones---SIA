import type { FiltrosFichas } from "@/lib/data/repository";
import { esquemaFiltrosFichas } from "@/lib/validacion/esquemas";

export type ParamsBusqueda = Record<string, string | string[] | undefined>;

/**
 * Traduce la query string a los filtros del repositorio.
 *
 * Cada campo pasa por Zod con `.catch(undefined)`: una URL manipulada a mano
 * debe ignorar el parametro invalido y mostrar el listado, no romper la
 * pagina. Lo comparten el listado y la exportacion a CSV para que el archivo
 * exportado sea exactamente lo que se ve en pantalla.
 */
export function leerFiltros(params: ParamsBusqueda): FiltrosFichas {
  const texto = (clave: string): string | undefined => {
    const valor = params[clave];
    const crudo = Array.isArray(valor) ? valor[0] : valor;
    return crudo?.trim() ? crudo.trim() : undefined;
  };

  const parseo = esquemaFiltrosFichas.safeParse({
    legajo: texto("legajo"),
    motivoId: texto("motivoId"),
    fechaRecuperatorioId: texto("fechaRecuperatorioId"),
    cargaDesde: texto("cargaDesde"),
    cargaHasta: texto("cargaHasta"),
    estado: texto("estado"),
    texto: texto("texto"),
  });

  // Por defecto se muestran solo las vigentes: son las que el departamento
  // usa para trabajar; las anuladas quedan a un filtro de distancia.
  return parseo.success ? { estado: "vigente", ...parseo.data } : { estado: "vigente" };
}

/** Convierte los `searchParams` de una URL en el objeto plano que espera `leerFiltros`. */
export function paramsDesdeUrl(url: URL): ParamsBusqueda {
  const salida: ParamsBusqueda = {};
  for (const [clave, valor] of url.searchParams.entries()) salida[clave] = valor;
  return salida;
}
