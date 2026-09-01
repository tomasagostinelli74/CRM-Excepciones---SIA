"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

import type { FechaRecuperatorio, MotivoExcepcion } from "@/lib/domain/types";
import { formatearFecha } from "@/lib/utils/fechas";

/**
 * Filtros del listado.
 *
 * El estado vive en la query string y no en React: asi el listado es
 * enlazable y compartible, el boton "atras" del navegador funciona, y la
 * exportacion puede reusar exactamente los mismos parametros.
 */
export function FiltrosFichas({
  motivos,
  fechas,
}: {
  motivos: MotivoExcepcion[];
  fechas: FechaRecuperatorio[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const formulario = useRef<HTMLFormElement>(null);

  const valor = (clave: string) => params.get(clave) ?? "";
  const hayFiltros = [...params.keys()].some((k) => k !== "pagina");

  function aplicar(datos: FormData) {
    const nuevos = new URLSearchParams();
    for (const [clave, valorCampo] of datos.entries()) {
      const texto = String(valorCampo).trim();
      if (texto) nuevos.set(clave, texto);
    }
    // Cambiar un filtro invalida la pagina actual: se vuelve a la primera.
    nuevos.delete("pagina");
    router.push(`${ruta}?${nuevos.toString()}`);
  }

  return (
    <form ref={formulario} action={aplicar} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="etiqueta" htmlFor="f-texto">
          Alumno
        </label>
        <input
          id="f-texto"
          name="texto"
          className="campo"
          placeholder="Apellido o nombre"
          defaultValue={valor("texto")}
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-legajo">
          Legajo
        </label>
        <input
          id="f-legajo"
          name="legajo"
          inputMode="numeric"
          className="campo font-mono"
          placeholder="1250123"
          defaultValue={valor("legajo")}
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-motivo">
          Motivo
        </label>
        <select id="f-motivo" name="motivoId" className="campo" defaultValue={valor("motivoId")}>
          <option value="">Todos</option>
          {motivos.map((motivo) => (
            <option key={motivo.id} value={motivo.id}>
              {motivo.descripcion}
              {motivo.activo ? "" : " (inactivo)"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-fecha">
          Fecha de recuperatorio
        </label>
        <select
          id="f-fecha"
          name="fechaRecuperatorioId"
          className="campo"
          defaultValue={valor("fechaRecuperatorioId")}
        >
          <option value="">Todas</option>
          {fechas.map((fecha) => (
            <option key={fecha.id} value={fecha.id}>
              {formatearFecha(fecha.fecha)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="f-desde">
            Carga desde
          </label>
          <input
            id="f-desde"
            name="cargaDesde"
            type="date"
            className="campo"
            defaultValue={valor("cargaDesde")}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="f-hasta">
            Carga hasta
          </label>
          <input
            id="f-hasta"
            name="cargaHasta"
            type="date"
            className="campo"
            defaultValue={valor("cargaHasta")}
          />
        </div>
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-estado">
          Estado
        </label>
        <select id="f-estado" name="estado" className="campo" defaultValue={valor("estado") || "vigente"}>
          <option value="vigente">Vigentes</option>
          <option value="anulada">Anuladas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      <div className="flex items-end gap-2 md:col-span-2 lg:col-span-3">
        <button type="submit" className="boton boton-primario">
          Aplicar filtros
        </button>
        {hayFiltros ? (
          <Link href={ruta} className="boton boton-secundario">
            Limpiar
          </Link>
        ) : null}
        <a
          className="boton boton-secundario ml-auto"
          href={`/api/fichas/exportar?${params.toString()}`}
        >
          Exportar CSV
        </a>
      </div>
    </form>
  );
}
