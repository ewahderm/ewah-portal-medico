"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

// Reutiliza el permiso de Tratamientos (no el de Pacientes, que sí usa
// contactos_paciente) — una evolución es contenido clínico, no comercial:
// ver supabase/migrations/0041_evoluciones_paciente.sql.
function requirePermiso() {
  return requirePermisoBase("tratamientos", "CREATE");
}

export async function crearEvolucion(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pacienteId = String(formData.get("pacienteId") ?? "");
  const citaId = campoOpcional(formData, "citaId");
  const tratamientoId = valorOpcionalSelect(formData, "tratamientoId");
  const profesionalId = String(formData.get("profesionalId") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const evolucion = String(formData.get("evolucion") ?? "").trim();
  const proximoControlFecha = campoOpcional(formData, "proximoControlFecha");

  if (!pacienteId || !profesionalId || !fecha || !evolucion) {
    return { error: "Fecha, profesional y evolución son obligatorios." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  // citaId/tratamientoId nunca se confían tal cual vienen del formulario —
  // mismo criterio de seguridad que crearTratamiento con su propio citaId.
  let citaIdValidado: string | null = null;
  if (citaId) {
    const { data: citaDestino } = await supabase
      .from("citas")
      .select("id, paciente_id")
      .eq("id", citaId)
      .maybeSingle();
    if (!citaDestino || citaDestino.paciente_id !== pacienteId) {
      return { error: "La cita indicada no es válida para este paciente." };
    }
    citaIdValidado = citaId;
  }

  let tratamientoIdValidado: string | null = null;
  if (tratamientoId) {
    const { data: tratamientoDestino } = await supabase
      .from("tratamientos")
      .select("id, paciente_id")
      .eq("id", tratamientoId)
      .maybeSingle();
    if (!tratamientoDestino || tratamientoDestino.paciente_id !== pacienteId) {
      return { error: "El tratamiento indicado no es válido para este paciente." };
    }
    tratamientoIdValidado = tratamientoId;
  }

  const { error } = await supabase.from("evoluciones_paciente").insert({
    clinica_id: check.usuario.clinica_id,
    paciente_id: pacienteId,
    tratamiento_id: tratamientoIdValidado,
    cita_id: citaIdValidado,
    profesional_id: profesionalId,
    fecha,
    evolucion,
    proximo_control_fecha: proximoControlFecha,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar la evolución." };

  // Mismo mecanismo que crearTratamiento: una evolución ligada a una cita
  // la marca atendida, sin exigir que haya un tratamiento (procedimiento).
  if (citaIdValidado) {
    await supabase.from("citas").update({ estado: "atendida" }).eq("id", citaIdValidado);
    revalidatePath("/citas");
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  return null;
}

export type EvolucionDeCita = {
  id: string;
  fecha: string;
  evolucion: string;
  profesional: { nombre: string } | null;
};

export async function listarEvolucionesDeCita(citaId: string): Promise<EvolucionDeCita[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("evoluciones_paciente")
    .select(
      "id, fecha, evolucion, profesional:usuarios!evoluciones_paciente_profesional_id_fkey(nombre)",
    )
    .eq("cita_id", citaId)
    .eq("clinica_id", usuario.clinica_id)
    .order("fecha", { ascending: false });

  return (data ?? []) as unknown as EvolucionDeCita[];
}
