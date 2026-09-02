"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Aviso, Panel, PanelDesplegable, Vacio } from "@/components/ui";
import type { FechaRecuperatorio } from "@/lib/domain/types";
import { formatearFecha, hoyISO } from "@/lib/utils/fechas";
import { eliminarFecha, guardarFecha, type EstadoAdmin } from "../acciones";

function Boton({ texto, cargando, clase = "boton-primario" }: { texto: string; cargando: string; clase?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`boton ${clase}`} disabled={pending}>
      {pending ? cargando : texto}
    </button>
  );
}

function FormularioFecha({
  fecha,
  alTerminar,
}: {
  fecha?: FechaRecuperatorio;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [estado, accion] = useActionState<EstadoAdmin, FormData>(guardarFecha, {});

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
      alTerminar();
    }
  }, [estado.ok, router, alTerminar]);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {fecha ? <input type="hidden" name="id" value={fecha.id} /> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="f-fecha">
            Fecha del recuperatorio
          </label>
          <input
            id="f-fecha"
            name="fecha"
            type="date"
            className="campo"
            required
            autoFocus
            defaultValue={fecha?.fecha ?? ""}
            min={fecha ? undefined : hoyISO()}
            aria-invalid={Boolean(estado.errores?.fecha)}
          />
          {estado.errores?.fecha ? <p className="error-campo">{estado.errores.fecha}</p> : null}
        </div>

        <div>
          <label className="etiqueta" htmlFor="f-cupo">
            Cupo <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="f-cupo"
            name="cupo"
            type="number"
            min={1}
            className="campo tabular-nums"
            defaultValue={fecha?.cupo ?? ""}
            placeholder="Sin limite"
            aria-describedby="f-cupo-ayuda"
            aria-invalid={Boolean(estado.errores?.cupo)}
          />
          <p id="f-cupo-ayuda" className="ayuda mt-1.5">
            Vacio = sin limite de alumnos.
          </p>
          {estado.errores?.cupo ? <p className="error-campo">{estado.errores.cupo}</p> : null}
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="activo" className="h-4 w-4" defaultChecked={fecha?.activo ?? true} />
        <span>
          Activa
          <span className="ml-1" style={{ color: "var(--texto-tenue)" }}>
            (se ofrece al generar una ficha)
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Boton texto={fecha ? "Guardar cambios" : "Crear fecha"} cargando="Guardando…" />
        <button type="button" className="boton boton-secundario" onClick={alTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonEliminar({ id, fecha }: { id: string; fecha: string }) {
  const router = useRouter();
  const [estado, accion] = useActionState<EstadoAdmin, FormData>(eliminarFecha, {});

  useEffect(() => {
    if (estado.ok) router.refresh();
  }, [estado.ok, router]);

  return (
    <>
      <form
        action={accion}
        onSubmit={(evento) => {
          if (!confirm(`¿Eliminar la fecha ${formatearFecha(fecha)}?`)) evento.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Boton texto="Eliminar" cargando="…" clase="boton-sutil" />
      </form>
      {estado.error ? <p className="error-campo max-w-xs text-right">{estado.error}</p> : null}
    </>
  );
}

export function GestorFechas({ fechas }: { fechas: FechaRecuperatorio[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const hoy = hoyISO();

  return (
    <div className="space-y-5">
      <PanelDesplegable
        titulo="Nueva fecha de recuperatorio"
        resumen="Agregar una fecha de recuperatorio"
        abierto={creando}
        alCambiar={setCreando}
      >
        <FormularioFecha alTerminar={() => setCreando(false)} />
      </PanelDesplegable>

      <Panel sinPadding>
        {fechas.length === 0 ? (
          <Vacio
            titulo="Todavía no hay fechas cargadas"
            descripcion="Sin al menos una fecha activa y futura, el operador no puede generar fichas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Asignadas</th>
                  <th scope="col">Cupo</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {fechas.map((fecha) =>
                  editando === fecha.id ? (
                    <tr key={fecha.id}>
                      <td colSpan={5} className="bg-[var(--superficie-2)] p-4">
                        <FormularioFecha fecha={fecha} alTerminar={() => setEditando(null)} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={fecha.id}>
                      <td className="font-medium tabular-nums">
                        {formatearFecha(fecha.fecha)}
                        {fecha.fecha < hoy ? (
                          <span className="ml-2 chip chip-neutro">pasada</span>
                        ) : null}
                      </td>
                      <td className="tabular-nums">{fecha.fichasAsignadas}</td>
                      <td className="tabular-nums" style={{ color: "var(--texto-suave)" }}>
                        {fecha.cupo ?? "sin limite"}
                      </td>
                      <td>
                        <span className={`chip ${fecha.activo ? "chip-vigente" : "chip-neutro"}`}>
                          {fecha.activo ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="boton boton-sutil"
                            onClick={() => setEditando(fecha.id)}
                          >
                            Editar
                          </button>
                          <BotonEliminar id={fecha.id} fecha={fecha.fecha} />
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
