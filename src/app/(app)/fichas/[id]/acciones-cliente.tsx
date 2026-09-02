"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Aviso, PanelDesplegable } from "@/components/ui";
import type { FechaRecuperatorio, FichaExcepcionDetallada, MotivoExcepcion } from "@/lib/domain/types";
import { formatearFechaLarga } from "@/lib/utils/fechas";
import { anularFicha, editarFicha, type EstadoFormulario } from "../acciones";

/** Opcion de un select, ya resuelta a texto plano. */
interface Opcion {
  id: string;
  texto: string;
}

function BotonEnviar({ texto, cargando, clase = "boton-primario" }: { texto: string; cargando: string; clase?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`boton ${clase}`} disabled={pending}>
      {pending ? cargando : texto}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Edicion                                                             */
/* ------------------------------------------------------------------ */

export function FormularioEdicion({
  ficha,
  motivos,
  fechas,
  maxMb,
}: {
  ficha: FichaExcepcionDetallada;
  motivos: MotivoExcepcion[];
  fechas: FechaRecuperatorio[];
  maxMb: number;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(editarFicha, {});
  const [abierto, setAbierto] = useState(false);

  /**
   * El motivo o la fecha actuales pueden estar desactivados (el admin los dio
   * de baja despues de crear la ficha). Se agregan igual a la lista para no
   * perder el valor vigente al guardar un cambio en otro campo.
   */
  const opcionesMotivo: Opcion[] = motivos.map((m) => ({ id: m.id, texto: m.descripcion }));
  if (!opcionesMotivo.some((o) => o.id === ficha.motivoId)) {
    opcionesMotivo.push({ id: ficha.motivoId, texto: `${ficha.motivoDescripcion} (inactivo)` });
  }

  const opcionesFecha: Opcion[] = fechas.map((f) => ({ id: f.id, texto: formatearFechaLarga(f.fecha) }));
  if (!opcionesFecha.some((o) => o.id === ficha.fechaRecuperatorioId)) {
    opcionesFecha.push({
      id: ficha.fechaRecuperatorioId,
      texto: `${formatearFechaLarga(ficha.fechaRecuperatorio)} (inactiva)`,
    });
  }

  return (
    <PanelDesplegable
      titulo={`Editar ficha N° ${ficha.numero}`}
      resumen="Editar ficha"
      abierto={abierto}
      alCambiar={setAbierto}
    >
      <form action={accion} className="space-y-4" noValidate>
        <input type="hidden" name="id" value={ficha.id} />

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta" htmlFor="e-motivo">
              Motivo de excepcion
            </label>
            <select
              id="e-motivo"
              name="motivoId"
              className="campo"
              defaultValue={ficha.motivoId}
              aria-invalid={Boolean(estado.errores?.motivoId)}
              required
            >
              {opcionesMotivo.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.texto}
                </option>
              ))}
            </select>
            {estado.errores?.motivoId ? <p className="error-campo">{estado.errores.motivoId}</p> : null}
          </div>

          <div>
            <label className="etiqueta" htmlFor="e-fecha">
              Fecha de recuperatorio
            </label>
            <select
              id="e-fecha"
              name="fechaRecuperatorioId"
              className="campo"
              defaultValue={ficha.fechaRecuperatorioId}
              aria-invalid={Boolean(estado.errores?.fechaRecuperatorioId)}
              required
            >
              {opcionesFecha.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.texto}
                </option>
              ))}
            </select>
            {estado.errores?.fechaRecuperatorioId ? (
              <p className="error-campo">{estado.errores.fechaRecuperatorioId}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-obs">
            Observaciones
          </label>
          <textarea
            id="e-obs"
            name="observaciones"
            className="campo"
            rows={3}
            maxLength={1000}
            defaultValue={ficha.observaciones ?? ""}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-archivo">
            Reemplazar adjunto <span className="font-normal">(opcional, PDF hasta {maxMb} MB)</span>
          </label>
          <input
            id="e-archivo"
            name="archivo"
            type="file"
            accept="application/pdf,.pdf"
            className="campo file:mr-3 file:rounded-md file:border-0 file:bg-[var(--superficie-2)] file:px-3 file:py-1.5 file:text-sm file:font-semibold"
          />
          <p className="ayuda mt-1.5">
            Si no elegís un archivo, se conserva <strong>{ficha.archivoNombre}</strong>.
          </p>
          {estado.errores?.archivo ? <p className="error-campo">{estado.errores.archivo}</p> : null}
        </div>

        <div className="flex gap-2">
          <BotonEnviar texto="Guardar cambios" cargando="Guardando…" />
          <button type="button" className="boton boton-secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </PanelDesplegable>
  );
}

/* ------------------------------------------------------------------ */
/* Anulacion                                                           */
/* ------------------------------------------------------------------ */

export function FormularioAnulacion({ fichaId, numero }: { fichaId: string; numero: number }) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(anularFicha, {});
  const [abierto, setAbierto] = useState(false);

  return (
    <PanelDesplegable
      titulo={`Anular ficha N° ${numero}`}
      resumen="Anular ficha"
      abierto={abierto}
      alCambiar={setAbierto}
    >
      <form action={accion} className="space-y-4" noValidate>
        <input type="hidden" name="id" value={fichaId} />

        <Aviso tipo="info">
          La ficha no se borra: queda registrada como anulada, con el motivo, quien la anulo y
          cuando. El adjunto también se conserva.
        </Aviso>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

        <div>
          <label className="etiqueta" htmlFor="a-motivo">
            Motivo de la anulación
          </label>
          <textarea
            id="a-motivo"
            name="motivo"
            className="campo"
            rows={3}
            maxLength={500}
            required
            autoFocus
            placeholder="Ej.: cargada por error, el alumno presentó la documentación fuera de término…"
            aria-invalid={Boolean(estado.errores?.motivo)}
          />
          {estado.errores?.motivo ? <p className="error-campo">{estado.errores.motivo}</p> : null}
        </div>

        <div className="flex gap-2">
          <BotonEnviar texto="Confirmar anulación" cargando="Anulando…" clase="boton-peligro" />
          <button type="button" className="boton boton-secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </PanelDesplegable>
  );
}
