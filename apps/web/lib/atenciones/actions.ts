"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";

// Mismo criterio que evoluciones_paciente/anamnesis_paciente: contenido
// clínico, no comercial.
function requirePermiso() {
  return requirePermisoBase("tratamientos", "CREATE");
}

// Idempotente: si la cita ya tiene una atención (unique index en
// atenciones.cita_id), la devuelve en vez de duplicarla — "Atender" se
// puede pulsar más de una vez sin crear atenciones de sobra.
export async function crearAtencionDesdeCita(citaId: string): Promise<{ error: string } | { atencionId: string }> {
  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("atenciones")
    .select("id")
    .eq("cita_id", citaId)
    .maybeSingle();
  if (existente) return { atencionId: existente.id };

  const { data: cita } = await supabase
    .from("citas")
    .select("id, paciente_id, profesional_id, fecha")
    .eq("id", citaId)
    .maybeSingle();
  if (!cita || !cita.paciente_id) return { error: "La cita indicada no es válida." };

  const { data: atencion, error } = await supabase
    .from("atenciones")
    .insert({
      clinica_id: check.usuario.clinica_id,
      paciente_id: cita.paciente_id,
      cita_id: citaId,
      profesional_id: cita.profesional_id,
      fecha: cita.fecha,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (error || !atencion) return { error: "No se pudo crear la atención." };

  await supabase.from("citas").update({ estado: "atendida" }).eq("id", citaId);
  revalidatePath("/citas");

  return { atencionId: atencion.id };
}

export type CrearAtencionResultado =
  | { error: string; atencionId?: undefined }
  | { atencionId: string; error?: undefined }
  | null;

export async function crearAtencionSinCita(
  _prevState: CrearAtencionResultado,
  formData: FormData,
): Promise<CrearAtencionResultado> {
  const pacienteId = String(formData.get("pacienteId") ?? "");
  const profesionalId = String(formData.get("profesionalId") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const motivo = campoOpcional(formData, "motivo");

  if (!pacienteId || !profesionalId || !fecha) {
    return { error: "Paciente, profesional y fecha son obligatorios." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: atencion, error } = await supabase
    .from("atenciones")
    .insert({
      clinica_id: check.usuario.clinica_id,
      paciente_id: pacienteId,
      profesional_id: profesionalId,
      fecha,
      motivo,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (error || !atencion) return { error: "No se pudo crear la atención." };

  revalidatePath(`/pacientes/${pacienteId}`);
  return { atencionId: atencion.id };
}

export type AtencionDetalle = {
  id: string;
  paciente_id: string;
  cita_id: string | null;
  profesional_id: string;
  fecha: string;
  motivo: string | null;
  profesional: { nombre: string } | null;
  paciente: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  } | null;
  cita: {
    hora_inicio: string;
    hora_fin: string;
    consultorios: { nombre: string; sedes: { nombre: string } | null } | null;
  } | null;
};

export async function obtenerAtencion(atencionId: string): Promise<AtencionDetalle | null> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("atenciones")
    .select(
      `id, paciente_id, cita_id, profesional_id, fecha, motivo,
       profesional:usuarios!atenciones_profesional_id_fkey(nombre),
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       cita:citas(hora_inicio, hora_fin, consultorios(nombre, sedes(nombre)))`,
    )
    .eq("id", atencionId)
    .eq("clinica_id", usuario.clinica_id)
    .maybeSingle();

  if (!data) return null;
  const fila = data as unknown as Omit<AtencionDetalle, "paciente" | "cita"> & {
    pacientes: AtencionDetalle["paciente"];
    cita: AtencionDetalle["cita"];
  };
  return { ...fila, paciente: fila.pacientes, cita: fila.cita };
}

// Por si una cita ya tiene atención (reabrir en vez de duplicar) — usado
// por el botón "Atender"/"Ver atención" para decidir qué mostrar sin tener
// que intentar crear una primero.
export async function obtenerAtencionDeCita(citaId: string): Promise<string | null> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("atenciones")
    .select("id")
    .eq("cita_id", citaId)
    .eq("clinica_id", usuario.clinica_id)
    .maybeSingle();

  return data?.id ?? null;
}
