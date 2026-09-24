"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { valorOpcionalSelect, campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosInsumoDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    codigo: campoOpcional(formData, "codigo"),
    unidadMedida: String(formData.get("unidadMedida") ?? "").trim() || "unidad",
    proveedorId: valorOpcionalSelect(formData, "proveedorId"),
    registroSanitario: campoOpcional(formData, "registroSanitario"),
    unidadMedidaRegistroSanitario: campoOpcional(formData, "unidadMedidaRegistroSanitario"),
    fechaVencimientoRegistroSanitario: campoOpcional(formData, "fechaVencimientoRegistroSanitario"),
    referenciaReportada: campoOpcional(formData, "referenciaReportada"),
    presentacionComercialReportada: campoOpcional(formData, "presentacionComercialReportada"),
    // El checkbox solo manda el campo cuando está marcado — su ausencia es "false".
    reporteRegulatorio: formData.get("reporteRegulatorio") === "on",
  };
}

export async function crearInsumo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosInsumoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("insumos").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    codigo: datos.codigo,
    unidad_medida: datos.unidadMedida,
    proveedor_id: datos.proveedorId,
    registro_sanitario: datos.registroSanitario,
    unidad_medida_registro_sanitario: datos.unidadMedidaRegistroSanitario,
    fecha_vencimiento_registro_sanitario: datos.fechaVencimientoRegistroSanitario,
    referencia_reportada: datos.referenciaReportada,
    presentacion_comercial_reportada: datos.presentacionComercialReportada,
    reporte_regulatorio: datos.reporteRegulatorio,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un insumo con ese código." };
    return { error: "No se pudo crear el insumo." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function editarInsumo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Insumo inválido." };

  const datos = datosInsumoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update({
      nombre: datos.nombre,
      codigo: datos.codigo,
      unidad_medida: datos.unidadMedida,
      proveedor_id: datos.proveedorId,
      registro_sanitario: datos.registroSanitario,
      unidad_medida_registro_sanitario: datos.unidadMedidaRegistroSanitario,
      fecha_vencimiento_registro_sanitario: datos.fechaVencimientoRegistroSanitario,
      referencia_reportada: datos.referenciaReportada,
      presentacion_comercial_reportada: datos.presentacionComercialReportada,
      reporte_regulatorio: datos.reporteRegulatorio,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un insumo con ese código." };
    return { error: "No se pudo actualizar el insumo." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleInsumo(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("insumos").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el insumo.");

  revalidatePath("/parametros");
}
