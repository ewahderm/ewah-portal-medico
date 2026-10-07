"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { esAdministrador } from "@/lib/auth/session";
import { campoOpcional } from "@/lib/forms/opcional";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso() {
  return requirePermisoBase("nomina", "CREATE");
}

export async function subirComprobantePlanilla(formData: FormData): Promise<ResultadoAccion> {
  const periodoAnio = Number(formData.get("periodoAnio"));
  const periodoMes = Number(formData.get("periodoMes"));
  if (!Number.isFinite(periodoAnio) || !Number.isFinite(periodoMes) || periodoMes < 1 || periodoMes > 12) {
    return { error: "Período inválido." };
  }

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Selecciona un archivo." };
  if (archivo.size > 10 * 1024 * 1024) return { error: "El archivo no puede pesar más de 10 MB." };

  const fechaPago = campoOpcional(formData, "fechaPago");

  const supabase = await createClient();
  const extension = archivo.name.split(".").pop() ?? "pdf";
  const path = `${check.usuario.clinica_id}/planilla/${periodoAnio}-${periodoMes}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("documentos-rrhh")
    .upload(path, archivo, { contentType: archivo.type });
  if (uploadError) return { error: "No se pudo subir el archivo." };

  const { error } = await supabase.from("comprobantes_planilla_clinica").upsert(
    {
      clinica_id: check.usuario.clinica_id,
      periodo_anio: periodoAnio,
      periodo_mes: periodoMes,
      storage_path: path,
      nombre_archivo: archivo.name,
      fecha_pago: fechaPago,
      created_by: check.usuario.id,
    },
    { onConflict: "clinica_id,periodo_anio,periodo_mes" },
  );
  if (error) return { error: "No se pudo guardar el comprobante." };

  revalidatePath("/rrhh/nomina");
  return {};
}

export async function eliminarComprobantePlanilla(id: string): Promise<ResultadoAccion> {
  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };
  if (!esAdministrador(check.usuario)) return { error: "Solo un administrador puede eliminar este comprobante." };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("comprobantes_planilla_clinica")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("comprobantes_planilla_clinica").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el comprobante." };

  if (doc?.storage_path) {
    await supabase.storage.from("documentos-rrhh").remove([doc.storage_path]);
  }

  revalidatePath("/rrhh/nomina");
  return {};
}

export async function listarComprobantesPlanilla() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes_planilla_clinica")
    .select("id, periodo_anio, periodo_mes, nombre_archivo, storage_path, fecha_pago")
    .order("periodo_anio", { ascending: false })
    .order("periodo_mes", { ascending: false });
  return data ?? [];
}
