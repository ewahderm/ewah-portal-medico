"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
