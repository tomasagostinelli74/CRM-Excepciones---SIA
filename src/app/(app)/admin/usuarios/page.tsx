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
        descripcion="Quien puede entrar al sistema y con que permisos."
      />

      <div className="mb-5">
        <Aviso tipo="info" titulo="Sobre los roles">
          El <strong>operador</strong> carga, consulta, edita y anula fichas. El{" "}
          <strong>administrador</strong> ademas configura motivos, fechas, el padron de alumnos y
          los usuarios. Los usuarios desactivados pierden el acceso en su proximo click, sin
          esperar a que venza la sesion.
        </Aviso>
      </div>

      <GestorUsuarios usuarios={usuarios} idActual={admin.id} />
    </>
  );
}
