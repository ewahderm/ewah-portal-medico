"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { esAdministrador } from "@/lib/auth/session";
import { campoOpcional } from "@/lib/forms/opcional";

function requirePermiso() {
  return requirePermisoBase("rrhh", "CREATE");
}

export async function crearIncapacidad(empleadoId: string, formData: FormData) {
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const dias = Number(formData.get("dias"));
  const origen = String(formData.get("origen") ?? "");
  if (!fechaInicio) throw new Error("La fecha de inicio es obligatoria.");
  if (!Number.isFinite(dias) || dias <= 0) throw new Error("Los días deben ser mayores a cero.");
  if (!["enfermedad_general", "laboral"].includes(origen)) throw new Error("Origen inválido.");

  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);

  const gestionadaEps = formData.get("gestionadaEps") === "on";
  const epsPago = formData.get("epsPago") === "on";
  const fechaPago = campoOpcional(formData, "fechaPago");
  const accidenteTrabajoId =
    origen === "laboral" ? campoOpcional(formData, "accidenteTrabajoId") : null;

  const supabase = await createClient();

  let soporteStoragePath: string | null = null;
  const soporte = formData.get("soporte");
  if (soporte instanceof File && soporte.size > 0) {
    if (soporte.size > 10 * 1024 * 1024) throw new Error("El soporte no puede pesar más de 10 MB.");
    const extension = soporte.name.split(".").pop() ?? "pdf";
    const path = `${check.usuario.clinica_id}/empleados/${empleadoId}/incapacidad-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("documentos-rrhh")
      .upload(path, soporte, { contentType: soporte.type });
    if (uploadError) throw new Error("No se pudo subir el soporte.");
    soporteStoragePath = path;
  }

  const { error } = await supabase.from("incapacidades_empleado").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    fecha_inicio: fechaInicio,
    dias,
    origen,
    accidente_trabajo_id: accidenteTrabajoId,
    gestionada_eps: gestionadaEps,
    eps_pago: epsPago,
    fecha_pago: fechaPago,
    soporte_storage_path: soporteStoragePath,
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo registrar la incapacidad.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function eliminarIncapacidad(id: string, empleadoId: string) {
  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);
  if (!esAdministrador(check.usuario)) throw new Error("Solo un administrador puede eliminar este registro.");

  const supabase = await createClient();
  const { error } = await supabase.from("incapacidades_empleado").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la incapacidad.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function listarIncapacidadesEmpleado(empleadoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("incapacidades_empleado")
    .select(
      "id, fecha_inicio, dias, origen, gestionada_eps, eps_pago, fecha_pago, soporte_storage_path, accidente_trabajo_id",
    )
    .eq("empleado_id", empleadoId)
    .order("fecha_inicio", { ascending: false });
  return data ?? [];
}
