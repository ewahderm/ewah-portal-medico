"use server";

// Gestión de usuarios existentes: activar/desactivar, cambiar rol, cambiar
// correo y enviar el enlace para restablecer la contraseña.
//
// Quién puede: el Administrador de la clínica (solo usuarios de SU clínica)
// y el super administrador de EWAH Tech (cualquier clínica, para apoyar a
// un administrador que perdió el acceso). Se usa el cliente de servicio
// porque el trigger usuarios_prevent_self_privilege_escalation impide por
// sesión cambiar rol_id; por eso todas las reglas se validan aquí:
//   - una clínica nunca queda sin un Administrador activo;
//   - nadie se desactiva ni se cambia el rol a sí mismo (lo hace otro
//     administrador); sí puede cambiar su propio correo (traspasar la cuenta).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdministrador, getCurrentUsuario } from "@/lib/auth/session";
import { siteUrl } from "@/lib/site-url";
import { enviarCorreoRestablecerPassword } from "@/lib/email/passwordResetCorreo";
import type { ResultadoAccion } from "@/lib/forms/resultado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Objetivo = { id: string; clinica_id: string; rol_id: string; nombre: string; email: string; activo: boolean; roles: { nivel: number } | null };

async function esSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("es_super_admin");
  return Boolean(data);
}

async function autorizar(usuarioId: string) {
  if (!UUID.test(usuarioId)) return { ok: false as const, error: "Usuario inválido." };
  const actor = await getCurrentUsuario();
  if (!actor) return { ok: false as const, error: "Sesión inválida." };
  const admin = createAdminClient();
  const { data } = await admin.from("usuarios").select("id, clinica_id, rol_id, nombre, email, activo, roles(nivel)").eq("id", usuarioId).maybeSingle();
  const objetivo = data as unknown as Objetivo | null;
  if (!objetivo) return { ok: false as const, error: "Usuario inválido." };
  const delaClinica = esAdministrador(actor) && actor.clinica_id === objetivo.clinica_id;
  const superAdmin = delaClinica ? false : await esSuperAdmin();
  if (!delaClinica && !superAdmin) return { ok: false as const, error: "No tienes permiso para gestionar este usuario." };
  return { ok: true as const, admin, actor, objetivo };
}

// Administradores activos de la clínica sin contar a `excluir`.
async function otrosAdministradoresActivos(admin: ReturnType<typeof createAdminClient>, clinicaId: string, excluir: string): Promise<number> {
  const { count } = await admin
    .from("usuarios")
    .select("id, roles!inner(nivel)", { count: "exact", head: true })
    .eq("clinica_id", clinicaId)
    .eq("activo", true)
    .eq("roles.nivel", 1)
    .neq("id", excluir);
  return count ?? 0;
}

const revalidar = () => {
  revalidatePath("/usuarios");
  revalidatePath("/plataforma");
};

export async function cambiarEstadoUsuario(usuarioId: string, activo: boolean): Promise<ResultadoAccion> {
  const a = await autorizar(usuarioId);
  if (!a.ok) return { error: a.error };
  const { admin, actor, objetivo } = a;
  if (!activo && objetivo.id === actor.id) return { error: "No puedes desactivarte a ti mismo: pídeselo a otro administrador." };
  if (!activo && objetivo.roles?.nivel === 1 && objetivo.activo && (await otrosAdministradoresActivos(admin, objetivo.clinica_id, objetivo.id)) === 0) {
    return { error: "Es el único administrador activo de la clínica: primero activa o crea otro administrador." };
  }
  const cambios = activo ? { activo: true, bloqueado: false, intentos_login: 0, fecha_bloqueo: null } : { activo: false };
  const { error } = await admin.from("usuarios").update(cambios).eq("id", objetivo.id);
  if (error) return { error: "No se pudo actualizar el usuario." };
  revalidar();
  return {};
}

export async function cambiarRolUsuario(usuarioId: string, rolId: string): Promise<ResultadoAccion> {
  if (!UUID.test(rolId)) return { error: "Rol inválido." };
  const a = await autorizar(usuarioId);
  if (!a.ok) return { error: a.error };
  const { admin, actor, objetivo } = a;
  if (objetivo.id === actor.id) return { error: "No puedes cambiar tu propio rol: pídeselo a otro administrador." };
  const { data: rol } = await admin.from("roles").select("id, clinica_id, nivel").eq("id", rolId).maybeSingle();
  if (!rol || rol.clinica_id !== objetivo.clinica_id) return { error: "Rol inválido." };
  if (rol.id === objetivo.rol_id) return {};
  if (objetivo.roles?.nivel === 1 && rol.nivel !== 1 && objetivo.activo && (await otrosAdministradoresActivos(admin, objetivo.clinica_id, objetivo.id)) === 0) {
    return { error: "Es el único administrador activo de la clínica: primero asigna otro administrador." };
  }
  const { error } = await admin.from("usuarios").update({ rol_id: rol.id }).eq("id", objetivo.id);
  if (error) return { error: "No se pudo cambiar el rol." };
  revalidar();
  return {};
}

// Cambia el correo con el que la persona inicia sesión. Sirve para corregir
// un correo mal escrito o para traspasar la cuenta (por ejemplo, quien
// configuró la clínica se la entrega a su dueño).
export async function cambiarCorreoUsuario(usuarioId: string, correo: string): Promise<ResultadoAccion> {
  const email = correo.trim().toLowerCase();
  if (!CORREO.test(email) || email.length > 254) return { error: "Escribe un correo válido." };
  const a = await autorizar(usuarioId);
  if (!a.ok) return { error: a.error };
  const { admin, objetivo } = a;
  if (email === objetivo.email.toLowerCase()) return {};
  const { data: ocupado } = await admin.from("usuarios").select("id").eq("email", email).maybeSingle();
  if (ocupado) return { error: "Ese correo ya lo usa otra cuenta de EWAH." };
  const { error: errorAuth } = await admin.auth.admin.updateUserById(objetivo.id, { email, email_confirm: true });
  if (errorAuth) {
    return { error: /registered|exists|already/i.test(errorAuth.message) ? "Ese correo ya lo usa otra cuenta de EWAH." : "No se pudo cambiar el correo." };
  }
  const { error } = await admin.from("usuarios").update({ email }).eq("id", objetivo.id);
  if (error) {
    // Deja el inicio de sesión como estaba para no desalinear las dos tablas.
    await admin.auth.admin.updateUserById(objetivo.id, { email: objetivo.email, email_confirm: true });
    return { error: "No se pudo cambiar el correo." };
  }
  revalidar();
  return {};
}

// Envía a la persona el mismo correo de "¿Olvidaste tu contraseña?", para
// que ella misma defina una nueva. No se ve ni se elige la contraseña.
export async function enviarEnlaceRestablecer(usuarioId: string): Promise<ResultadoAccion> {
  const a = await autorizar(usuarioId);
  if (!a.ok) return { error: a.error };
  const { admin, objetivo } = a;
  if (!objetivo.activo) return { error: "La cuenta está desactivada: actívala primero." };
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: objetivo.email,
    options: { redirectTo: `${siteUrl()}/set-password` },
  });
  const hashedToken = link?.properties?.hashed_token;
  if (error || !hashedToken) return { error: "No se pudo generar el enlace." };
  const url = `${siteUrl()}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/set-password`;
  // Nunca lanza: si el envío falla queda en el log (ver passwordResetCorreo).
  await enviarCorreoRestablecerPassword({ email: objetivo.email, nombre: objetivo.nombre, link: url });
  return {};
}

export type UsuarioGestion = { id: string; nombre: string; email: string; activo: boolean; bloqueado: boolean; rol_id: string };
export type RolGestion = { id: string; nombre: string; nivel: number };

// Para el super administrador (Plataforma): usuarios y roles de una clínica.
export async function listarUsuariosClinicaPlataforma(clinicaId: string): Promise<ResultadoAccion & { usuarios?: UsuarioGestion[]; roles?: RolGestion[] }> {
  if (!UUID.test(clinicaId)) return { error: "Clínica inválida." };
  if (!(await esSuperAdmin())) return { error: "No tienes permiso para esta acción." };
  const admin = createAdminClient();
  const [{ data: usuarios }, { data: roles }] = await Promise.all([
    admin.from("usuarios").select("id, nombre, email, activo, bloqueado, rol_id").eq("clinica_id", clinicaId).order("nombre"),
    admin.from("roles").select("id, nombre, nivel").eq("clinica_id", clinicaId).order("nivel", { ascending: false }).order("nombre"),
  ]);
  return { usuarios: (usuarios ?? []) as UsuarioGestion[], roles: (roles ?? []) as RolGestion[] };
}
