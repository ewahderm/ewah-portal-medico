"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
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
  const atencionId = String(formData.get("atencionId") ?? "");
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

  if (!pacienteId || !atencionId || !profesionalId || !fecha || !motivoConsulta) {
    return { error: "Fecha, profesional y motivo de consulta son obligatorios." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  // atencionId nunca se confía tal cual viene del formulario — mismo
  // criterio de seguridad que crearEvolucion/crearTratamiento.
  const { data: atencionDestino } = await supabase
    .from("atenciones")
    .select("id, paciente_id")
    .eq("id", atencionId)
    .maybeSingle();
  if (!atencionDestino || atencionDestino.paciente_id !== pacienteId) {
    return { error: "La atención indicada no es válida para este paciente." };
  }

  const { error } = await supabase.from("anamnesis_paciente").insert({
    clinica_id: check.usuario.clinica_id,
    paciente_id: pacienteId,
    atencion_id: atencionId,
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

export type AnamnesisDeAtencion = {
  id: string;
  fecha: string;
  motivo_consulta: string;
  antecedentes_personales: string[];
  antecedentes_otros: string | null;
  alergias: string[];
  alergias_otras: string | null;
  medicamentos_actuales: string[];
  medicamentos_otros: string | null;
  habitos: string[];
  habitos_otros: string | null;
  fototipo: string | null;
  talla_cm: number | null;
  peso_kg: number | null;
  tipo_sangre: string | null;
  examen_fisico_hallazgos: string | null;
  profesional: { nombre: string } | null;
};

// Como mucho hay una anamnesis por atención en la práctica, pero no hay
// restricción de unicidad — si llegara a haber más de una, se muestra la
// más reciente.
export async function obtenerAnamnesisDeAtencion(
  atencionId: string,
): Promise<AnamnesisDeAtencion | null> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("anamnesis_paciente")
    .select(
      `id, fecha, motivo_consulta, antecedentes_personales, antecedentes_otros,
       alergias, alergias_otras, medicamentos_actuales, medicamentos_otros, habitos,
       habitos_otros, fototipo, talla_cm, peso_kg, tipo_sangre, examen_fisico_hallazgos,
       profesional:usuarios!anamnesis_paciente_profesional_id_fkey(nombre)`,
    )
    .eq("atencion_id", atencionId)
    .eq("clinica_id", usuario.clinica_id)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as unknown as AnamnesisDeAtencion | null;
}

// Para el botón "Copiar de la última anamnesis" — la más reciente del
// paciente en cualquier atención, no solo la de la atención actual.
export async function obtenerUltimaAnamnesisPaciente(
  pacienteId: string,
): Promise<AnamnesisDeAtencion | null> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("anamnesis_paciente")
    .select(
      `id, fecha, motivo_consulta, antecedentes_personales, antecedentes_otros,
       alergias, alergias_otras, medicamentos_actuales, medicamentos_otros, habitos,
       habitos_otros, fototipo, talla_cm, peso_kg, tipo_sangre, examen_fisico_hallazgos,
       profesional:usuarios!anamnesis_paciente_profesional_id_fkey(nombre)`,
    )
    .eq("paciente_id", pacienteId)
    .eq("clinica_id", usuario.clinica_id)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as unknown as AnamnesisDeAtencion | null;
}
