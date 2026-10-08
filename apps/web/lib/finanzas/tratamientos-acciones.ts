"use server";

// Ingresos desde tratamientos (FC3): a qué cuenta llega cada medio de
// pago, poner al día lo pendiente y registrar cobros. La BD (0093) genera
// los ingresos y vuelve a validar todo.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { esUuid, hoyBogota, mensajeError } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS } from "@/lib/finanzas/constantes";
import { configDeDestino, validarCobro, validarMotivoExclusion, type DestinoMedio } from "@/lib/finanzas/tratamientos";

type Resultado = { error?: string };

const revalidar = () => revalidatePath("/finanzas", "layout");

export async function guardarDestinoMedio(medioPagoId: string, destino: DestinoMedio): Promise<Resultado> {
  if (!esUuid(medioPagoId)) return { error: "Medio de pago inválido." };
  if (destino !== "sin" && destino !== "credito" && !esUuid(destino)) return { error: "Cuenta inválida." };
  const check = await requirePermiso(MODULO_FINANZAS, "EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const datos = configDeDestino(destino);
  const { data: existente } = await supabase.from("fin_medios_pago").select("id").eq("medio_pago_id", medioPagoId).maybeSingle();
  if (existente) {
    const { data, error } = await supabase.from("fin_medios_pago").update(datos).eq("id", existente.id).select("id");
    if (error) return { error: mensajeError("guardarDestinoMedio", error, "No se pudo guardar el medio de pago.") };
    if (!data?.length) return { error: "No tienes permiso para configurar medios de pago." };
  } else {
    const { error } = await supabase.from("fin_medios_pago").insert({ ...datos, clinica_id: check.usuario.clinica_id, medio_pago_id: medioPagoId });
    if (error) return { error: mensajeError("guardarDestinoMedio", error, "No se pudo guardar el medio de pago.") };
  }
  revalidar();
  return {};
}

export async function ponerAlDiaIngresos(): Promise<Resultado & { generados?: number; valor?: number; anulados?: number; fallidos?: number }> {
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_fin_generar_ingresos");
  if (error) return { error: mensajeError("ponerAlDiaIngresos", error, "No se pudieron poner al día los ingresos.") };
  const r = (data ?? {}) as { generados?: number; valor?: number; anulados?: number; fallidos?: number };
  revalidar();
  return { generados: Number(r.generados ?? 0), valor: Number(r.valor ?? 0), anulados: Number(r.anulados ?? 0), fallidos: Number(r.fallidos ?? 0) };
}

export async function registrarCobro(input: { tratamientoId: string; cuentaId: string | null; fecha: string; monto: number | null }): Promise<Resultado> {
  if (!esUuid(input.tratamientoId) || (input.cuentaId && !esUuid(input.cuentaId))) return { error: "Datos inválidos." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data: config } = await supabase.from("fin_config").select("fecha_inicio").maybeSingle();
  if (!config) return { error: "Primero activa el flujo de caja." };
  const error = validarCobro({ ...input, hoy: hoyBogota(), fechaInicio: config.fecha_inicio });
  if (error) return { error };
  const { error: errorBd } = await supabase.rpc("fn_fin_registrar_cobro", {
    p_tratamiento: input.tratamientoId,
    p_cuenta: input.cuentaId,
    p_fecha: input.fecha,
    p_monto: input.monto,
  });
  if (errorBd) return { error: mensajeError("registrarCobro", errorBd, "No se pudo registrar el cobro.") };
  revalidar();
  return {};
}

export async function excluirTratamiento(input: { tratamientoId: string; motivo: string }): Promise<Resultado> {
  if (!esUuid(input.tratamientoId)) return { error: "Datos inválidos." };
  const invalido = validarMotivoExclusion(input.motivo);
  if (invalido) return { error: invalido };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_excluir_tratamiento", { p_tratamiento: input.tratamientoId, p_motivo: input.motivo.trim() });
  if (error) return { error: mensajeError("excluirTratamiento", error, "No se pudo excluir el tratamiento del flujo de caja.") };
  revalidar();
  return {};
}

export async function reincluirTratamiento(tratamientoId: string): Promise<Resultado> {
  if (!esUuid(tratamientoId)) return { error: "Datos inválidos." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_reincluir_tratamiento", { p_tratamiento: tratamientoId });
  if (error) return { error: mensajeError("reincluirTratamiento", error, "No se pudo volver a incluir el tratamiento.") };
  revalidar();
  return {};
}
