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
  const atencionId = String(formData.get("atencionId") ?? "");
  const tratamientoId = valorOpcionalSelect(formData, "tratamientoId");
  const profesionalId = String(formData.get("profesionalId") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const evolucion = String(formData.get("evolucion") ?? "").trim();
  const proximoControlFecha = campoOpcional(formData, "proximoControlFecha");
  // Viene de un input oculto con un valor fijo ("seguimiento"/
  // "epicrisis_atencion"/"epicrisis_general"), no de un Combobox — por eso
  // no pasa por valorOpcionalSelect/SIN_SELECCION.
  const tipo = campoOpcional(formData, "tipo") ?? "seguimiento";

  if (!pacienteId || !atencionId || !profesionalId || !fecha || !evolucion) {
    return { error: "Fecha, profesional y evolución son obligatorios." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  // atencionId/tratamientoId nunca se confían tal cual vienen del
  // formulario — mismo criterio de seguridad que crearTratamiento.
  const { data: atencionDestino } = await supabase
    .from("atenciones")
    .select("id, paciente_id")
    .eq("id", atencionId)
    .maybeSingle();
  if (!atencionDestino || atencionDestino.paciente_id !== pacienteId) {
    return { error: "La atención indicada no es válida para este paciente." };
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
    atencion_id: atencionId,
    profesional_id: profesionalId,
    fecha,
    evolucion,
    tipo,
    proximo_control_fecha: proximoControlFecha,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar la evolución." };

  revalidatePath(`/pacientes/${pacienteId}`);
  return null;
}

export type EvolucionDeAtencion = {
  id: string;
  fecha: string;
  evolucion: string;
  tipo: string;
  tratamiento_id: string | null;
  tratamiento: { fecha: string; tipos_tratamiento: { nombre: string } | null } | null;
  profesional: { nombre: string } | null;
};

export async function listarEvolucionesDeAtencion(atencionId: string): Promise<EvolucionDeAtencion[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("evoluciones_paciente")
    .select(
      "id, fecha, evolucion, tipo, tratamiento_id, tratamiento:tratamientos(fecha, tipos_tratamiento(nombre)), profesional:usuarios!evoluciones_paciente_profesional_id_fkey(nombre)",
    )
    .eq("atencion_id", atencionId)
    .eq("clinica_id", usuario.clinica_id)
    .order("fecha", { ascending: false });

  return (data ?? []) as unknown as EvolucionDeAtencion[];
}
