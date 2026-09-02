import { EncabezadoPagina } from "@/components/ui";
import { obtenerRepositorio } from "@/lib/data";
import { GestorMotivos } from "./gestor";

export const metadata = { title: "Motivos de excepción" };

export default async function PaginaMotivos() {
  const motivos = await obtenerRepositorio().listarMotivos(false);

  return (
    <>
      <EncabezadoPagina
        titulo="Motivos de excepción"
        descripcion="Las opciones que ve el operador al generar una ficha. Solo se ofrecen las activas."
      />
      <GestorMotivos motivos={motivos} />
    </>
  );
}
