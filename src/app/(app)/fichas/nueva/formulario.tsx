"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Aviso, Panel } from "@/components/ui";
import type { FechaRecuperatorio, MotivoExcepcion } from "@/lib/domain/types";
import { formatearFechaLarga } from "@/lib/utils/fechas";
import { buscarAlumnoPorLegajo, crearFicha, type EstadoFormulario } from "../acciones";

type EstadoAlumno =
  | { tipo: "vacio" }
  | { tipo: "buscando" }
  | { tipo: "ok"; nombreCompleto: string; apellido: string; nombre: string }
  | { tipo: "error"; mensaje: string };

function BotonGenerar({ habilitado }: { habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton boton-primario" disabled={pending || !habilitado}>
      {pending ? "Generando…" : "Generar ficha"}
    </button>
  );
}

export function FormularioNuevaFicha({
  motivos,
  fechas,
  maxMb,
}: {
  motivos: MotivoExcepcion[];
  fechas: FechaRecuperatorio[];
  maxMb: number;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(crearFicha, {});
  const [alumno, setAlumno] = useState<EstadoAlumno>({ tipo: "vacio" });
  const [buscando, iniciarBusqueda] = useTransition();
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  // Evita relanzar la busqueda si el legajo no cambio desde la ultima.
  const ultimoBuscado = useRef<string>("");

  function buscar(valor: string) {
    const legajo = valor.trim();
    if (!legajo) {
      setAlumno({ tipo: "vacio" });
      ultimoBuscado.current = "";
      return;
    }
    if (legajo === ultimoBuscado.current) return;
    ultimoBuscado.current = legajo;

    setAlumno({ tipo: "buscando" });
    iniciarBusqueda(async () => {
      const resultado = await buscarAlumnoPorLegajo(legajo);
      if (resultado.encontrado && resultado.alumno) {
        setAlumno({
          tipo: "ok",
          nombreCompleto: resultado.alumno.nombreCompleto,
          apellido: resultado.alumno.apellido,
          nombre: resultado.alumno.nombre,
        });
      } else {
        setAlumno({ tipo: "error", mensaje: resultado.mensaje ?? "No se encontro el legajo." });
      }
    });
  }

  /**
   * El envio se bloquea solo cuando SABEMOS que el legajo no sirve, no
   * mientras esta sin validar.
   *
   * Deshabilitarlo hasta confirmar el legajo dejaria el formulario en un
   * callejon sin salida si la busqueda no corre (JavaScript deshabilitado, un
   * error de red): el legajo se valida igual en el servidor, que devuelve el
   * mensaje sobre el propio campo. Con JavaScript sigue habiendo guarda, que
   * evita subir un PDF de 10 MB para un legajo que ya sabemos que no existe.
   */
  const legajoInvalido = alumno.tipo === "error";

  function validarArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) {
      setErrorArchivo(null);
      return;
    }
    if (!archivo.name.toLowerCase().endsWith(".pdf")) {
      setErrorArchivo("El adjunto debe ser un archivo PDF.");
      return;
    }
    if (archivo.size > maxMb * 1024 * 1024) {
      setErrorArchivo(
        `El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el maximo es ${maxMb} MB.`,
      );
      return;
    }
    setErrorArchivo(null);
  }

  const sinOpciones = motivos.length === 0 || fechas.length === 0;

  return (
    <form action={accion} className="space-y-5" noValidate>
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      {sinOpciones ? (
        <Aviso tipo="error" titulo="Falta configuración">
          {motivos.length === 0
            ? "No hay motivos de excepción activos. "
            : "No hay fechas de recuperatorio activas. "}
          Un administrador tiene que cargarlos antes de poder generar fichas.
        </Aviso>
      ) : null}

      {/* --- Alumno --- */}
      <Panel titulo="Alumno" descripcion="El legajo se valida contra el padrón de inscriptos.">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div>
            <label className="etiqueta" htmlFor="legajo">
              Legajo (LU)
            </label>
            <div className="flex gap-2">
              <input
                id="legajo"
                name="legajo"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                className="campo font-mono"
                placeholder="1250123"
                aria-invalid={alumno.tipo === "error" || Boolean(estado.errores?.legajo)}
                aria-describedby="ayuda-legajo"
                onBlur={(e) => buscar(e.target.value)}
                onKeyDown={(e) => {
                  // Enter busca en vez de enviar: el formulario todavia no
                  // esta completo y enviarlo seria un error seguro.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscar(e.currentTarget.value);
                  }
                }}
                onChange={() => {
                  if (alumno.tipo !== "vacio") setAlumno({ tipo: "vacio" });
                }}
                required
                autoFocus
              />
              <button
                type="button"
                className="boton boton-secundario"
                onClick={() => {
                  const input = document.getElementById("legajo") as HTMLInputElement | null;
                  if (input) buscar(input.value);
                }}
                disabled={buscando}
              >
                Buscar
              </button>
            </div>
            <p id="ayuda-legajo" className="ayuda mt-1.5">
              Solo numeros. Se busca al salir del campo.
            </p>
            {estado.errores?.legajo ? <p className="error-campo">{estado.errores.legajo}</p> : null}
          </div>

          <div>
            <span className="etiqueta">Apellido y nombre</span>
            <div
              className="flex min-h-[2.75rem] items-center rounded-lg border px-3 py-2.5 text-sm"
              style={{
                borderColor: alumno.tipo === "error" ? "#dc2626" : "var(--borde)",
                background: "var(--superficie-2)",
              }}
              aria-live="polite"
            >
              {alumno.tipo === "ok" ? (
                <span className="font-medium">{alumno.nombreCompleto}</span>
              ) : alumno.tipo === "buscando" ? (
                <span style={{ color: "var(--texto-tenue)" }}>Buscando…</span>
              ) : alumno.tipo === "error" ? (
                <span style={{ color: "#dc2626" }}>{alumno.mensaje}</span>
              ) : (
                <span style={{ color: "var(--texto-tenue)" }}>
                  Ingresa un legajo para completar los datos.
                </span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* --- Excepcion --- */}
      <Panel titulo="Excepción">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta" htmlFor="motivoId">
              Motivo de excepción
            </label>
            <select
              id="motivoId"
              name="motivoId"
              className="campo"
              required
              defaultValue=""
              aria-invalid={Boolean(estado.errores?.motivoId)}
            >
              <option value="" disabled>
                Selecciona un motivo…
              </option>
              {motivos.map((motivo) => (
                <option key={motivo.id} value={motivo.id}>
                  {motivo.descripcion}
                </option>
              ))}
            </select>
            {estado.errores?.motivoId ? (
              <p className="error-campo">{estado.errores.motivoId}</p>
            ) : null}
          </div>

          <div>
            <label className="etiqueta" htmlFor="fechaRecuperatorioId">
              Fecha de recuperatorio
            </label>
            <select
              id="fechaRecuperatorioId"
              name="fechaRecuperatorioId"
              className="campo"
              required
              defaultValue=""
              aria-invalid={Boolean(estado.errores?.fechaRecuperatorioId)}
            >
              <option value="" disabled>
                Selecciona una fecha…
              </option>
              {fechas.map((fecha) => {
                const lleno = fecha.cupo !== null && fecha.fichasAsignadas >= fecha.cupo;
                const restantes = fecha.cupo === null ? null : fecha.cupo - fecha.fichasAsignadas;
                return (
                  <option key={fecha.id} value={fecha.id} disabled={lleno}>
                    {formatearFechaLarga(fecha.fecha)}
                    {lleno
                      ? " — sin cupo"
                      : restantes !== null
                        ? ` — ${restantes} lugar(es)`
                        : ""}
                  </option>
                );
              })}
            </select>
            {estado.errores?.fechaRecuperatorioId ? (
              <p className="error-campo">{estado.errores.fechaRecuperatorioId}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <label className="etiqueta" htmlFor="observaciones">
            Observaciones <span className="font-normal">(opcional)</span>
          </label>
          <textarea
            id="observaciones"
            name="observaciones"
            className="campo"
            rows={3}
            maxLength={1000}
            placeholder="Cualquier aclaración útil para el departamento."
          />
        </div>
      </Panel>

      {/* --- Adjunto --- */}
      <Panel titulo="Comprobante" descripcion={`Archivo PDF, hasta ${maxMb} MB.`}>
        <label className="etiqueta" htmlFor="archivo">
          Adjunto
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept="application/pdf,.pdf"
          className="campo file:mr-3 file:rounded-md file:border-0 file:bg-[var(--superficie-2)] file:px-3 file:py-1.5 file:text-sm file:font-semibold"
          required
          onChange={validarArchivo}
          aria-invalid={Boolean(errorArchivo) || Boolean(estado.errores?.archivo)}
        />
        {errorArchivo ? <p className="error-campo">{errorArchivo}</p> : null}
        {estado.errores?.archivo ? <p className="error-campo">{estado.errores.archivo}</p> : null}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <BotonGenerar habilitado={!legajoInvalido && !errorArchivo && !sinOpciones} />
        <Link href="/fichas" className="boton boton-secundario">
          Cancelar
        </Link>
        {legajoInvalido ? (
          <p className="ayuda">Corregí el legajo para poder generar la ficha.</p>
        ) : null}
      </div>
    </form>
  );
}
