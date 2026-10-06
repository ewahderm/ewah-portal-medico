"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";

function requirePermiso() {
  return requirePermisoBase("rrhh", "CREATE");
}

async function subirActaOpcional(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicaId: string,
  empleadoId: string,
  formData: FormData,
): Promise<string | null> {
  const acta = formData.get("acta");
  if (!(acta instanceof File) || acta.size === 0) return null;
  if (acta.size > 10 * 1024 * 1024) throw new Error("El acta no puede pesar más de 10 MB.");

  const extension = acta.name.split(".").pop() ?? "pdf";
  const path = `${clinicaId}/empleados/${empleadoId}/acta-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("documentos-rrhh")
    .upload(path, acta, { contentType: acta.type });
  if (error) throw new Error("No se pudo subir el acta.");
  return path;
}

export async function registrarCambioCargo(empleadoId: string, formData: FormData) {
  const cargoId = String(formData.get("cargoId") ?? "");
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  if (!cargoId) throw new Error("Selecciona el cargo.");
  if (!fechaInicio) throw new Error("La fecha de inicio es obligatoria.");

  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const actaStoragePath = await subirActaOpcional(supabase, check.usuario.clinica_id, empleadoId, formData);

  const { error } = await supabase.from("historial_cargos_empleado").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    cargo_id: cargoId,
    fecha_inicio: fechaInicio,
    acta_storage_path: actaStoragePath,
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo registrar el cambio de cargo.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function registrarCambioSalario(empleadoId: string, formData: FormData) {
  const salario = Number(formData.get("salario"));
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  if (!Number.isFinite(salario) || salario <= 0) throw new Error("El salario debe ser mayor a cero.");
  if (!fechaInicio) throw new Error("La fecha de inicio es obligatoria.");

  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const actaStoragePath = await subirActaOpcional(supabase, check.usuario.clinica_id, empleadoId, formData);

  const { error } = await supabase.from("historial_salarios_empleado").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    salario,
    fecha_inicio: fechaInicio,
    acta_storage_path: actaStoragePath,
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo registrar el cambio de salario.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function listarHistorialEmpleado(empleadoId: string) {
  const supabase = await createClient();
  const [cargos, salarios] = await Promise.all([
    supabase
      .from("historial_cargos_empleado")
      .select("id, fecha_inicio, acta_storage_path, cargos(nombre)")
      .eq("empleado_id", empleadoId)
      .order("fecha_inicio", { ascending: false }),
    supabase
      .from("historial_salarios_empleado")
      .select("id, fecha_inicio, salario, acta_storage_path")
      .eq("empleado_id", empleadoId)
      .order("fecha_inicio", { ascending: false }),
  ]);
  return { cargos: cargos.data ?? [], salarios: salarios.data ?? [] };
}
