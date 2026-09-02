import { NextResponse } from "next/server";

import { leerFiltros, paramsDesdeUrl } from "@/app/(app)/fichas/consulta";
import { usuarioActual } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { formatearFecha, formatearInstante, hoyISO } from "@/lib/utils/fechas";

/**
 * Exporta a CSV el listado con los filtros aplicados.
 *
 * Se usa `;` como separador y BOM UTF-8 porque el destino real es Excel en
 * espanol: con `,` Excel mete todo en una sola columna, y sin BOM rompe los
 * acentos.
 */

const COLUMNAS = [
  "Numero",
  "Legajo",
  "Apellido",
  "Nombre",
  "Motivo",
  "Fecha de recuperatorio",
  "Observaciones",
  "Estado",
  "Motivo de anulación",
  "Cargada por",
  "Fecha de carga",
  "Archivo adjunto",
] as const;

/**
 * Escapa un valor para CSV.
 *
 * Ademas del entrecomillado estandar, antepone un apostrofo a los valores que
 * empiezan con =, +, - o @: sin eso Excel los interpreta como formula, que es
 * la via clasica de inyeccion en CSV.
 */
function celda(valor: string | number | null): string {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export async function GET(peticion: Request) {
  const usuario = await usuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
  }

  const url = new URL(peticion.url);
  const filtros = leerFiltros(paramsDesdeUrl(url));
  const fichas = await obtenerRepositorio().listarFichasParaExportar(filtros);

  const lineas = [
    COLUMNAS.map(celda).join(";"),
    ...fichas.map((ficha) =>
      [
        ficha.numero,
        ficha.legajo,
        ficha.alumnoApellido,
        ficha.alumnoNombre,
        ficha.motivoDescripcion,
        formatearFecha(ficha.fechaRecuperatorio),
        ficha.observaciones ?? "",
        ficha.estado === "vigente" ? "Vigente" : "Anulada",
        ficha.motivoAnulacion ?? "",
        `${ficha.creadoPorNombre} (${ficha.creadoPorUsuario})`,
        formatearInstante(ficha.creadoEn),
        ficha.archivoNombre,
      ]
        .map(celda)
        .join(";"),
    ),
  ];

  // ﻿ = BOM: le dice a Excel que el archivo es UTF-8.
  const csv = `﻿${lineas.join("\r\n")}\r\n`;
  const nombre = `fichas-excepcion-${hoyISO()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
