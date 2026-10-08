"use server";

// Socios (FC5): reembolsar la tarjeta, préstamos y devoluciones. La BD
// (0096) pone los topes (no se reembolsa ni devuelve de más) y el plan.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { esUuid, hoyBogota, mensajeError, textoOpcional } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS } from "@/lib/finanzas/constantes";
import { validarOperacionSocio, type OperacionSocio } from "@/lib/finanzas/socios";

type Resultado = { error?: string };

const OPS: OperacionSocio[] = ["reembolso", "prestamo_a_socio", "prestamo_de_socio", "socio_devuelve", "clinica_devuelve"];

export async function operarSocio(input: {
  operacion: OperacionSocio;
  socioId: string;
  tarjetaId: string | null;
  cuentaId: string | null;
  fecha: string;
  monto: number | null;
  nota: string | null;
}): Promise<Resultado> {
  if (!OPS.includes(input.operacion) || !esUuid(input.socioId)) return { error: "Datos inválidos." };
  if ((input.cuentaId && !esUuid(input.cuentaId)) || (input.tarjetaId && !esUuid(input.tarjetaId))) return { error: "Datos inválidos." };
  if (input.operacion === "reembolso" && !input.tarjetaId) return { error: "Elige la tarjeta." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data: config } = await supabase.from("fin_config").select("fecha_inicio").maybeSingle();
  if (!config) return { error: "Primero activa el flujo de caja." };
  const error = validarOperacionSocio({ monto: input.monto, fecha: input.fecha, cuentaId: input.cuentaId, hoy: hoyBogota(), fechaInicio: config.fecha_inicio, tope: null });
  if (error) return { error };
  const nota = textoOpcional(input.nota)?.slice(0, 500) ?? null;

  let errorBd: { code?: string; message: string } | null = null;
  if (input.operacion === "reembolso") {
    ({ error: errorBd } = await supabase.rpc("fn_fin_reembolsar_socio", {
      p_tarjeta: input.tarjetaId,
      p_cuenta: input.cuentaId,
      p_fecha: input.fecha,
      p_monto: input.monto,
      p_descripcion: nota,
    }));
  } else if (input.operacion === "socio_devuelve" || input.operacion === "clinica_devuelve") {
    ({ error: errorBd } = await supabase.rpc("fn_fin_devolucion_prestamo", {
      p_socio: input.socioId,
      p_sentido: input.operacion,
      p_cuenta: input.cuentaId,
      p_fecha: input.fecha,
      p_monto: input.monto,
      p_descripcion: nota,
    }));
  } else {
    // Préstamo: movimiento manual (la BD exige socio, plan y categoría).
    const entra = input.operacion === "prestamo_de_socio";
    ({ error: errorBd } = await supabase.from("fin_movimientos").insert({
      clinica_id: check.usuario.clinica_id,
      fecha: input.fecha,
      tipo: entra ? "ingreso" : "egreso",
      categoria_codigo: entra ? "PRESTAMO_DE_SOCIO" : "PRESTAMO_A_SOCIO",
      cuenta_id: input.cuentaId,
      socio_id: input.socioId,
      moneda: "COP",
      monto_original: input.monto,
      descripcion: nota,
    }));
  }
  if (errorBd) return { error: mensajeError("operarSocio", errorBd, "No se pudo registrar la operación.") };
  revalidatePath("/finanzas", "layout");
  return {};
}
