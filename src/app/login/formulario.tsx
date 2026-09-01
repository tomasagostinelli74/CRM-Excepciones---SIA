"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Aviso } from "@/components/ui";
import { iniciarSesion, type EstadoLogin } from "./acciones";

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton boton-primario w-full" disabled={pending}>
      {pending ? "Ingresando…" : "Ingresar"}
    </button>
  );
}

export function FormularioLogin({ siguiente }: { siguiente?: string }) {
  const [estado, accion] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});

  return (
    <form action={accion} className="space-y-4" noValidate>
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}

      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      <div>
        <label className="etiqueta" htmlFor="usuario">
          Usuario
        </label>
        <input
          id="usuario"
          name="usuario"
          className="campo"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="password">
          Contrasena
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="campo"
          autoComplete="current-password"
          required
        />
      </div>

      <BotonEntrar />
    </form>
  );
}
