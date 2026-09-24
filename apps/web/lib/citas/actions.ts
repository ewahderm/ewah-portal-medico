"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { valorOpcionalSelect, campoOpcional } from "@/lib/forms/opcional";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { enviarCorreoCita, type TipoCorreoCita } from "@/lib/email/citaCorreo";

export type CitaActionState =
  | { error: string; conflicto?: undefined; ok?: undefined }
  | { conflicto: string; error?: undefined; ok?: undefined }
  | { ok: true; error?: undefined; conflicto?: undefined }
  | null;

export type ReprogramarResultado = { conflicto: string } | { ok: true };

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("citas", permiso);
}

async function detectarChoque(params: {
  clinicaId: string;
  profesionalId: string;
  consultorioId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  excluirCitaId?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("citas")
    .select("id, profesional_id, consultorio_id")
    .eq("clinica_id", params.clinicaId)
    .eq("fecha", params.fecha)
    .not("estado", "in", "(cancelada,no_asistio)")
    .lt("hora_inicio", params.horaFin)
    .gt("hora_fin", params.horaInicio);

  if (params.excluirCitaId) query = query.neq("id", params.excluirCitaId);

  const { data } = await query;
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

type FilaCorreoCita = {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  updated_at: string;
  pacientes: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
    email: string | null;
  } | null;
  tipos_tratamiento: { nombre: string } | null;
  profesional: { nombre: string } | null;
  consultorios: { nombre: string; sedes: { nombre: string; direccion: string | null } | null } | null;
};

const SELECT_CORREO_CITA = `fecha, hora_inicio, hora_fin, updated_at,
   pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, email),
   tipos_tratamiento(nombre),
   profesional:usuarios!citas_profesional_id_fkey(nombre),
   consultorios(nombre, sedes(nombre, direccion))`;

// Se usa siempre a partir del id de una cita YA guardada (insert o update
// exitosos), en una consulta aparte de la que crea/actualiza la cita: así,
// si traer los datos del correo falla por lo que sea, la acción de la cita
// ya se completó y solo se pierde el aviso por correo (queda logueado),
// nunca la cita misma.
async function enviarCorreoCitaPorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  citaId: string,
  tipo: TipoCorreoCita,
  motivo?: string | null,
) {
  try {
    const { data } = await supabase
      .from("citas")
      .select(SELECT_CORREO_CITA)
      .eq("id", citaId)
      .maybeSingle();

    if (!data) return;

    const fila = data as unknown as FilaCorreoCita;
    if (!fila.pacientes) return;

    const sede = fila.consultorios?.sedes;
    const ubicacion = fila.consultorios
      ? [fila.consultorios.nombre, sede?.nombre, sede?.direccion].filter(Boolean).join(", ")
      : null;

    await enviarCorreoCita({
      email: fila.pacientes.email,
      nombrePaciente: nombreCompleto(fila.pacientes),
      tipo,
      fecha: fila.fecha,
      horaInicio: fila.hora_inicio,
      horaFin: fila.hora_fin,
      nombreProfesional: fila.profesional?.nombre ?? "el equipo de EWAH",
      nombreTratamiento: fila.tipos_tratamiento?.nombre ?? "tu tratamiento",
      motivo,
      citaId,
      actualizadoEn: fila.updated_at,
      ubicacion,
    });
  } catch (error) {
    console.error("[citas] No se pudo enviar el correo de la cita:", error);
  }
}

// `forzar` llega como primer argumento vía crearCita.bind(null, forzar) —
// el diálogo lo actualiza a true solo después de que el usuario confirma
// explícitamente el choque de horario que se le mostró. Sin eso, un
// choque bloquea el guardado por completo (antes solo advertía y guardaba
// igual, lo que permitía doble-agendar sin darse cuenta).
export async function crearCita(
  forzar: boolean,
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

  const conflicto = await detectarChoque({
    clinicaId: check.usuario.clinica_id,
    profesionalId,
    consultorioId,
    fecha,
    horaInicio,
    horaFin,
  });
  if (conflicto && !forzar) return { conflicto };

  const supabase = await createClient();
  const { data: citaCreada, error } = await supabase
    .from("citas")
    .insert({
      clinica_id: check.usuario.clinica_id,
      paciente_id: pacienteId,
      profesional_id: profesionalId,
      consultorio_id: consultorioId,
      tipo_tratamiento_id: tipoTratamientoId,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo agendar la cita." };

  revalidatePath("/citas");

  if (citaCreada) {
    await enviarCorreoCitaPorId(supabase, citaCreada.id, "agendada");
  }

  return { ok: true };
}

export async function crearBloqueo(
  _prevState: CitaActionState,
  formData: FormData,
): Promise<CitaActionState> {
  const profesionalIds = formData.getAll("profesionalIds").map(String).filter(Boolean);
  const consultorioId = valorOpcionalSelect(formData, "consultorioId");
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

async function cambiarEstado(
  id: string,
  estado: string,
  opciones: { motivo?: string | null; tipoCorreo?: TipoCorreoCita } = {},
) {
  const { motivo, tipoCorreo } = opciones;
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("citas")
    .update({ estado, motivo: motivo ?? undefined })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar la cita.");

  revalidatePath("/citas");

  if (tipoCorreo) {
    await enviarCorreoCitaPorId(supabase, id, tipoCorreo, motivo);
  }
}

export async function confirmarCita(id: string) {
  await cambiarEstado(id, "confirmada", { tipoCorreo: "actualizada" });
}

export async function cancelarCita(id: string, motivo: string) {
  if (!motivo.trim()) throw new Error("El motivo de cancelación es obligatorio.");
  await cambiarEstado(id, "cancelada", { motivo: motivo.trim(), tipoCorreo: "cancelada" });
}

// No se envía correo al marcar "no asistió": es un registro interno de que
// el paciente no llegó, no un cambio sobre la cita que el paciente necesite
// que le confirmen (la cita ya pasó).
export async function marcarNoAsistio(id: string) {
  await cambiarEstado(id, "no_asistio");
}

// Reprogramar no es solo cambiar la fecha de la cita existente: la
// original queda como "reprogramada" (libera su horario para el
// detector de choques) y se crea una cita nueva con la fecha/hora
// elegida, para que quede registro de que se movió en vez de perder
// el dato de cuándo estaba agendada antes.
export async function reprogramarCita(
  id: string,
  datos: { fecha: string; horaInicio: string; horaFin: string },
  forzar = false,
): Promise<ReprogramarResultado> {
  if (!datos.fecha || !datos.horaInicio || !datos.horaFin) {
    throw new Error("Fecha, hora de inicio y hora de fin son obligatorias.");
  }
  if (datos.horaFin <= datos.horaInicio) {
    throw new Error("La hora de fin debe ser posterior a la hora de inicio.");
  }

  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { data: original } = await supabase
    .from("citas")
    .select("clinica_id, paciente_id, profesional_id, consultorio_id, tipo_tratamiento_id")
    .eq("id", id)
    .maybeSingle();

  if (!original) throw new Error("La cita no existe.");

  const conflicto = await detectarChoque({
    clinicaId: original.clinica_id,
    profesionalId: original.profesional_id,
    consultorioId: original.consultorio_id,
    fecha: datos.fecha,
    horaInicio: datos.horaInicio,
    horaFin: datos.horaFin,
    excluirCitaId: id,
  });
  if (conflicto && !forzar) return { conflicto };

  const { data: nuevaCita, error: nuevaError } = await supabase
    .from("citas")
    .insert({
      clinica_id: original.clinica_id,
      paciente_id: original.paciente_id,
      profesional_id: original.profesional_id,
      consultorio_id: original.consultorio_id,
      tipo_tratamiento_id: original.tipo_tratamiento_id,
      fecha: datos.fecha,
      hora_inicio: datos.horaInicio,
      hora_fin: datos.horaFin,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();
  if (nuevaError) throw new Error("No se pudo crear la nueva cita.");

  const { error: anteriorError } = await supabase
    .from("citas")
    .update({ estado: "reprogramada" })
    .eq("id", id);
  if (anteriorError) throw new Error("La cita nueva ya se creó, pero no se pudo marcar la original como reprogramada.");

  revalidatePath("/citas");

  // Un solo correo con la fecha/hora NUEVA — la cita original ya no es
  // relevante para el paciente, solo un detalle interno del sistema.
  if (nuevaCita) {
    await enviarCorreoCitaPorId(supabase, nuevaCita.id, "actualizada");
  }

  return { ok: true };
}
