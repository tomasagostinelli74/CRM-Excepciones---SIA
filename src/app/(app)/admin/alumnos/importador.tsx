"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Aviso, Panel } from "@/components/ui";
import { importarPadron, previsualizarPadron, type EstadoImport } from "../acciones";

function Boton({ texto, cargando, clase = "boton-primario" }: { texto: string; cargando: string; clase?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`boton ${clase}`} disabled={pending}>
      {pending ? cargando : texto}
    </button>
  );
}

/**
 * Import del padron en dos pasos: primero vista previa (no escribe nada),
 * despues confirmacion.
 *
 * El archivo se mantiene en el mismo `<input type="file">` entre los dos
 * envios: no se puede setear el valor de un input de archivo por codigo, asi
 * que el mismo formulario cambia de accion segun el paso.
 */
export function ImportadorPadron({ totalActual }: { totalActual: number }) {
  const router = useRouter();
  const [vista, accionVista] = useActionState<EstadoImport, FormData>(previsualizarPadron, {});
  const [confirmado, accionConfirmar] = useActionState<EstadoImport, FormData>(importarPadron, {});
  const [hayArchivo, setHayArchivo] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (confirmado.ok) router.refresh();
  }, [confirmado.ok, router]);

  const previa = vista.vista;
  const yaImporto = Boolean(confirmado.ok && confirmado.resultado);

  return (
    <div className="space-y-5">
      <Panel
        titulo="Cargar padron de alumnos"
        descripcion="Archivo .xlsx con las columnas «legajo» y «alumno» (formato «Apellido, Nombre»)."
      >
        <form
          action={previa && !yaImporto ? accionConfirmar : accionVista}
          className="space-y-4"
          noValidate
        >
          <div>
            <label className="etiqueta" htmlFor="archivo">
              Archivo Excel
            </label>
            <input
              ref={inputArchivo}
              id="archivo"
              name="archivo"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="campo file:mr-3 file:rounded-md file:border-0 file:bg-[var(--superficie-2)] file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              required
              onChange={(evento) => setHayArchivo(Boolean(evento.target.files?.length))}
              aria-invalid={Boolean(vista.errores?.archivo)}
            />
            {vista.errores?.archivo ? <p className="error-campo">{vista.errores.archivo}</p> : null}
          </div>

          {vista.error ? <Aviso tipo="error">{vista.error}</Aviso> : null}
          {confirmado.error ? <Aviso tipo="error">{confirmado.error}</Aviso> : null}

          {yaImporto && confirmado.resultado ? (
            <Aviso tipo="ok" titulo="Padron actualizado">
              {confirmado.resultado.insertados} alumno(s) nuevo(s),{" "}
              {confirmado.resultado.actualizados} actualizado(s) y{" "}
              {confirmado.resultado.sinCambios} sin cambios.
            </Aviso>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {previa && !yaImporto ? (
              <>
                <Boton texto="Confirmar e importar" cargando="Importando…" />
                <button
                  type="button"
                  className="boton boton-secundario"
                  onClick={() => {
                    if (inputArchivo.current) inputArchivo.current.value = "";
                    setHayArchivo(false);
                    router.refresh();
                  }}
                >
                  Empezar de nuevo
                </button>
              </>
            ) : (
              <Boton texto="Previsualizar" cargando="Leyendo archivo…" clase={hayArchivo ? "boton-primario" : "boton-secundario"} />
            )}
          </div>
        </form>
      </Panel>

      {previa && !yaImporto ? (
        <Panel titulo="Vista previa" descripcion="Todavia no se escribio nada en la base.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg p-3" style={{ background: "var(--superficie-2)" }}>
              <p className="text-xs font-semibold uppercase" style={{ color: "var(--texto-tenue)" }}>
                Alumnos validos
              </p>
              <p className="text-xl font-bold tabular-nums">{previa.validos.toLocaleString("es-AR")}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--superficie-2)" }}>
              <p className="text-xs font-semibold uppercase" style={{ color: "var(--texto-tenue)" }}>
                Filas leidas
              </p>
              <p className="text-xl font-bold tabular-nums">{previa.totalFilas.toLocaleString("es-AR")}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--superficie-2)" }}>
              <p className="text-xs font-semibold uppercase" style={{ color: "var(--texto-tenue)" }}>
                Rechazadas
              </p>
              <p className="text-xl font-bold tabular-nums">{previa.rechazadas.length}</p>
            </div>
          </div>

          <Aviso tipo="info">
            El padron actual tiene {totalActual.toLocaleString("es-AR")} alumno(s). La importacion{" "}
            <strong>agrega los nuevos y actualiza los existentes</strong>; no borra a los que no
            figuren en el archivo.
          </Aviso>

          <div className="mt-4">
            <p className="etiqueta">Primeros registros</p>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Legajo</th>
                    <th scope="col">Apellido</th>
                    <th scope="col">Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.muestra.map((alumno) => (
                    <tr key={alumno.legajo}>
                      <td className="font-mono tabular-nums">{alumno.legajo}</td>
                      <td>{alumno.apellido}</td>
                      <td>{alumno.nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {previa.duplicados.length > 0 ? (
            <div className="mt-4">
              <Aviso tipo="info" titulo="Legajos repetidos dentro del archivo">
                Se toma la ultima aparicion de cada uno: {previa.duplicados.join(", ")}
              </Aviso>
            </div>
          ) : null}

          {previa.rechazadas.length > 0 ? (
            <div className="mt-4">
              <p className="etiqueta">Filas que no se van a importar</p>
              <div className="max-h-72 overflow-auto rounded-lg border" style={{ borderColor: "var(--borde)" }}>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Fila</th>
                      <th scope="col">Legajo</th>
                      <th scope="col">Valor</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.rechazadas.map((fila) => (
                      <tr key={`${fila.fila}-${fila.legajo}`}>
                        <td className="tabular-nums">{fila.fila}</td>
                        <td className="font-mono tabular-nums">{fila.legajo || "—"}</td>
                        <td className="max-w-[16rem] truncate">{fila.valor || "—"}</td>
                        <td style={{ color: "var(--texto-suave)" }}>{fila.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
