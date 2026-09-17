import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type UsuarioConRol = {
  id: string;
  clinica_id: string;
  rol_id: string;
  nombre: string;
  email: string;
  activo: boolean;
  roles: { nombre: string; nivel: number } | null;
};

export async function getCurrentUsuario(): Promise<UsuarioConRol | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, clinica_id, rol_id, nombre, email, activo, roles(nombre, nivel)")
    .eq("id", user.id)
    .single();

  return usuario as UsuarioConRol | null;
}

export async function requireUsuario(): Promise<UsuarioConRol> {
  const usuario = await getCurrentUsuario();
  if (!usuario) redirect("/login");
  return usuario;
}

export function esAdministrador(usuario: Pick<UsuarioConRol, "roles">): boolean {
  return usuario.roles?.nivel === 1;
}
