import Link from "next/link";

import { EncabezadoPagina, Panel, Paginador, Vacio } from "@/components/ui";
import { obtenerRepositorio } from "@/lib/data";
import { formatearInstante } from "@/lib/utils/fechas";
import { ImportadorPadron } from "./importador";

export const metadata = { title: "Padron de alumnos" };

const POR_PAGINA = 20;

export default async function PaginaAlumnos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q, pagina: paginaCruda } = await searchParams;
  const paginaNumero = Number(paginaCruda);
  const pagina = Number.isFinite(paginaNumero) && paginaNumero > 0 ? Math.floor(paginaNumero) : 1;

  const repo = obtenerRepositorio();
  const [listado, total] = await Promise.all([
    repo.listarAlumnos(q, { pagina, porPagina: POR_PAGINA }),
    repo.contarAlumnos(),
  ]);

  const hrefPagina = (numero: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    query.set("pagina", String(numero));
    return `/admin/alumnos?${query.toString()}`;
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Padron de alumnos"
        descripcion={`${total.toLocaleString("es-AR")} alumno(s) habilitados para generar fichas.`}
      />

      <div className="space-y-5">
        <ImportadorPadron totalActual={total} />

        <Panel titulo="Alumnos cargados" sinPadding>
          <div className="border-b p-4 sm:p-5" style={{ borderColor: "var(--borde)" }}>
            <form className="flex flex-wrap gap-2" action="/admin/alumnos">
              <input
                name="q"
                className="campo max-w-xs"
                placeholder="Buscar por legajo, apellido o nombre"
                defaultValue={q ?? ""}
                aria-label="Buscar alumno"
              />
              <button type="submit" className="boton boton-secundario">
                Buscar
              </button>
              {q ? (
                <Link href="/admin/alumnos" className="boton boton-sutil">
                  Limpiar
                </Link>
              ) : null}
            </form>
          </div>

          {listado.items.length === 0 ? (
            <Vacio
              titulo={q ? "Ningun alumno coincide con la busqueda" : "El padron esta vacio"}
              descripcion={
                q
                  ? "Proba con otro legajo o apellido."
                  : "Importa el Excel del sistema academico para habilitar la validacion de legajos."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Legajo</th>
                      <th scope="col">Apellido</th>
                      <th scope="col">Nombre</th>
                      <th scope="col">Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listado.items.map((alumno) => (
                      <tr key={alumno.legajo}>
                        <td className="font-mono tabular-nums">{alumno.legajo}</td>
                        <td className="font-medium">{alumno.apellido}</td>
                        <td>{alumno.nombre || "—"}</td>
                        <td className="text-xs tabular-nums" style={{ color: "var(--texto-tenue)" }}>
                          {formatearInstante(alumno.actualizadoEn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginador
                pagina={listado.pagina}
                porPagina={listado.porPagina}
                total={listado.total}
                href={hrefPagina}
              />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
