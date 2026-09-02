"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Aviso, Panel, PanelDesplegable, Vacio } from "@/components/ui";
import type { MotivoExcepcion } from "@/lib/domain/types";
import { eliminarMotivo, guardarMotivo, type EstadoAdmin } from "../acciones";

function Boton({ texto, cargando, clase = "boton-primario" }: { texto: string; cargando: string; clase?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`boton ${clase}`} disabled={pending}>
      {pending ? cargando : texto}
    </button>
  );
}

/** Formulario de alta/edicion. `motivo` presente = edicion. */
function FormularioMotivo({
  motivo,
  alTerminar,
  ordenSugerido,
}: {
  motivo?: MotivoExcepcion;
  alTerminar: () => void;
  ordenSugerido: number;
}) {
  const router = useRouter();
  const [estado, accion] = useActionState<EstadoAdmin, FormData>(guardarMotivo, {});

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
      alTerminar();
    }
  }, [estado.ok, router, alTerminar]);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {motivo ? <input type="hidden" name="id" value={motivo.id} /> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label className="etiqueta" htmlFor="m-desc">
            Descripcion
          </label>
          <input
            id="m-desc"
            name="descripcion"
            className="campo"
            maxLength={200}
            required
            autoFocus
            defaultValue={motivo?.descripcion ?? ""}
            placeholder="Ej.: Certificado medico"
            aria-invalid={Boolean(estado.errores?.descripcion)}
          />
          {estado.errores?.descripcion ? (
            <p className="error-campo">{estado.errores.descripcion}</p>
          ) : null}
        </div>

        <div>
          <label className="etiqueta" htmlFor="m-orden">
            Orden
          </label>
          <input
            id="m-orden"
            name="orden"
            type="number"
            min={0}
            max={9999}
            className="campo tabular-nums"
            defaultValue={motivo?.orden ?? ordenSugerido}
            aria-describedby="m-orden-ayuda"
          />
          <p id="m-orden-ayuda" className="ayuda mt-1.5">
            Menor primero.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="activo"
          className="h-4 w-4"
          defaultChecked={motivo?.activo ?? true}
        />
        <span>
          Activo
          <span className="ml-1" style={{ color: "var(--texto-tenue)" }}>
            (aparece en el formulario de nueva ficha)
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Boton texto={motivo ? "Guardar cambios" : "Crear motivo"} cargando="Guardando…" />
        <button type="button" className="boton boton-secundario" onClick={alTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonEliminar({ id, descripcion }: { id: string; descripcion: string }) {
  const router = useRouter();
  const [estado, accion] = useActionState<EstadoAdmin, FormData>(eliminarMotivo, {});

  useEffect(() => {
    if (estado.ok) router.refresh();
  }, [estado.ok, router]);

  return (
    <>
      <form
        action={accion}
        onSubmit={(evento) => {
          if (!confirm(`¿Eliminar el motivo "${descripcion}"?`)) evento.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Boton texto="Eliminar" cargando="…" clase="boton-sutil" />
      </form>
      {estado.error ? (
        <p className="error-campo max-w-xs text-right">{estado.error}</p>
      ) : null}
    </>
  );
}

export function GestorMotivos({ motivos }: { motivos: MotivoExcepcion[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const ordenSugerido = motivos.length ? Math.max(...motivos.map((m) => m.orden)) + 10 : 10;

  return (
    <div className="space-y-5">
      <PanelDesplegable
        titulo="Nuevo motivo"
        resumen="Agregar un motivo de excepción"
        abierto={creando}
        alCambiar={setCreando}
      >
        <FormularioMotivo alTerminar={() => setCreando(false)} ordenSugerido={ordenSugerido} />
      </PanelDesplegable>

      <Panel sinPadding>
        {motivos.length === 0 ? (
          <Vacio
            titulo="Todavía no hay motivos cargados"
            descripcion="El formulario de nueva ficha necesita al menos un motivo activo para funcionar."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Orden</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {motivos.map((motivo) =>
                  editando === motivo.id ? (
                    <tr key={motivo.id}>
                      <td colSpan={4} className="bg-[var(--superficie-2)] p-4">
                        <FormularioMotivo
                          motivo={motivo}
                          alTerminar={() => setEditando(null)}
                          ordenSugerido={ordenSugerido}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={motivo.id}>
                      <td className="tabular-nums" style={{ color: "var(--texto-tenue)" }}>
                        {motivo.orden}
                      </td>
                      <td className="font-medium">{motivo.descripcion}</td>
                      <td>
                        <span className={`chip ${motivo.activo ? "chip-vigente" : "chip-neutro"}`}>
                          {motivo.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="boton boton-sutil"
                            onClick={() => setEditando(motivo.id)}
                          >
                            Editar
                          </button>
                          <BotonEliminar id={motivo.id} descripcion={motivo.descripcion} />
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
