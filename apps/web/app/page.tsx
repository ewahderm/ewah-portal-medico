import { redirect } from "next/navigation";
import { getCurrentUsuario } from "@/lib/auth/session";

export default async function Home() {
  const usuario = await getCurrentUsuario();
  redirect(usuario ? "/dashboard" : "/login");
}
