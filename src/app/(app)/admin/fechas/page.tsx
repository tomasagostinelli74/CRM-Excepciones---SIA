import { EncabezadoPagina } from "@/components/ui";
import { obtenerRepositorio } from "@/lib/data";
import { GestorFechas } from "./gestor";

export const metadata = { title: "Fechas de recuperatorio" };

export default async function PaginaFechas() {
  // Se listan todas (incluidas pasadas e inactivas): el admin necesita ver el
  // historico, aunque al operador solo se le ofrezcan las activas y futuras.
  const fechas = await obtenerRepositorio().listarFechas({ soloActivas: false, soloFuturas: false });

  return (
    <>
      <EncabezadoPagina
        titulo="Fechas de recuperatorio"
        descripcion="Al generar una ficha solo se ofrecen las fechas activas de hoy en adelante."
      />
      <GestorFechas fechas={fechas} />
    </>
  );
}
