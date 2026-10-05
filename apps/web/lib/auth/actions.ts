"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";
import { enviarCorreoRestablecerPassword } from "@/lib/email/passwordResetCorreo";

const MAX_INTENTOS_LOGIN = 5;

export type ActionState = { error?: string } | null;

export async function login(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y tu contraseña." };
  }

  const admin = createAdminClient();
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, bloqueado, intentos_login, activo")
    .eq("email", email)
    .maybeSingle();

  if (usuario && !usuario.activo) {
    return { error: "Esta cuenta está desactivada. Contacta a tu administrador." };
  }

  if (usuario?.bloqueado) {
    return {
      error: "Cuenta bloqueada por demasiados intentos fallidos. Contacta a tu administrador.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (usuario) {
      const intentos = usuario.intentos_login + 1;
      const bloquear = intentos >= MAX_INTENTOS_LOGIN;
      await admin
        .from("usuarios")
        .update({
          intentos_login: intentos,
          bloqueado: bloquear,
          fecha_bloqueo: bloquear ? new Date().toISOString() : null,
        })
        .eq("id", usuario.id);

      if (bloquear) {
        return {
          error: "Cuenta bloqueada por demasiados intentos fallidos. Contacta a tu administrador.",
        };
      }
    }
    return { error: "Credenciales inválidas." };
  }

  if (usuario) {
    await admin
      .from("usuarios")
      .update({ intentos_login: 0, ultimo_acceso: new Date().toISOString() })
      .eq("id", usuario.id);
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type OlvidePasswordState = { enviado: true } | { error: string } | null;

/**
 * El correo nativo de recuperación de Supabase tiene el mismo problema que
 * ya bloqueaba las invitaciones (ver inviteStaff): en plan gratuito solo
 * entrega a miembros de la organización de Supabase. En vez de usar
 * `resetPasswordForEmail` (que dispara ese correo), se genera el link con
 * la API de administrador (`generateLink`, no envía nada) y se manda por
 * Resend — mismo canal que ya funciona para las citas.
 *
 * Nunca revela si el correo existe o si la cuenta está activa: siempre
 * devuelve el mismo resultado, para no filtrar esa información a quien
 * sea que esté probando correos al azar.
 */
export async function solicitarRestablecerPassword(
  _prevState: OlvidePasswordState,
  formData: FormData,
): Promise<OlvidePasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Ingresa tu correo electrónico." };

  const admin = createAdminClient();
  const { data: usuario } = await admin
    .from("usuarios")
    .select("nombre, activo")
    .eq("email", email)
    .maybeSingle();

  if (usuario?.activo) {
    const { data: link } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl()}/set-password` },
    });

    const hashedToken = link?.properties?.hashed_token;
    if (hashedToken) {
      const url = `${siteUrl()}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/set-password`;
      await enviarCorreoRestablecerPassword({ email, nombre: usuario.nombre, link: url });
    }
  }

  return { enviado: true };
}

/**
 * Se llama justo después de que alguien define una contraseña nueva desde
 * el link de recuperación (ver SetPasswordForm). El id sale de la sesión
 * del propio usuario (nunca del cliente), así que solo puede desbloquearse
 * a sí mismo — nunca a otra cuenta. Mismo criterio que `restablecerPassword`
 * (el que usa un Administrador desde Usuarios): si alguien llegó hasta acá
 * es porque ya probó su contraseña nueva, así que lo que necesita es volver
 * a entrar, no seguir bloqueado por los intentos fallidos previos.
 */
export async function limpiarBloqueoPropio() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  await admin
    .from("usuarios")
    .update({ bloqueado: false, intentos_login: 0, fecha_bloqueo: null })
    .eq("id", user.id);
}

export async function signUpClinica(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nombreClinica = String(formData.get("nombreClinica") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").trim();
  const nombreAdmin = String(formData.get("nombreAdmin") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!nombreClinica || !nit || !nombreAdmin || !email || !password) {
    return { error: "Completa todos los campos." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre: nombreAdmin } },
  });

  if (signUpError) {
    return { error: signUpError.message };
  }
  if (!signUpData.user) {
    return { error: "No se pudo crear el usuario. Intenta de nuevo." };
  }

  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc("bootstrap_clinica", {
    p_nombre_clinica: nombreClinica,
    p_nit: nit,
    p_admin_id: signUpData.user.id,
    p_admin_nombre: nombreAdmin,
    p_admin_email: email,
  });

  if (rpcError) {
    // El usuario de auth ya se creó pero sin clínica/usuario asociado.
    // Lo eliminamos para poder reintentar el registro con el mismo email.
    await admin.auth.admin.deleteUser(signUpData.user.id);
    if (rpcError.message.includes("nit")) {
      return { error: "Ya existe una clínica registrada con ese NIT." };
    }
    return { error: "No se pudo completar el registro. Intenta de nuevo." };
  }

  redirect("/check-email");
}
