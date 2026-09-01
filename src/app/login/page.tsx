import { redirect } from "next/navigation";

import { usuarioActual } from "@/lib/auth";
import { FormularioLogin } from "./formulario";

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
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--texto-tenue)" }}
          >
            Examen de Ingreso
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">Fichas de excepcion</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Ingresa con tu usuario del departamento.
          </p>
        </div>

        <div className="panel p-5 sm:p-6">
          <FormularioLogin siguiente={siguiente} />
        </div>
      </div>
    </main>
  );
}
