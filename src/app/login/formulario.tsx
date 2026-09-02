"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { iniciarSesion, type EstadoLogin } from "./acciones";

function IconoAlerta() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0"
    >
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="liquid-boton" disabled={pending}>
      {pending ? "Ingresando…" : "Ingresar"}
    </button>
  );
}

export function FormularioLogin({ siguiente }: { siguiente?: string }) {
  const [estado, accion] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});

  return (
    <form action={accion} className="space-y-4" noValidate>
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}

      {estado.error ? (
        <div className="liquid-error" role="alert">
          <IconoAlerta />
          <span>{estado.error}</span>
        </div>
      ) : null}

      <div className="liquid-campo-grupo">
        <label className="liquid-etiqueta" htmlFor="usuario">
          Usuario
        </label>
        <input
          id="usuario"
          name="usuario"
          className="liquid-input"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={Boolean(estado.error)}
          required
          autoFocus
        />
      </div>

      <div className="liquid-campo-grupo">
        <label className="liquid-etiqueta" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="liquid-input"
          autoComplete="current-password"
          aria-invalid={Boolean(estado.error)}
          required
        />
      </div>

      <BotonEntrar />
    </form>
  );
}
