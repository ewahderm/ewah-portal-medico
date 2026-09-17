"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";

export type CitaActionState = { error?: string; warning?: string } | null;

async function requirePermiso(permiso: "CREATE" | "EDIT") {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tienePermiso } = await supabase.rpc("has_permission", {
    modulo_code: "citas",
    permiso_code: permiso,
  });

  if (!tienePermiso) {
    return { ok: false as const, error: "No tienes permiso para esta acción." };
  }
  return { ok: true as const, usuario };
}

function campoOpcional(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor || null;
}

async function detectarChoque(params: {
  clinicaId: string;
  profesionalId: string;
  consultorioId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("citas")
    .select("id, profesional_id, consultorio_id")
    .eq("clinica_id", params.clinicaId)
    .eq("fecha", params.fecha)
    .not("estado", "in", "(cancelada,no_asistio)")
    .lt("hora_inicio", params.horaFin)
    .gt("hora_fin", params.horaInicio);

  const choques = data ?? [];
  const conProfesional = choques.some((c) => c.profesional_id === params.profesionalId);
  const conConsultorio = choques.some((c) => c.consultorio_id === params.consultorioId);

  if (conProfesional && conConsultorio) {
    return "Ese profesional y ese consultorio ya tienen otra cita en ese horario.";
  }
  if (conProfesional) return "Ese profesional ya tiene otra cita en ese horario.";
  if (conConsultorio) return "Ese consultorio ya está ocupado en ese horario.";
  return null;
}

export async function crearCita(
  _prevState: CitaActionState,
  formData: FormData,
): Promise<CitaActionState> {
  const pacienteId = String(formData.get("pacienteId") ?? "");
  const profesionalId = String(formData.get("profesionalId") ?? "");
  const consultorioId = String(formData.get("consultorioId") ?? "");
  const tipoTratamientoId = String(formData.get("tipoTratamientoId") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const horaInicio = String(formData.get("horaInicio") ?? "").trim();
  const horaFin = String(formData.get("horaFin") ?? "").trim();

  if (
    !pacienteId ||
    !profesionalId ||
    !consultorioId ||
    !tipoTratamientoId ||
    !fecha ||
    !horaInicio ||
    !horaFin
  ) {
    return { error: "Todos los campos son obligatorios." };
  }
  if (horaFin <= horaInicio) {
    return { error: "La hora de fin debe ser posterior a la hora de inicio." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const warning = await detectarChoque({
    clinicaId: check.usuario.clinica_id,
    profesionalId,
    consultorioId,
    fecha,
    horaInicio,
    horaFin,
  });

  const supabase = await createClient();
  const { error } = await supabase.from("citas").insert({
    clinica_id: check.usuario.clinica_id,
    paciente_id: pacienteId,
    profesional_id: profesionalId,
    consultorio_id: consultorioId,
    tipo_tratamiento_id: tipoTratamientoId,
    fecha,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo agendar la cita." };

  revalidatePath("/citas");
  return warning ? { warning } : null;
}

export async function crearBloqueo(
  _prevState: CitaActionState,
  formData: FormData,
): Promise<CitaActionState> {
  const profesionalIds = formData.getAll("profesionalIds").map(String).filter(Boolean);
  const consultorioId = campoOpcional(formData, "consultorioId");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const todoElDia = formData.get("todoElDia") === "on";
  const motivo = campoOpcional(formData, "motivo");

  if (profesionalIds.length === 0) {
    return { error: "Selecciona al menos un profesional." };
  }
  if (!fecha) return { error: "La fecha es obligatoria." };

  let horaInicio = "00:00";
  let horaFin = "23:59";
  if (!todoElDia) {
    horaInicio = String(formData.get("horaInicio") ?? "").trim();
    horaFin = String(formData.get("horaFin") ?? "").trim();
    if (!horaInicio || !horaFin) {
      return { error: "Indica la hora de inicio y de fin, o marca \"Todo el día\"." };
    }
    if (horaFin <= horaInicio) {
      return { error: "La hora de fin debe ser posterior a la hora de inicio." };
    }
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("citas").insert(
    profesionalIds.map((profesionalId) => ({
      clinica_id: check.usuario.clinica_id,
      profesional_id: profesionalId,
      consultorio_id: consultorioId,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      todo_el_dia: todoElDia,
      es_bloqueo: true,
      motivo,
      created_by: check.usuario.id,
    })),
  );

  if (error) return { error: "No se pudo crear el bloqueo." };

  revalidatePath("/citas");
  return null;
}

async function cambiarEstado(id: string, estado: string, motivo?: string | null) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("citas")
    .update({ estado, motivo: motivo ?? undefined })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar la cita.");

  revalidatePath("/citas");
}

export async function confirmarCita(id: string) {
  await cambiarEstado(id, "confirmada");
}

export async function cancelarCita(id: string, motivo: string) {
  if (!motivo.trim()) throw new Error("El motivo de cancelación es obligatorio.");
  await cambiarEstado(id, "cancelada", motivo.trim());
}

export async function marcarNoAsistio(id: string) {
  await cambiarEstado(id, "no_asistio");
}
