"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/actions";
import { siteUrl } from "@/lib/site-url";

export async function inviteStaff(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rolId = String(formData.get("rolId") ?? "");

  if (!nombre || !email || !rolId) {
    return { error: "Completa todos los campos." };
  }

  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { error: "Solo un Administrador puede invitar usuarios." };
  }

  const supabase = await createClient();
  const { data: rol } = await supabase
    .from("roles")
    .select("id, clinica_id")
    .eq("id", rolId)
    .single();

  if (!rol || rol.clinica_id !== usuario.clinica_id) {
    return { error: "Rol inválido." };
  }

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: { nombre },
      redirectTo: `${siteUrl()}/set-password`,
    },
  );

  if (inviteError) {
    return { error: inviteError.message };
  }

  const { error: insertError } = await admin.from("usuarios").insert({
    id: invited.user.id,
    clinica_id: usuario.clinica_id,
    rol_id: rolId,
    nombre,
    email,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return { error: "No se pudo crear el usuario. ¿Ya existe con ese correo?" };
  }

  revalidatePath("/usuarios");
  return null;
}

export async function createRol(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;

  if (!nombre) return { error: "El nombre del rol es obligatorio." };

  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { error: "Solo un Administrador puede crear roles." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    clinica_id: usuario.clinica_id,
    nombre,
    descripcion,
    nivel: 0,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un rol con ese nombre." };
    }
    return { error: "No se pudo crear el rol." };
  }

  revalidatePath("/usuarios");
  return null;
}

export async function toggleRolPermiso(
  rolId: string,
  moduloId: string,
  permisoId: string,
  concedido: boolean,
) {
  const usuario = await getCurrentUsuario();
  if (!usuario || !esAdministrador(usuario)) {
    throw new Error("Solo un Administrador puede editar permisos.");
  }

  const supabase = await createClient();
  const { data: rol } = await supabase
    .from("roles")
    .select("clinica_id")
    .eq("id", rolId)
    .single();

  if (!rol || rol.clinica_id !== usuario.clinica_id) {
    throw new Error("Rol inválido.");
  }

  if (concedido) {
    await supabase
      .from("rol_modulo_permiso")
      .upsert(
        { rol_id: rolId, modulo_id: moduloId, permiso_id: permisoId, concedido: true },
        { onConflict: "rol_id,modulo_id,permiso_id" },
      );
  } else {
    await supabase
      .from("rol_modulo_permiso")
      .delete()
      .match({ rol_id: rolId, modulo_id: moduloId, permiso_id: permisoId });
  }

  revalidatePath("/usuarios");
}
