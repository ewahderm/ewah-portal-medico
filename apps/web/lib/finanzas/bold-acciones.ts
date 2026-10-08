"use server";

// Tarifas de los medios de pago y liquidación de la pasarela (FC4). La BD
// (0095) calcula el desglose, valida y genera los movimientos.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { esUuid, firmar, hoyBogota, mensajeError, verificarArchivoSubido } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS } from "@/lib/finanzas/constantes";
import { validarTarifa, type DatosTarifa } from "@/lib/finanzas/tarifas";

type Resultado = { error?: string };

const revalidar = () => revalidatePath("/finanzas", "layout");

export async function guardarTarifa(input: { id: string | null; medioPagoId: string; datos: DatosTarifa }): Promise<Resultado> {
  if (!esUuid(input.medioPagoId) || (input.id && !esUuid(input.id))) return { error: "Datos inválidos." };
  const error = validarTarifa(input.datos);
  if (error) return { error };
  const check = await requirePermiso(MODULO_FINANZAS, "EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const d = input.datos;
  const fila = {
    vigente_desde: d.vigente_desde,
    porcentaje_comision: d.porcentaje_comision,
    comision_incluye_iva: d.comision_incluye_iva,
    valor_fijo_comision: d.valor_fijo_comision,
    porcentaje_retefuente: d.porcentaje_retefuente,
    porcentaje_reteica: d.porcentaje_reteica,
    porcentaje_reteiva: d.porcentaje_reteiva,
    recargo_internacional: d.recargo_internacional,
    dias_habiles_abono: d.dias_habiles_abono,
  };
  if (input.id) {
    const { data, error: e } = await supabase.from("fin_tarifas_medio_pago").update(fila).eq("id", input.id).select("id");
    if (e) return { error: e.code === "23505" ? "Ya hay una tarifa con esa fecha de vigencia." : mensajeError("guardarTarifa", e, "No se pudo guardar la tarifa.") };
    if (!data?.length) return { error: "No tienes permiso para editar tarifas." };
  } else {
    const { error: e } = await supabase.from("fin_tarifas_medio_pago").insert({ ...fila, clinica_id: check.usuario.clinica_id, medio_pago_id: input.medioPagoId });
    if (e) return { error: e.code === "23505" ? "Ya hay una tarifa con esa fecha de vigencia." : mensajeError("guardarTarifa", e, "No se pudo guardar la tarifa.") };
  }
  revalidar();
  return {};
}

export async function eliminarTarifa(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Tarifa inválida." };
  const check = await requirePermiso(MODULO_FINANZAS, "EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_tarifas_medio_pago").delete().eq("id", id).select("id");
  if (error) return { error: mensajeError("eliminarTarifa", error, "No se pudo eliminar la tarifa.") };
  if (!data?.length) return { error: "No tienes permiso para eliminar tarifas." };
  revalidar();
  return {};
}

export async function liquidarPasarela(input: {
  id: string;
  movimientos: string[];
  cuentaId: string | null;
  fecha: string;
  netoReal: number | null;
  soportePath: string | null;
  soporteNombre: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id) || !input.movimientos.length || input.movimientos.some((m) => !esUuid(m)) || (input.cuentaId && !esUuid(input.cuentaId))) {
    return { error: "Datos inválidos." };
  }
  if (!input.cuentaId) return { error: "Elige a qué cuenta llegó." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha) || input.fecha > hoyBogota()) return { error: "Revisa la fecha del abono." };
  if (input.netoReal === null || !Number.isFinite(input.netoReal) || input.netoReal <= 0) return { error: "Escribe cuánto llegó al banco." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  let soporte: { path: string; nombre: string } | null = null;
  if (input.soportePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "liquidaciones", input.id, input.soportePath, input.soporteNombre ?? "reporte", "finanzas");
    if ("error" in v) return { error: v.error };
    soporte = { path: v.path, nombre: v.nombre };
  }
  const { error } = await supabase.rpc("fn_fin_liquidar_pasarela", {
    p_id: input.id,
    p_movimientos: input.movimientos,
    p_cuenta_banco: input.cuentaId,
    p_fecha: input.fecha,
    p_neto_real: input.netoReal,
    p_soporte_path: soporte?.path ?? null,
    p_soporte_nombre: soporte?.nombre ?? null,
  });
  if (error) return { error: mensajeError("liquidarPasarela", error, "No se pudo registrar la liquidación.") };
  revalidar();
  return {};
}

export async function anularLiquidacion(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Liquidación inválida." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se anula (al menos 10 caracteres)." };
  const check = await requirePermiso(MODULO_FINANZAS, "VOID");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_anular_liquidacion", { p_id: id, p_motivo: motivo.trim().slice(0, 500) });
  if (error) return { error: mensajeError("anularLiquidacion", error, "No se pudo anular la liquidación.") };
  revalidar();
  return {};
}

export async function urlSoporteLiquidacion(id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Liquidación inválida." };
  const check = await requirePermiso(MODULO_FINANZAS, "VIEW");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase.from("fin_liquidaciones_pasarela").select("soporte_storage_path, soporte_nombre_archivo").eq("id", id).maybeSingle();
  if (!data?.soporte_storage_path) return { error: "No hay reporte cargado." };
  return firmar(supabase, data.soporte_storage_path, data.soporte_nombre_archivo, "finanzas");
}
