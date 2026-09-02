import Link from "next/link";

import { EncabezadoPagina, Metrica, Panel } from "@/components/ui";
import { obtenerRepositorio } from "@/lib/data";
import { formatearFecha } from "@/lib/utils/fechas";

export const metadata = { title: "Tablero" };

export default async function PaginaAdmin() {
  const repo = obtenerRepositorio();
  const [resumen, fechas] = await Promise.all([
    repo.resumen(),
    repo.listarFechas({ soloActivas: true, soloFuturas: true }),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Tablero"
        descripcion="Estado general del sistema de fichas de excepción."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metrica
          etiqueta="Fichas vigentes"
          valor={resumen.fichasVigentes}
          detalle={`${resumen.fichasUltimos7Dias} cargada(s) en los últimos 7 días`}
        />
        <Metrica etiqueta="Fichas anuladas" valor={resumen.fichasAnuladas} />
        <Metrica
          etiqueta="Alumnos en el padrón"
          valor={resumen.alumnos.toLocaleString("es-AR")}
          detalle="Base de validación de legajos"
        />
        <Metrica etiqueta="Motivos activos" valor={resumen.motivosActivos} />
        <Metrica etiqueta="Fechas activas" valor={resumen.fechasActivas} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel
          titulo="Próximas fechas de recuperatorio"
          descripcion="Ocupación de las fechas habilitadas."
        >
          {fechas.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              No hay fechas activas.{" "}
              <Link href="/admin/fechas" className="underline underline-offset-2">
                Cargar una fecha
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {fechas.map((fecha) => {
                const porcentaje =
                  fecha.cupo && fecha.cupo > 0
                    ? Math.min(100, Math.round((fecha.fichasAsignadas / fecha.cupo) * 100))
                    : null;
                return (
                  <li key={fecha.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium tabular-nums">{formatearFecha(fecha.fecha)}</span>
                      <span className="tabular-nums" style={{ color: "var(--texto-suave)" }}>
                        {fecha.fichasAsignadas}
                        {fecha.cupo !== null ? ` / ${fecha.cupo}` : " (sin cupo)"}
                      </span>
                    </div>
                    {porcentaje !== null ? (
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                        style={{ background: "var(--superficie-2)" }}
                        role="progressbar"
                        aria-valuenow={porcentaje}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Ocupación del ${formatearFecha(fecha.fecha)}`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${porcentaje}%`,
                            background:
                              porcentaje >= 100 ? "#dc2626" : "var(--color-acento-500)",
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel titulo="Accesos rápidos">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href="/admin/motivos" className="boton boton-secundario justify-start">
              Motivos de excepción
            </Link>
            <Link href="/admin/fechas" className="boton boton-secundario justify-start">
              Fechas de recuperatorio
            </Link>
            <Link href="/admin/alumnos" className="boton boton-secundario justify-start">
              Padrón de alumnos
            </Link>
            <Link href="/admin/usuarios" className="boton boton-secundario justify-start">
              Usuarios
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
