import Link from "next/link";

import { Aviso, Chip, EncabezadoPagina, Paginador, Panel, Vacio } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { formatearFecha, formatearInstante } from "@/lib/utils/fechas";
import { leerFiltros, type ParamsBusqueda } from "./consulta";
import { FiltrosFichas } from "./filtros";

export const metadata = { title: "Fichas" };

const POR_PAGINA = 25;

export default async function PaginaFichas({
  searchParams,
}: {
  searchParams: Promise<ParamsBusqueda>;
}) {
  await requerirUsuario("/fichas");
  const params = await searchParams;
  const repo = obtenerRepositorio();

  const filtros = leerFiltros(params);
  const paginaCruda = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina);
  const pagina = Number.isFinite(paginaCruda) && paginaCruda > 0 ? Math.floor(paginaCruda) : 1;

  const [resultado, motivos, fechas] = await Promise.all([
    repo.listarFichas(filtros, { pagina, porPagina: POR_PAGINA }),
    repo.listarMotivos(false),
    repo.listarFechas({ soloActivas: false, soloFuturas: false }),
  ]);

  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  /** Conserva los filtros al cambiar de pagina. */
  const hrefPagina = (numero: number) => {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries(params)) {
      const texto = Array.isArray(valor) ? valor[0] : valor;
      if (texto && clave !== "pagina" && clave !== "error") query.set(clave, texto);
    }
    query.set("pagina", String(numero));
    return `/fichas?${query.toString()}`;
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Fichas de excepción"
        descripcion={`${resultado.total} ficha(s) con los filtros actuales.`}
        acciones={
          <Link href="/fichas/nueva" className="boton boton-primario">
            Nueva ficha
          </Link>
        }
      />

      {error === "solo-admin" ? (
        <div className="mb-4">
          <Aviso tipo="error">
            Esa seccion es solo para administradores.
          </Aviso>
        </div>
      ) : null}

      <div className="mb-5">
        <Panel titulo="Filtros">
          <FiltrosFichas motivos={motivos} fechas={fechas} />
        </Panel>
      </div>

      <Panel sinPadding>
        {resultado.items.length === 0 ? (
          <Vacio
            titulo="No hay fichas para mostrar"
            descripcion="Probá ajustando los filtros, o carga la primera ficha de excepción."
            accion={
              <Link href="/fichas/nueva" className="boton boton-primario">
                Nueva ficha
              </Link>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">N°</th>
                    <th scope="col">Legajo</th>
                    <th scope="col">Alumno</th>
                    <th scope="col">Motivo</th>
                    <th scope="col">Recuperatorio</th>
                    <th scope="col">Cargada</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.items.map((ficha) => (
                    <tr key={ficha.id}>
                      <td className="font-mono tabular-nums">{ficha.numero}</td>
                      <td className="font-mono tabular-nums">{ficha.legajo}</td>
                      <td className="max-w-[16rem] truncate font-medium" title={ficha.alumnoNombreCompleto}>
                        {ficha.alumnoNombreCompleto}
                      </td>
                      <td className="max-w-[14rem] truncate" title={ficha.motivoDescripcion}>
                        {ficha.motivoDescripcion}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {formatearFecha(ficha.fechaRecuperatorio)}
                      </td>
                      <td
                        className="whitespace-nowrap tabular-nums text-xs"
                        style={{ color: "var(--texto-suave)" }}
                      >
                        {formatearInstante(ficha.creadoEn)}
                        <span className="block">por {ficha.creadoPorUsuario}</span>
                      </td>
                      <td>
                        <Chip estado={ficha.estado} />
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <a
                          className="boton boton-sutil"
                          href={`/api/fichas/${ficha.id}/archivo`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          PDF
                        </a>
                        <Link className="boton boton-sutil" href={`/fichas/${ficha.id}`}>
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginador
              pagina={resultado.pagina}
              porPagina={resultado.porPagina}
              total={resultado.total}
              href={hrefPagina}
            />
          </>
        )}
      </Panel>
    </>
  );
}
