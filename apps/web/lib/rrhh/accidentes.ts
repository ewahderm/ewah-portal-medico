"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import { rangoPagina, esRangoFueraDeLimite } from "@/lib/pagination";
import type { ActionState } from "@/lib/auth/actions";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermisoCrear() {
  return requirePermisoBase("rrhh", "CREATE");
}
function requirePermisoEditar() {
  return requirePermisoBase("rrhh", "EDIT");
}

export async function crearAccidenteTrabajo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const empleadoId = String(formData.get("empleadoId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const resumen = String(formData.get("resumen") ?? "").trim();
  if (!empleadoId) return { error: "Selecciona el empleado." };
  if (!fecha) return { error: "La fecha es obligatoria." };
  if (!resumen) return { error: "El resumen de lo sucedido es obligatorio." };

  const check = await requirePermisoCrear();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("accidentes_trabajo").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    fecha,
    resumen,
    causa: campoOpcional(formData, "causa"),
    created_by: check.usuario.id,
  });
  if (error) return { error: "No se pudo registrar el accidente." };

  revalidatePath("/rrhh/accidentes");
  return null;
}

export async function actualizarAccidenteTrabajo(id: string, formData: FormData): Promise<ResultadoAccion> {
  const check = await requirePermisoEditar();
  if (!check.ok) return { error: check.error };

  const reportadoCentroTrabajo = formData.get("reportadoCentroTrabajo") === "on";
  const reportadoArl = formData.get("reportadoArl") === "on";
  const enInvestigacion = formData.get("enInvestigacion") === "on";
  const planAccionCorrectivo = formData.get("planAccionCorrectivo") === "on";
  const cerrado = formData.get("cerrado") === "on";
  const generaIncapacidad = formData.get("generaIncapacidad") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("accidentes_trabajo")
    .update({
      causa: campoOpcional(formData, "causa"),
      acciones_correctivas: campoOpcional(formData, "accionesCorrectivas"),
      reportado_centro_trabajo: reportadoCentroTrabajo,
      fecha_reporte_centro_trabajo: reportadoCentroTrabajo ? campoOpcional(formData, "fechaReporteCentroTrabajo") : null,
      reportado_arl: reportadoArl,
      fecha_reporte_arl: reportadoArl ? campoOpcional(formData, "fechaReporteArl") : null,
      en_investigacion: enInvestigacion,
      plan_accion_correctivo: planAccionCorrectivo,
      cerrado,
      genera_incapacidad: generaIncapacidad,
      fecha_cierre: cerrado ? campoOpcional(formData, "fechaCierre") : null,
      resumen_cierre: cerrado ? campoOpcional(formData, "resumenCierre") : null,
    })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el accidente." };

  revalidatePath("/rrhh/accidentes");
  return {};
}

export async function listarAccidentesTrabajo(filtros: { empleadoId?: string; pagina?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("accidentes_trabajo")
    .select(
      "id, fecha, resumen, causa, acciones_correctivas, reportado_centro_trabajo, fecha_reporte_centro_trabajo, reportado_arl, fecha_reporte_arl, en_investigacion, plan_accion_correctivo, cerrado, genera_incapacidad, fecha_cierre, resumen_cierre, empleados(id, nombre)",
      { count: "exact" },
    )
    .order("fecha", { ascending: false });

  if (filtros.empleadoId) query = query.eq("empleado_id", filtros.empleadoId);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarAccidentesTrabajo({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}
