"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { valorOpcionalSelect, campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("campanas", permiso);
}

function datosCampanaDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    canal_captacion_id: valorOpcionalSelect(formData, "canalCaptacionId"),
    fecha_inicio: campoOpcional(formData, "fechaInicio"),
    fecha_fin: campoOpcional(formData, "fechaFin"),
    presupuesto: campoOpcional(formData, "presupuesto"),
    objetivo: campoOpcional(formData, "objetivo"),
  };
}

function validarRangoFechas(fechaInicio: string | null, fechaFin: string | null): string | null {
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    return "La fecha de fin debe ser posterior a la fecha de inicio.";
  }
  return null;
}

export async function crearCampana(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosCampanaDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const presupuesto = datos.presupuesto ? Number(datos.presupuesto) : null;
  if (datos.presupuesto && (Number.isNaN(presupuesto) || (presupuesto ?? 0) < 0)) {
    return { error: "El presupuesto debe ser un número válido." };
  }

  const errorFechas = validarRangoFechas(datos.fecha_inicio, datos.fecha_fin);
  if (errorFechas) return { error: errorFechas };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("campanas");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();
  const { error } = await supabase.from("campanas").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    canal_captacion_id: datos.canal_captacion_id,
    fecha_inicio: datos.fecha_inicio,
    fecha_fin: datos.fecha_fin,
    presupuesto,
    objetivo: datos.objetivo,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo crear la campaña." };

  revalidatePath("/campanas");
  return null;
}

export async function actualizarCampana(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Campaña inválida." };

  const datos = datosCampanaDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const presupuesto = datos.presupuesto ? Number(datos.presupuesto) : null;
  if (datos.presupuesto && (Number.isNaN(presupuesto) || (presupuesto ?? 0) < 0)) {
    return { error: "El presupuesto debe ser un número válido." };
  }

  const errorFechas = validarRangoFechas(datos.fecha_inicio, datos.fecha_fin);
  if (errorFechas) return { error: errorFechas };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("campanas");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campanas")
    .update({
      nombre: datos.nombre,
      canal_captacion_id: datos.canal_captacion_id,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      presupuesto,
      objetivo: datos.objetivo,
    })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar la campaña." };

  revalidatePath("/campanas");
  return null;
}

export async function toggleActivoCampana(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const checkPlan = await requireEntitlement("campanas");
  if (!checkPlan.ok) throw new Error(checkPlan.error);

  const supabase = await createClient();
  const { error } = await supabase.from("campanas").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar la campaña.");

  revalidatePath("/campanas");
}

export type FunnelCampana = {
  leads: number;
  contactados: number;
  agendaronCita: number;
  convertidos: number;
  ingresos: number;
};

export async function listarFunnelCampana(campanaId: string): Promise<FunnelCampana> {
  const supabase = await createClient();

  const { data: pacientesData } = await supabase
    .from("pacientes")
    .select("id")
    .eq("campana_id", campanaId);

  const pacienteIds = (pacientesData ?? []).map((p) => p.id);
  if (pacienteIds.length === 0) {
    return { leads: 0, contactados: 0, agendaronCita: 0, convertidos: 0, ingresos: 0 };
  }

  const [{ data: contactosData }, { data: citasData }, { data: tratamientosData }] =
    await Promise.all([
      supabase.from("contactos_paciente").select("paciente_id").in("paciente_id", pacienteIds),
      supabase.from("citas").select("paciente_id").in("paciente_id", pacienteIds),
      supabase
        .from("tratamientos")
        .select("paciente_id, costo")
        .in("paciente_id", pacienteIds)
        .eq("anulado", false),
    ]);

  const contactados = new Set((contactosData ?? []).map((c) => c.paciente_id)).size;
  const agendaronCita = new Set((citasData ?? []).map((c) => c.paciente_id)).size;
  const convertidos = new Set((tratamientosData ?? []).map((t) => t.paciente_id)).size;
  const ingresos = (tratamientosData ?? []).reduce((acc, t) => acc + (t.costo ?? 0), 0);

  return { leads: pacienteIds.length, contactados, agendaronCita, convertidos, ingresos };
}
