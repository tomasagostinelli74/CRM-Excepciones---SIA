import { Aviso, EncabezadoPagina } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { obtenerRepositorio } from "@/lib/data";
import { GestorUsuarios } from "./gestor";

export const metadata = { title: "Usuarios" };

export default async function PaginaUsuarios() {
  const admin = await requerirAdmin("/admin/usuarios");
  const usuarios = await obtenerRepositorio().listarUsuarios();

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Quién puede entrar al sistema y con qué permisos."
      />

      <div className="mb-5">
        <Aviso tipo="info" titulo="Sobre los roles">
          El <strong>operador</strong> carga, consulta, edita y anula fichas. El{" "}
          <strong>administrador</strong> además configura motivos, fechas, el padrón de alumnos y
          los usuarios. Los usuarios desactivados pierden el acceso en su próximo click, sin
          esperar a que venza la sesión.
        </Aviso>
      </div>

      <GestorUsuarios usuarios={usuarios} idActual={admin.id} />
    </>
  );
}
