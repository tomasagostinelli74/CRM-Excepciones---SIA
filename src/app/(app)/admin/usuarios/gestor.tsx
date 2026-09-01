"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Aviso, Panel, PanelDesplegable } from "@/components/ui";
import type { Usuario } from "@/lib/domain/types";
import { formatearInstante } from "@/lib/utils/fechas";
import { guardarUsuario, type EstadoAdmin } from "../acciones";

function Boton({ texto, cargando }: { texto: string; cargando: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton boton-primario" disabled={pending}>
      {pending ? cargando : texto}
    </button>
  );
}

function FormularioUsuario({
  usuario,
  esUsuarioActual,
  alTerminar,
}: {
  usuario?: Usuario;
  esUsuarioActual: boolean;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [estado, accion] = useActionState<EstadoAdmin, FormData>(guardarUsuario, {});
  const editando = Boolean(usuario);

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
      alTerminar();
    }
  }, [estado.ok, router, alTerminar]);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {usuario ? <input type="hidden" name="id" value={usuario.id} /> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="u-usuario">
            Usuario
          </label>
          <input
            id="u-usuario"
            name="usuario"
            className="campo"
            required
            autoFocus={!editando}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={usuario?.usuario ?? ""}
            placeholder="Ej.: Aromero"
            aria-invalid={Boolean(estado.errores?.usuario)}
            aria-describedby="u-usuario-ayuda"
          />
          <p id="u-usuario-ayuda" className="ayuda mt-1.5">
            Letras, numeros, punto, guion y guion bajo.
          </p>
          {estado.errores?.usuario ? <p className="error-campo">{estado.errores.usuario}</p> : null}
        </div>

        <div>
          <label className="etiqueta" htmlFor="u-nombre">
            Nombre y apellido
          </label>
          <input
            id="u-nombre"
            name="nombre"
            className="campo"
            required
            defaultValue={usuario?.nombre ?? ""}
            aria-invalid={Boolean(estado.errores?.nombre)}
          />
          {estado.errores?.nombre ? <p className="error-campo">{estado.errores.nombre}</p> : null}
        </div>

        <div>
          <label className="etiqueta" htmlFor="u-rol">
            Rol
          </label>
          <select
            id="u-rol"
            name="rol"
            className="campo"
            defaultValue={usuario?.rol ?? "operador"}
            aria-describedby="u-rol-ayuda"
          >
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
          <p id="u-rol-ayuda" className="ayuda mt-1.5">
            El operador solo carga y consulta fichas.
          </p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="u-password">
            Contrasena{" "}
            {editando ? <span className="font-normal">(dejar vacio para no cambiarla)</span> : null}
          </label>
          <input
            id="u-password"
            name="password"
            type="password"
            className="campo"
            autoComplete="new-password"
            required={!editando}
            minLength={8}
            aria-invalid={Boolean(estado.errores?.password)}
            aria-describedby="u-password-ayuda"
          />
          <p id="u-password-ayuda" className="ayuda mt-1.5">
            Minimo 8 caracteres.
          </p>
          {estado.errores?.password ? <p className="error-campo">{estado.errores.password}</p> : null}
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="activo"
          className="h-4 w-4"
          defaultChecked={usuario?.activo ?? true}
        />
        <span>
          Activo
          <span className="ml-1" style={{ color: "var(--texto-tenue)" }}>
            (puede iniciar sesion)
          </span>
        </span>
      </label>

      {esUsuarioActual ? (
        <Aviso tipo="info">
          Estas editando tu propio usuario: no podes quitarte el rol de administrador ni
          desactivarte.
        </Aviso>
      ) : null}

      <div className="flex gap-2">
        <Boton texto={editando ? "Guardar cambios" : "Crear usuario"} cargando="Guardando…" />
        <button type="button" className="boton boton-secundario" onClick={alTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function GestorUsuarios({ usuarios, idActual }: { usuarios: Usuario[]; idActual: string }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-5">
      <PanelDesplegable
        titulo="Nuevo usuario"
        resumen="Agregar un usuario"
        abierto={creando}
        alCambiar={setCreando}
      >
        <FormularioUsuario esUsuarioActual={false} alTerminar={() => setCreando(false)} />
      </PanelDesplegable>

      <Panel sinPadding>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Alta</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) =>
                editando === usuario.id ? (
                  <tr key={usuario.id}>
                    <td colSpan={6} className="bg-[var(--superficie-2)] p-4">
                      <FormularioUsuario
                        usuario={usuario}
                        esUsuarioActual={usuario.id === idActual}
                        alTerminar={() => setEditando(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={usuario.id}>
                    <td className="font-mono font-medium">
                      {usuario.usuario}
                      {usuario.id === idActual ? (
                        <span className="ml-2 chip chip-neutro">vos</span>
                      ) : null}
                    </td>
                    <td>{usuario.nombre}</td>
                    <td>
                      <span className={`chip ${usuario.rol === "admin" ? "chip-vigente" : "chip-neutro"}`}>
                        {usuario.rol === "admin" ? "Administrador" : "Operador"}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${usuario.activo ? "chip-vigente" : "chip-anulada"}`}>
                        {usuario.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="text-xs tabular-nums" style={{ color: "var(--texto-tenue)" }}>
                      {formatearInstante(usuario.creadoEn)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="boton boton-sutil"
                        onClick={() => setEditando(usuario.id)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
