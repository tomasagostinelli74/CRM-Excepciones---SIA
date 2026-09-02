import { redirect } from "next/navigation";

import { usuarioActual } from "@/lib/auth";
import { FormularioLogin } from "./formulario";
import "./login.css";

export const metadata = { title: "Ingresar" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  // Si ya hay sesion no tiene sentido mostrar el login.
  if (await usuarioActual()) redirect("/fichas");

  const { siguiente } = await searchParams;

  return (
    <main className="liquid-fondo">
      <div className="liquid-blob liquid-blob-1" aria-hidden />
      <div className="liquid-blob liquid-blob-2" aria-hidden />
      <div className="liquid-blob liquid-blob-3" aria-hidden />
      <div className="liquid-vignette" aria-hidden />

      <div className="liquid-contenido">
        <div className="liquid-marca">
          <p className="liquid-eyebrow">Examen de Ingreso</p>
          <h1 className="liquid-titulo">
            <strong>Fichas</strong> <span>de excepción</span>
          </h1>
          <p className="liquid-subtitulo">Ingresa con tu usuario del departamento.</p>
        </div>

        <div className="liquid-tarjeta">
          <FormularioLogin siguiente={siguiente} />
        </div>

        <p className="liquid-pie">Departamento de Examen de Ingreso</p>
      </div>
    </main>
  );
}
