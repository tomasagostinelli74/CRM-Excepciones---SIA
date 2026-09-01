import { Navegacion } from "@/components/navegacion";
import { requerirUsuario } from "@/lib/auth";
import { salir } from "@/app/login/cerrar";

/**
 * Shell de todas las pantallas autenticadas.
 *
 * `requerirUsuario` corre en el servidor antes de renderizar cualquier hijo,
 * asi que ninguna pagina del grupo se puede ver sin sesion.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await requerirUsuario();

  return (
    <div className="min-h-screen">
      <Navegacion
        rol={usuario.rol}
        nombre={usuario.nombre}
        usuario={usuario.usuario}
        alSalir={salir}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
