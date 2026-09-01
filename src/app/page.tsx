import { redirect } from "next/navigation";

/** La raiz no tiene contenido propio: el punto de entrada real es el listado. */
export default function Inicio() {
  redirect("/fichas");
}
