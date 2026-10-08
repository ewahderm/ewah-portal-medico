"use server";

// Cierre mensual (FC6): arqueo, cerrar y reabrir. La BD (0098) exige
// APPROVE y el plan, cierra en orden y registra las diferencias del arqueo.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { esUuid, mensajeError } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS } from "@/lib/finanzas/constantes";

type Resultado = { error?: string };

const mesValido = (anio: number, mes: number) => Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && Number.isInteger(mes) && mes >= 1 && mes <= 12;

export async function cerrarMes(input: {
  anio: number;
  mes: number;
  arqueos: { cuentaId: string; contado: number | null; motivo: string }[];
}): Promise<Resultado> {
  if (!mesValido(input.anio, input.mes)) return { error: "Mes inválido." };
  for (const a of input.arqueos) {
    if (!esUuid(a.cuentaId)) return { error: "Cuenta inválida." };
    if (a.contado === null || !Number.isFinite(a.contado) || a.contado < 0) return { error: "Revisa los saldos contados." };
  }
  const check = await requirePermiso(MODULO_FINANZAS, "APPROVE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_cerrar_mes", {
    p_anio: input.anio,
    p_mes: input.mes,
    p_arqueos: input.arqueos.map((a) => ({ cuenta_id: a.cuentaId, contado: a.contado, motivo: a.motivo.trim().slice(0, 500) || null })),
  });
  if (error) return { error: mensajeError("cerrarMes", error, "No se pudo cerrar el mes.") };
  revalidatePath("/finanzas", "layout");
  return {};
}

export async function reabrirMes(anio: number, mes: number, motivo: string): Promise<Resultado> {
  if (!mesValido(anio, mes)) return { error: "Mes inválido." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se reabre (al menos 10 caracteres)." };
  const check = await requirePermiso(MODULO_FINANZAS, "APPROVE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_reabrir_mes", { p_anio: anio, p_mes: mes, p_motivo: motivo.trim().slice(0, 500) });
  if (error) return { error: mensajeError("reabrirMes", error, "No se pudo reabrir el mes.") };
  revalidatePath("/finanzas", "layout");
  return {};
}
