import { EncabezadoPagina } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { tamanoMaximoMb } from "@/lib/storage/pdf";
import { FormularioNuevaFicha } from "./formulario";

export const metadata = { title: "Nueva ficha" };

export default async function PaginaNuevaFicha() {
  await requerirUsuario("/fichas/nueva");
  const repo = obtenerRepositorio();

  // Solo opciones vigentes: el operador no deberia poder elegir un motivo
  // dado de baja ni una fecha que ya paso.
  const [motivos, fechas] = await Promise.all([
    repo.listarMotivos(true),
    repo.listarFechas({ soloActivas: true, soloFuturas: true }),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Nueva ficha de excepción"
        descripcion="Registra un alumno que no podrá asistir a la fecha de curso asignada."
      />
      <FormularioNuevaFicha motivos={motivos} fechas={fechas} maxMb={tamanoMaximoMb()} />
    </>
  );
}
