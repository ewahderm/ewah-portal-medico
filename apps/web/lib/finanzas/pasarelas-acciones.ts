"use server";

// Reporte de la pasarela (0103): importar los pagos reales, emparejarlos con
// los cobros y confirmar los tratamientos que esperaban la confirmación. La
// BD valida todo otra vez (permisos, plan, cuadre de cada pago).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { esUuid, mensajeError } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS } from "@/lib/finanzas/constantes";
import { MAX_PAGOS_POR_REPORTE, PERFILES, type PagoPasarela } from "@/lib/finanzas/pasarelas/lector";

type Resultado = { error?: string };

const revalidar = () => revalidatePath("/finanzas", "layout");

const esNumero = (v: unknown, max = 99_999_999_999) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const esTextoOpcional = (v: unknown, max: number) => v === null || (typeof v === "string" && v.length <= max);

// Vuelve a revisar la forma de cada pago: llegan del navegador.
function pagoValido(p: PagoPasarela): boolean {
  return (
    typeof p === "object" && p !== null &&
    typeof p.id_externo === "string" && p.id_externo.length > 0 && p.id_externo.length <= 100 &&
    typeof p.pagado_en === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p.pagado_en) &&
    typeof p.estado_externo === "string" && p.estado_externo.length <= 100 &&
    typeof p.exitoso === "boolean" &&
    [p.compra, p.propina, p.valor_total, p.comision, p.retefuente, p.reteica, p.reteiva, p.total_deduccion, p.deposito].every((n) => esNumero(n)) &&
    esTextoOpcional(p.tipo_tarjeta, 60) && esTextoOpcional(p.franquicia, 60) && esTextoOpcional(p.pais_tarjeta, 60) &&
    esTextoOpcional(p.canal, 60) && esTextoOpcional(p.metodo, 80) && esTextoOpcional(p.autorizacion, 60) && esTextoOpcional(p.referencia, 200)
  );
}

export async function importarPagosPasarela(input: {
  cuentaId: string;
  perfil: string;
  pagos: PagoPasarela[];
  nombreArchivo?: string | null;
  conError?: number;
}): Promise<Resultado & { total?: number; nuevos?: number; repetidos?: number; cambiados?: number; emparejados?: number; sinEmparejar?: number }> {
  if (!esUuid(input.cuentaId)) return { error: "Elige la pasarela." };
  if (!PERFILES.some((p) => p.id === input.perfil)) return { error: "Formato de reporte no reconocido." };
  if (!Array.isArray(input.pagos) || input.pagos.length === 0) return { error: "El reporte no trae pagos." };
  if (input.pagos.length > MAX_PAGOS_POR_REPORTE) return { error: `Súbelo por partes (máximo ${MAX_PAGOS_POR_REPORTE} pagos).` };
  if (!input.pagos.every(pagoValido)) return { error: "El reporte trae datos que no se pueden leer. Descárgalo de nuevo y súbelo sin editarlo." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_fin_importar_pagos", {
    p_cuenta: input.cuentaId,
    p_perfil: input.perfil,
    p_pagos: input.pagos,
    p_nombre_archivo: typeof input.nombreArchivo === "string" ? input.nombreArchivo.slice(0, 255) : null,
    p_con_error: Number.isInteger(input.conError) && (input.conError ?? 0) >= 0 ? input.conError : 0,
  });
  if (error) return { error: mensajeError("importarPagosPasarela", error, "No se pudo importar el reporte.") };
  const imp = (data ?? {}) as { total?: number; nuevos?: number; repetidos?: number; cambiados?: number };

  // Empareja lo inequívoco; si falla, lo importado queda y se puede reintentar.
  const { data: con, error: errorCon } = await supabase.rpc("fn_fin_conciliar_pagos", { p_cuenta: input.cuentaId });
  if (errorCon) console.error("[finanzas] fn_fin_conciliar_pagos", errorCon);
  const c = (con ?? {}) as { emparejados?: number; sin_emparejar?: number };
  revalidar();
  return {
    total: Number(imp.total ?? 0),
    nuevos: Number(imp.nuevos ?? 0),
    repetidos: Number(imp.repetidos ?? 0),
    cambiados: Number(imp.cambiados ?? 0),
    emparejados: Number(c.emparejados ?? 0),
    sinEmparejar: Number(c.sin_emparejar ?? 0),
  };
}

export async function conciliarPagosPasarela(cuentaId: string): Promise<Resultado & { emparejados?: number; sinEmparejar?: number }> {
  if (!esUuid(cuentaId)) return { error: "Elige la pasarela." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_fin_conciliar_pagos", { p_cuenta: cuentaId });
  if (error) return { error: mensajeError("conciliarPagosPasarela", error, "No se pudieron emparejar los pagos.") };
  const c = (data ?? {}) as { emparejados?: number; sin_emparejar?: number };
  revalidar();
  return { emparejados: Number(c.emparejados ?? 0), sinEmparejar: Number(c.sin_emparejar ?? 0) };
}

// Empareja un pago con el cobro (movimientoId) o el tratamiento (tratamientoId) que la persona elige.
export async function vincularPagoPasarela(input: { pagoId: string; movimientoId?: string | null; tratamientoId?: string | null }): Promise<Resultado> {
  if (!esUuid(input.pagoId)) return { error: "Datos inválidos." };
  const mov = input.movimientoId ?? null;
  const trat = input.tratamientoId ?? null;
  if ((mov === null) === (trat === null)) return { error: "Elige un cobro o un tratamiento." };
  if ((mov && !esUuid(mov)) || (trat && !esUuid(trat))) return { error: "Datos inválidos." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_vincular_pago", { p_pago: input.pagoId, p_movimiento: mov, p_tratamiento: trat });
  if (error) return { error: mensajeError("vincularPagoPasarela", error, "No se pudo emparejar el pago.") };
  revalidar();
  return {};
}

// Acepta (actualiza el pago) o descarta un cambio que trajo un reporte
// posterior de la pasarela para un pago ya importado.
export async function resolverCambioPago(cambioId: string, aceptar: boolean): Promise<Resultado> {
  if (!esUuid(cambioId)) return { error: "Datos inválidos." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_resolver_cambio_pago", { p_cambio: cambioId, p_aceptar: aceptar });
  if (error) return { error: mensajeError("resolverCambioPago", error, "No se pudo revisar el cambio.") };
  revalidar();
  return {};
}

export async function anularPagoPasarela(pagoId: string, motivo: string): Promise<Resultado> {
  if (!esUuid(pagoId)) return { error: "Datos inválidos." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se anula el pago (al menos 10 caracteres)." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_anular_pago", { p_pago: pagoId, p_motivo: motivo.trim() });
  if (error) return { error: mensajeError("anularPagoPasarela", error, "No se pudo anular el pago.") };
  revalidar();
  return {};
}
