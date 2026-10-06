"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { formatoMoneda } from "@/lib/format";
import { MINIMO_SMLV_SALARIO_INTEGRAL } from "./calculo";

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
  const tipoSalario = formData.get("tipoSalario") === "integral" ? "integral" : "ordinario";
  if (!Number.isFinite(salario) || salario <= 0) throw new Error("El salario debe ser mayor a cero.");
  if (!fechaInicio) throw new Error("La fecha de inicio es obligatoria.");

  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();

  // Salario integral (CST art. 132): mínimo 10 SMLMV + 30% prestacional =
  // 13 SMLMV del año en que empieza a regir. Solo se valida si hay valor
  // legal cargado para ese año/país; si no, no se bloquea el registro.
  if (tipoSalario === "integral") {
    const { data: clinica } = await supabase
      .from("clinicas")
      .select("pais_operacion_id")
      .eq("id", check.usuario.clinica_id)
      .single();
    const { data: valores } = await supabase
      .from("valores_legales_pais")
      .select("smlv")
      .eq("pais_id", clinica?.pais_operacion_id ?? "")
      .eq("anio", Number(fechaInicio.slice(0, 4)))
      .maybeSingle();
    if (valores?.smlv && salario < valores.smlv * MINIMO_SMLV_SALARIO_INTEGRAL) {
      throw new Error(
        `El salario integral debe ser de al menos ${MINIMO_SMLV_SALARIO_INTEGRAL} salarios mínimos ` +
          `(${formatoMoneda(valores.smlv * MINIMO_SMLV_SALARIO_INTEGRAL)} en ${fechaInicio.slice(0, 4)}).`,
      );
    }
  }

  const actaStoragePath = await subirActaOpcional(supabase, check.usuario.clinica_id, empleadoId, formData);

  const { error } = await supabase.from("historial_salarios_empleado").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    salario,
    tipo_salario: tipoSalario,
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
      .select("id, fecha_inicio, salario, tipo_salario, acta_storage_path")
      .eq("empleado_id", empleadoId)
      .order("fecha_inicio", { ascending: false }),
  ]);
  return { cargos: cargos.data ?? [], salarios: salarios.data ?? [] };
}
