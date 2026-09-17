"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import { valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

async function requirePermiso() {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tienePermiso } = await supabase.rpc("has_permission", {
    modulo_code: "pacientes",
    permiso_code: "CREATE",
  });

  if (!tienePermiso) {
    return { ok: false as const, error: "No tienes permiso para esta acción." };
  }
  return { ok: true as const, usuario };
}

export async function crearContacto(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pacienteId = String(formData.get("pacienteId") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  const resultado = valorOpcionalSelect(formData, "resultado");
  const proximaAccionFecha = String(formData.get("proximaAccionFecha") ?? "").trim() || null;
  const proximaAccionNota = String(formData.get("proximaAccionNota") ?? "").trim() || null;

  if (!pacienteId || !tipo || !nota || !fecha) {
    return { error: "Fecha, tipo de contacto y nota son obligatorios." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("contactos_paciente").insert({
    clinica_id: check.usuario.clinica_id,
    paciente_id: pacienteId,
    fecha,
    tipo,
    nota,
    resultado,
    proxima_accion_fecha: proximaAccionFecha,
    proxima_accion_nota: proximaAccionNota,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar el contacto." };

  revalidatePath(`/pacientes/${pacienteId}`);
  return null;
}
