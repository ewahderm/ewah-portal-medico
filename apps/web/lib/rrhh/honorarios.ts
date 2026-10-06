"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import { rangoPagina, esRangoFueraDeLimite } from "@/lib/pagination";
import { calcularRetencionHonorarios, requiereFacturaElectronica } from "./calculo";

function requirePermisoCrear() {
  return requirePermisoBase("nomina", "CREATE");
}
function requirePermisoAnular() {
  return requirePermisoBase("nomina", "VOID");
}

export async function generarComprobanteHonorarios(empleadoId: string, formData: FormData) {
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  const valorBruto = Number(formData.get("valorBruto"));
  if (!fechaInicio || !fechaFin) throw new Error("Las fechas del período son obligatorias.");
  if (fechaFin < fechaInicio) throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  if (!Number.isFinite(valorBruto) || valorBruto <= 0) throw new Error("El valor bruto debe ser mayor a cero.");

  const check = await requirePermisoCrear();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();

  const { data: empleado } = await supabase
    .from("empleados")
    .select("categoria_contrato, declarante_renta")
    .eq("id", empleadoId)
    .maybeSingle();
  if (empleado?.categoria_contrato !== "servicios") {
    throw new Error("Este empleado no tiene un contrato por servicios — genera un comprobante de nómina.");
  }
  const declaranteRenta = empleado.declarante_renta ?? false;

  const { tarifa, retencion } = calcularRetencionHonorarios(valorBruto, declaranteRenta);
  const netoPagar = Math.round((valorBruto - retencion) * 100) / 100;

  // Umbral de facturación electrónica (DIAN): se evalúa sobre el
  // acumulado del AÑO del empleado, no solo este pago — un contratista
  // puede cruzar el umbral a mitad de año.
  // Ver el comentario equivalente en lib/rrhh/nomina.ts — nunca pasar un
  // string "yyyy-MM-dd" por `new Date().getFullYear()`.
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

  let soporteStoragePath: string | null = null;
  const soporte = formData.get("soporteSeguridadSocial");
  if (soporte instanceof File && soporte.size > 0) {
    if (soporte.size > 10 * 1024 * 1024) throw new Error("El soporte no puede pesar más de 10 MB.");
    const extension = soporte.name.split(".").pop() ?? "pdf";
    const path = `${check.usuario.clinica_id}/empleados/${empleadoId}/honorarios-pila-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("documentos-rrhh")
      .upload(path, soporte, { contentType: soporte.type });
    if (uploadError) throw new Error("No se pudo subir el soporte.");
    soporteStoragePath = path;
  }

  const { error } = await supabase.from("comprobantes_honorarios").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    valor_bruto: valorBruto,
    declarante_renta: declaranteRenta,
    tarifa_retencion: tarifa,
    retencion_fuente: retencion,
    neto_pagar: netoPagar,
    requiere_factura_electronica: requiereFactura,
    soporte_seguridad_social_storage_path: soporteStoragePath,
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo generar el comprobante de honorarios.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function anularComprobanteHonorarios(id: string, empleadoId: string, formData: FormData) {
  const motivo = campoOpcional(formData, "motivo");
  if (!motivo) throw new Error("El motivo de anulación es obligatorio.");

  const check = await requirePermisoAnular();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("comprobantes_honorarios")
    .update({ anulado: true, anulado_motivo: motivo })
    .eq("id", id);
  if (error) throw new Error("No se pudo anular el comprobante.");

  revalidatePath(`/rrhh/${empleadoId}`);
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
