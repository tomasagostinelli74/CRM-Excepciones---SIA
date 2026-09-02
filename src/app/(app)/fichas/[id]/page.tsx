import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, Chip, Dato, EncabezadoPagina, Panel } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { tamanoMaximoMb } from "@/lib/storage/pdf";
import { formatearFechaLarga, formatearInstante } from "@/lib/utils/fechas";
import { FormularioAnulacion, FormularioEdicion } from "./acciones-cliente";

export const metadata = { title: "Detalle de ficha" };

/** Bytes a un texto corto y legible. */
function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function PaginaDetalleFicha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string; editada?: string; anulada?: string }>;
}) {
  const { id } = await params;
  await requerirUsuario(`/fichas/${id}`);

  const repo = obtenerRepositorio();
  const ficha = await repo.obtenerFicha(id);
  if (!ficha) notFound();

  const [motivos, fechas, auditoria, { creada, editada, anulada }] = await Promise.all([
    repo.listarMotivos(true),
    repo.listarFechas({ soloActivas: true, soloFuturas: true }),
    repo.listarAuditoria(id),
    searchParams,
  ]);

  const vigente = ficha.estado === "vigente";

  return (
    <>
      <EncabezadoPagina
        titulo={`Ficha N° ${ficha.numero}`}
        descripcion={`${ficha.alumnoNombreCompleto} — legajo ${ficha.legajo}`}
        acciones={
          <>
            <Link href="/fichas" className="boton boton-secundario">
              Volver al listado
            </Link>
            <a
              className="boton boton-primario"
              href={`/api/fichas/${ficha.id}/archivo`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver PDF
            </a>
          </>
        }
      />

      <div className="space-y-5">
        {creada === "1" ? (
          <Aviso tipo="ok" titulo="Ficha generada">
            Quedo registrada con el numero {ficha.numero}.
          </Aviso>
        ) : null}

        {editada === "1" ? <Aviso tipo="ok">Cambios guardados.</Aviso> : null}

        {anulada === "1" ? <Aviso tipo="ok">La ficha quedo anulada.</Aviso> : null}

        {!vigente ? (
          <Aviso tipo="error" titulo="Esta ficha está anulada">
            <p>{ficha.motivoAnulacion}</p>
            <p className="mt-1 text-sm opacity-90">
              Anulada por {ficha.anuladaPorNombre ?? "un usuario eliminado"} el{" "}
              {ficha.anuladaEn ? formatearInstante(ficha.anuladaEn) : "—"}.
            </p>
          </Aviso>
        ) : null}

        <Panel titulo="Datos de la ficha">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Dato etiqueta="Estado">
              <Chip estado={ficha.estado} />
            </Dato>
            <Dato etiqueta="Legajo (LU)">
              <span className="font-mono tabular-nums">{ficha.legajo}</span>
            </Dato>
            <Dato etiqueta="Alumno">{ficha.alumnoNombreCompleto}</Dato>
            <Dato etiqueta="Motivo de excepción">{ficha.motivoDescripcion}</Dato>
            <Dato etiqueta="Fecha de recuperatorio">
              {formatearFechaLarga(ficha.fechaRecuperatorio)}
            </Dato>
            <Dato etiqueta="Comprobante">
              <a
                className="underline underline-offset-2"
                style={{ color: "var(--color-acento-600)" }}
                href={`/api/fichas/${ficha.id}/archivo`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {ficha.archivoNombre}
              </a>
              <span className="ml-1" style={{ color: "var(--texto-tenue)" }}>
                ({formatearTamano(ficha.archivoTamano)})
              </span>
            </Dato>
            <Dato etiqueta="Cargada por">
              {ficha.creadoPorNombre}
              <span style={{ color: "var(--texto-tenue)" }}> ({ficha.creadoPorUsuario})</span>
            </Dato>
            <Dato etiqueta="Fecha de carga">{formatearInstante(ficha.creadoEn)}</Dato>
            <Dato etiqueta="Última modificación">{formatearInstante(ficha.actualizadoEn)}</Dato>
          </dl>

          {ficha.observaciones ? (
            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--borde)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-tenue)" }}>
                Observaciones
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{ficha.observaciones}</p>
            </div>
          ) : null}
        </Panel>

        {vigente ? (
          <div className="space-y-3">
            <FormularioEdicion
              ficha={ficha}
              motivos={motivos}
              fechas={fechas}
              maxMb={tamanoMaximoMb()}
            />
            <FormularioAnulacion fichaId={ficha.id} numero={ficha.numero} />
          </div>
        ) : null}

        <Panel titulo="Historial" descripcion="Todo lo que pasó con esta ficha, en orden inverso.">
          <ol className="space-y-3">
            {auditoria.map((evento) => (
              <li key={evento.id} className="flex gap-3 text-sm">
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: "var(--color-acento-500)" }}
                />
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold capitalize">{evento.accion}</span>
                    {" · "}
                    <span style={{ color: "var(--texto-suave)" }}>
                      {evento.usuarioNombre ?? "usuario eliminado"}
                    </span>
                    {" · "}
                    <span className="tabular-nums" style={{ color: "var(--texto-tenue)" }}>
                      {formatearInstante(evento.creadoEn)}
                    </span>
                  </p>
                  {evento.detalle ? (
                    <p className="mt-0.5" style={{ color: "var(--texto-suave)" }}>
                      {evento.detalle}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
