"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/actions";
import { siteUrl } from "@/lib/site-url";

/**
 * Guardas compartidas entre las dos formas de dar de alta a alguien
 * (invitación por correo y creación directa con contraseña): solo un
 * Administrador puede hacerlo, y el rol elegido tiene que ser de SU propia
 * clínica — si no, un admin podría colgar a alguien de un rol de otro tenant.
 */
async function validarAltaDeUsuario(rolId: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { ok: false as const, error: "Solo un Administrador puede crear usuarios." };
  }

  const supabase = await createClient();
  const { data: rol } = await supabase
    .from("roles")
    .select("id, clinica_id")
    .eq("id", rolId)
    .single();

  if (!rol || rol.clinica_id !== usuario.clinica_id) {
    return { ok: false as const, error: "Rol inválido." };
  }

  return { ok: true as const, usuario };
}

/**
 * Alta sin correo: el Administrador define la contraseña y se la entrega a la
 * persona. Existe porque la invitación por correo depende del servicio de
 * email de Supabase, que en plan gratuito solo entrega a miembros de la
 * organización — eso hacía imposible dar de alta (y probar) otros roles.
 * Además es como opera de verdad una clínica pequeña: el administrador crea
 * la cuenta del personal y le pasa las credenciales.
 */
export async function crearUsuarioConPassword(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rolId = String(formData.get("rolId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!nombre || !email || !rolId || !password) {
    return { error: "Completa todos los campos." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const check = await validarAltaDeUsuario(rolId);
  if (!check.ok) return { error: check.error };

  const admin = createAdminClient();
  // email_confirm: true — sin esto la cuenta queda esperando una confirmación
  // por correo que nunca llega, que es justo lo que este camino evita.
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (createError || !creado.user) {
    return { error: createError?.message ?? "No se pudo crear el usuario." };
  }

  const { error: insertError } = await admin.from("usuarios").insert({
    id: creado.user.id,
    clinica_id: check.usuario.clinica_id,
    rol_id: rolId,
    nombre,
    email,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: "No se pudo crear el usuario. ¿Ya existe con ese correo?" };
  }

  revalidatePath("/usuarios");
  return null;
}

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

  const check = await validarAltaDeUsuario(rolId);
  if (!check.ok) return { error: check.error };
  const usuario = check.usuario;

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
    const { error } = await supabase
      .from("rol_modulo_permiso")
      .upsert(
        { rol_id: rolId, modulo_id: moduloId, permiso_id: permisoId, concedido: true },
        { onConflict: "rol_id,modulo_id,permiso_id" },
      );
    if (error) throw new Error("No se pudo conceder el permiso.");
  } else {
    const { error } = await supabase
      .from("rol_modulo_permiso")
      .delete()
      .match({ rol_id: rolId, modulo_id: moduloId, permiso_id: permisoId });
    if (error) throw new Error("No se pudo quitar el permiso.");
  }

  revalidatePath("/usuarios");
}
