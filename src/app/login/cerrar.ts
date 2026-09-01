"use server";

import { redirect } from "next/navigation";

import { cerrarSesion } from "@/lib/auth";

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect("/login");
}
