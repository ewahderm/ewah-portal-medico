"use server";

// Cobro de la atención (0109): el paciente paga la atención, no cada
// tratamiento. Un cobro guarda el medio de pago y lo cobrado por cada
// tratamiento; el flujo de caja genera un solo ingreso por cobro. La BD
// valida todo de nuevo (fn_cobrar_atencion, fn_anular_cobro_atencion).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import type { ResultadoAccion } from "@/lib/forms/resultado";
import type { PrecioTratamiento } from "./precios";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidar() {
  revalidatePath("/tratamientos");
  revalidatePath("/(protected)/pacientes/[id]", "page");
  revalidatePath("/citas");
  revalidatePath("/finanzas", "layout");
}

export type CobroDeAtencion = {
  id: string;
  fecha: string;
  valor: number | null;
  notas: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  automatico: boolean;
  // Factura electrónica del cobro (0110): se registra después de cobrar.
  factura_numero: string | null;
  factura_cufe: string | null;
  factura_pdf_path: string | null;
  factura_xml_path: string | null;
  medios_pago: { nombre: string } | null;
  cobros_atencion_items: { tratamiento_id: string; valor: number | null }[];
};

export async function listarCobrosDeAtencion(atencionId: string): Promise<CobroDeAtencion[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario || !UUID.test(atencionId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("cobros_atencion")
    .select(
      "id, fecha, valor, notas, anulado, anulado_motivo, automatico, factura_numero, factura_cufe, factura_pdf_path, factura_xml_path, medios_pago(nombre), cobros_atencion_items(tratamiento_id, valor)",
    )
    .eq("atencion_id", atencionId)
    .eq("clinica_id", usuario.clinica_id)
    .order("created_at");
  return (data ?? []) as unknown as CobroDeAtencion[];
}

export async function cobrarAtencion(input: {
  atencionId: string;
  fecha: string;
  medioPagoId: string;
  items: { tratamientoId: string; valor: number }[];
  notas?: string;
}): Promise<ResultadoAccion> {
  if (!UUID.test(input.atencionId) || !UUID.test(input.medioPagoId)) return { error: "Elige el medio de pago." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { error: "Elige la fecha del cobro." };
  if (input.items.length === 0) return { error: "No hay tratamientos para cobrar." };
  if (input.items.some((i) => !UUID.test(i.tratamientoId) || !Number.isFinite(i.valor) || i.valor < 0)) {
    return { error: "Cada tratamiento necesita un valor cobrado (0 o más)." };
  }
  const check = await requirePermiso("tratamientos", "CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cobrar_atencion", {
    p_atencion: input.atencionId,
    p_fecha: input.fecha,
    p_medio: input.medioPagoId,
    p_items: input.items.map((i) => ({ tratamiento_id: i.tratamientoId, valor: Math.round(i.valor) })),
    p_notas: input.notas?.trim() || null,
  });
  if (error) {
    console.error("cobrarAtencion", error);
    // Los rechazos de la BD están escritos para la persona.
    return { error: error.code === "P0001" ? error.message : "No se pudo registrar el cobro." };
  }
  revalidar();
  return {};
}

export async function anularCobroAtencion(cobroId: string, motivo: string): Promise<ResultadoAccion> {
  if (!UUID.test(cobroId)) return { error: "Cobro inválido." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se anula el cobro (al menos 10 caracteres)." };
  const check = await requirePermiso("tratamientos", "VOID");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_cobro_atencion", { p_cobro: cobroId, p_motivo: motivo.trim() });
  if (error) {
    console.error("anularCobroAtencion", error);
    return { error: error.code === "P0001" ? error.message : "No se pudo anular el cobro." };
  }
  revalidar();
  return {};
}

// Todo el historial de precios de la clínica (son pocas filas): el
// formulario calcula en el navegador el vigente para la fecha elegida.
export async function obtenerPreciosTratamiento(): Promise<PrecioTratamiento[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("precios_tratamiento")
    .select("tipo_tratamiento_id, valor, vigente_desde, created_at")
    .eq("clinica_id", usuario.clinica_id);
  return (data ?? []).map((p) => ({ ...p, valor: Number(p.valor) }));
}

// ---------- Factura electrónica del cobro (0110) ----------

const MAX_FACTURA_BYTES = 10 * 1024 * 1024;

export async function guardarFacturaCobro(input: { cobroId: string; numero: string; cufe: string }): Promise<ResultadoAccion> {
  if (!UUID.test(input.cobroId)) return { error: "Cobro inválido." };
  const check = await requirePermiso("tratamientos", "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cobro_factura", {
    p_cobro: input.cobroId,
    p_numero: input.numero.trim() || null,
    p_cufe: input.cufe.trim() || null,
  });
  if (error) {
    console.error("guardarFacturaCobro", error);
    return { error: error.code === "P0001" ? error.message : "No se pudo guardar la factura." };
  }
  revalidar();
  return {};
}

// Sube el PDF o el XML de la factura al bucket privado y lo enlaza al cobro.
// Un archivo anterior no se borra (la auditoría guarda su ruta).
export async function subirArchivoFactura(cobroId: string, tipo: "pdf" | "xml", formData: FormData): Promise<ResultadoAccion> {
  if (!UUID.test(cobroId) || (tipo !== "pdf" && tipo !== "xml")) return { error: "Datos inválidos." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Selecciona el archivo." };
  if (archivo.size > MAX_FACTURA_BYTES) return { error: "El archivo no puede pesar más de 10 MB." };
  const extension = archivo.name.split(".").pop()?.toLowerCase();
  if (extension !== tipo) return { error: tipo === "pdf" ? "Sube un archivo PDF." : "Sube el archivo XML de la factura." };
  const check = await requirePermiso("tratamientos", "CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const path = `${check.usuario.clinica_id}/${cobroId}/factura-${Date.now()}.${tipo}`;
  const { error: errorSubida } = await supabase.storage
    .from("cobro-facturas")
    .upload(path, archivo, { contentType: tipo === "pdf" ? "application/pdf" : "application/xml" });
  if (errorSubida) {
    console.error("subirArchivoFactura", errorSubida);
    return { error: "No se pudo subir el archivo." };
  }
  const { error } = await supabase.rpc("fn_cobro_factura_archivo", { p_cobro: cobroId, p_tipo: tipo, p_path: path });
  if (error) {
    console.error("subirArchivoFactura", error);
    return { error: error.code === "P0001" ? error.message : "No se pudo enlazar el archivo." };
  }
  revalidar();
  return {};
}

export async function quitarArchivoFactura(cobroId: string, tipo: "pdf" | "xml"): Promise<ResultadoAccion> {
  if (!UUID.test(cobroId) || (tipo !== "pdf" && tipo !== "xml")) return { error: "Datos inválidos." };
  const check = await requirePermiso("tratamientos", "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cobro_factura_archivo", { p_cobro: cobroId, p_tipo: tipo, p_path: null });
  if (error) return { error: error.code === "P0001" ? error.message : "No se pudo quitar el archivo." };
  revalidar();
  return {};
}

