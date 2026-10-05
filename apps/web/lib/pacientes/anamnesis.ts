"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

// Mismo criterio que evoluciones_paciente: contenido clínico, no comercial
// — reutiliza el permiso de Tratamientos, no el de Pacientes.
function requirePermiso() {
  return requirePermisoBase("tratamientos", "CREATE");
}

export async function crearAnamnesis(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pacienteId = String(formData.get("pacienteId") ?? "");
  const citaId = campoOpcional(formData, "citaId");
  const profesionalId = String(formData.get("profesionalId") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const motivoConsulta = String(formData.get("motivoConsulta") ?? "").trim();
  const antecedentesPersonales = formData.getAll("antecedentesPersonales").map(String);
  const antecedentesOtros = campoOpcional(formData, "antecedentesOtros");
  const alergias = formData.getAll("alergias").map(String);
  const alergiasOtras = campoOpcional(formData, "alergiasOtras");
  const medicamentosActuales = formData.getAll("medicamentosActuales").map(String);
  const medicamentosOtros = campoOpcional(formData, "medicamentosOtros");
  const habitos = formData.getAll("habitos").map(String);
  const habitosOtros = campoOpcional(formData, "habitosOtros");
  const fototipo = valorOpcionalSelect(formData, "fototipo");
  const tallaCm = campoOpcional(formData, "tallaCm");
  const pesoKg = campoOpcional(formData, "pesoKg");
  const tipoSangre = valorOpcionalSelect(formData, "tipoSangre");
  const examenFisicoHallazgos = campoOpcional(formData, "examenFisicoHallazgos");

  if (!pacienteId || !profesionalId || !fecha || !motivoConsulta) {
    return { error: "Fecha, profesional y motivo de consulta son obligatorios." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  // citaId/tratamientoId nunca se confían tal cual vienen del formulario —
  // mismo criterio de seguridad que crearEvolucion/crearTratamiento.
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

  const { error } = await supabase.from("anamnesis_paciente").insert({
    clinica_id: check.usuario.clinica_id,
    paciente_id: pacienteId,
    cita_id: citaIdValidado,
    profesional_id: profesionalId,
    fecha,
    motivo_consulta: motivoConsulta,
    antecedentes_personales: antecedentesPersonales,
    antecedentes_otros: antecedentesOtros,
    alergias,
    alergias_otras: alergiasOtras,
    medicamentos_actuales: medicamentosActuales,
    medicamentos_otros: medicamentosOtros,
    habitos,
    habitos_otros: habitosOtros,
    fototipo,
    talla_cm: tallaCm ? Number(tallaCm) : null,
    peso_kg: pesoKg ? Number(pesoKg) : null,
    tipo_sangre: tipoSangre,
    examen_fisico_hallazgos: examenFisicoHallazgos,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar la anamnesis." };

  revalidatePath(`/pacientes/${pacienteId}`);
  return null;
}
