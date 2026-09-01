import { requerirAdmin } from "@/lib/auth";

/**
 * Guard del panel de administracion.
 *
 * Aplica a todo el subarbol /admin. Escribir la URL a mano como operador
 * redirige al listado: ocultar los links del menu no es una barrera.
 */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  await requerirAdmin("/admin");
  return <>{children}</>;
}
