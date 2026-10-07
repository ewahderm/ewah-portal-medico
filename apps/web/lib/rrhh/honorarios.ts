"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import { rangoPagina, esRangoFueraDeLimite } from "@/lib/pagination";
import { calcularRetencionHonorarios, requiereFacturaElectronica } from "./calculo";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermisoCrear() {
  return requirePermisoBase("nomina", "CREATE");
}
function requirePermisoEditar() {
  return requirePermisoBase("nomina", "EDIT");
}
function requirePermisoAnular() {
  return requirePermisoBase("nomina", "VOID");
}

export type DesgloseHonorarios = {
  valorBruto: number;
  declaranteRenta: boolean;
  tarifaRetencion: number;
  retencionFuente: number;
  netoPagar: number;
  requiereFacturaElectronica: boolean;
};

export async function calcularComprobanteHonorariosPreview(
  empleadoId: string,
  formData: FormData,
): Promise<DesgloseHonorarios | { error: string }> {
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const valorBruto = Number(formData.get("valorBruto"));
  if (!fechaInicio) return { error: "La fecha de inicio es obligatoria." };
  if (!Number.isFinite(valorBruto) || valorBruto <= 0) return { error: "El valor bruto debe ser mayor a cero." };

  const check = await requirePermisoCrear();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  const { data: empleado } = await supabase
    .from("empleados")
    .select("categoria_contrato, declarante_renta")
    .eq("id", empleadoId)
    .maybeSingle();
  if (empleado?.categoria_contrato !== "servicios") {
    return { error: "Este empleado no tiene un contrato por servicios — genera un comprobante de nómina." };
  }
  const declaranteRenta = empleado.declarante_renta ?? false;

  const { tarifa, retencion } = calcularRetencionHonorarios(valorBruto, declaranteRenta);
  const netoPagar = Math.round((valorBruto - retencion) * 100) / 100;

  const anio = Number(fechaInicio.slice(0, 4));
  const { data: clinica } = await supabase
    .from("clinicas")
    .select("pais_operacion_id")
    .eq("id", check.usuario.clinica_id)
    .single();
  const { data: valoresLegales } = await supabase
    .from("valores_legales_pais")
    .select("uvt")
    .eq("pais_id", clinica?.pais_operacion_id)
    .eq("anio", anio)
    .maybeSingle();
  const { data: acumulados } = await supabase
    .from("comprobantes_honorarios")
    .select("valor_bruto")
    .eq("empleado_id", empleadoId)
    .eq("anulado", false)
    .gte("fecha_inicio", `${anio}-01-01`)
    .lte("fecha_inicio", `${anio}-12-31`);
  const acumuladoAnual = (acumulados ?? []).reduce((acc, c) => acc + c.valor_bruto, 0) + valorBruto;
  const requiereFactura = valoresLegales?.uvt
    ? requiereFacturaElectronica(acumuladoAnual, valoresLegales.uvt)
    : false;

  return {
    valorBruto,
    declaranteRenta,
    tarifaRetencion: tarifa,
    retencionFuente: retencion,
    netoPagar,
    requiereFacturaElectronica: requiereFactura,
  };
}

function numeroFormulario(formData: FormData, campo: string): number {
  const valor = Number(formData.get(campo));
  return Number.isFinite(valor) ? valor : 0;
}

async function subirSoporteSiHay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicaId: string,
  empleadoId: string,
  formData: FormData,
): Promise<{ error: string } | { path: string | null }> {
  const soporte = formData.get("soporteSeguridadSocial");
  if (!(soporte instanceof File) || soporte.size === 0) return { path: null };
  if (soporte.size > 10 * 1024 * 1024) return { error: "El soporte no puede pesar más de 10 MB." };
  const extension = soporte.name.split(".").pop() ?? "pdf";
  const path = `${clinicaId}/empleados/${empleadoId}/honorarios-pila-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("documentos-rrhh").upload(path, soporte, { contentType: soporte.type });
  if (error) return { error: "No se pudo subir el soporte." };
  return { path };
}

export async function generarComprobanteHonorarios(empleadoId: string, formData: FormData): Promise<ResultadoAccion> {
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  if (!fechaInicio || !fechaFin) return { error: "Las fechas del período son obligatorias." };
  if (fechaFin < fechaInicio) return { error: "La fecha de fin no puede ser anterior a la de inicio." };

  const check = await requirePermisoCrear();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const soporte = await subirSoporteSiHay(supabase, check.usuario.clinica_id, empleadoId, formData);
  if ("error" in soporte) return { error: soporte.error };
  const soporteStoragePath = soporte.path;

  const { error } = await supabase.from("comprobantes_honorarios").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    valor_bruto: numeroFormulario(formData, "valorBruto"),
    declarante_renta: formData.get("declaranteRenta") === "on",
    tarifa_retencion: numeroFormulario(formData, "tarifaRetencion"),
    retencion_fuente: numeroFormulario(formData, "retencionFuente"),
    neto_pagar: numeroFormulario(formData, "netoPagar"),
    requiere_factura_electronica: formData.get("requiereFacturaElectronica") === "on",
    soporte_seguridad_social_storage_path: soporteStoragePath,
    created_by: check.usuario.id,
  });
  if (error) return { error: "No se pudo generar el comprobante de honorarios." };

  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function editarComprobanteHonorarios(id: string, empleadoId: string, formData: FormData): Promise<ResultadoAccion> {
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  if (!fechaInicio || !fechaFin) return { error: "Las fechas del período son obligatorias." };
  if (fechaFin < fechaInicio) return { error: "La fecha de fin no puede ser anterior a la de inicio." };

  const check = await requirePermisoEditar();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const soporte = await subirSoporteSiHay(supabase, check.usuario.clinica_id, empleadoId, formData);
  if ("error" in soporte) return { error: soporte.error };
  const nuevoSoporte = soporte.path;

  const updates: Record<string, unknown> = {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    valor_bruto: numeroFormulario(formData, "valorBruto"),
    declarante_renta: formData.get("declaranteRenta") === "on",
    tarifa_retencion: numeroFormulario(formData, "tarifaRetencion"),
    retencion_fuente: numeroFormulario(formData, "retencionFuente"),
    neto_pagar: numeroFormulario(formData, "netoPagar"),
    requiere_factura_electronica: formData.get("requiereFacturaElectronica") === "on",
  };
  if (nuevoSoporte) updates.soporte_seguridad_social_storage_path = nuevoSoporte;

  const { data, error } = await supabase
    .from("comprobantes_honorarios")
    .update(updates)
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo actualizar el comprobante." };
  if (!data || data.length === 0) {
    return { error: "Este comprobante ya fue aprobado y no se puede editar." };
  }

  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function aprobarComprobanteHonorarios(id: string, empleadoId: string): Promise<ResultadoAccion> {
  const check = await requirePermisoEditar();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_honorarios")
    .update({ aprobado: true, aprobado_en: new Date().toISOString(), aprobado_por: check.usuario.id })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo aprobar el comprobante." };
  if (!data || data.length === 0) return { error: "Este comprobante ya estaba aprobado." };

  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function eliminarComprobanteHonorarios(id: string, empleadoId: string): Promise<ResultadoAccion> {
  const check = await requirePermisoEditar();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("comprobantes_honorarios")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) return { error: "No se pudo eliminar el comprobante." };
  if (!count) return { error: "Este comprobante ya fue aprobado y no se puede eliminar — solo anular." };

  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function anularComprobanteHonorarios(id: string, empleadoId: string, formData: FormData): Promise<ResultadoAccion> {
  const motivo = campoOpcional(formData, "motivo");
  if (!motivo) return { error: "El motivo de anulación es obligatorio." };

  const check = await requirePermisoAnular();
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_honorarios")
    .update({ anulado: true, anulado_motivo: motivo })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo anular el comprobante." };
  if (!data || data.length === 0) {
    return { error: "Solo se puede anular un comprobante ya aprobado." };
  }

  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function listarComprobantesHonorarios(filtros: { empleadoId?: string; pagina?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("comprobantes_honorarios")
    .select("*, empleados(nombre)", { count: "exact" })
    .order("fecha_inicio", { ascending: false });

  if (filtros.empleadoId) query = query.eq("empleado_id", filtros.empleadoId);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarComprobantesHonorarios({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}

export async function obtenerComprobanteHonorarios(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes_honorarios")
    .select(
      "*, empleados(nombre, numero_identificacion, tipo_identificacion_id, tipos_identificacion(nombre))",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}
