"use server";

// Registrar y anular movimientos del flujo de caja (FC2). La BD (0091)
// valida fecha, cuenta, moneda, categoría y plan, calcula el valor en COP
// y no deja modificar ni borrar: se anula con motivo.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { esUuid, firmar, hoyBogota, mensajeError, textoOpcional, verificarArchivoSubido } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS, type Moneda } from "@/lib/finanzas/constantes";
import { validarMovimiento, type TipoMovimiento } from "@/lib/finanzas/movimientos";

type Resultado = { error?: string };

const revalidar = () => revalidatePath("/finanzas", "layout");

export async function registrarMovimiento(input: {
  id: string;
  tipo: TipoMovimiento;
  fecha: string;
  monto: number | null;
  tasa: number | null;
  categoria: string | null;
  cuentaId: string | null;
  cuentaDestinoId: string | null;
  montoDestino: number | null;
  sedeId: string | null;
  proveedorId: string | null;
  socioId: string | null;
  terceroNombre: string | null;
  descripcion: string | null;
  soportePath: string | null;
  soporteNombre: string | null;
  datosActivo: { nombre: string; clase: string } | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Movimiento inválido." };
  if (!["ingreso", "egreso", "transferencia"].includes(input.tipo)) return { error: "Tipo inválido." };
  for (const v of [input.cuentaId, input.cuentaDestinoId, input.sedeId, input.proveedorId, input.socioId]) {
    if (v && !esUuid(v)) return { error: "Datos inválidos." };
  }
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();

  // La moneda la decide la cuenta (y la BD lo vuelve a exigir).
  const ids = [input.cuentaId, input.cuentaDestinoId].filter(Boolean) as string[];
  const [{ data: cuentas }, { data: config }, { data: categoria }] = await Promise.all([
    supabase.from("fin_cuentas").select("id, moneda").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("fin_config").select("fecha_inicio").maybeSingle(),
    input.categoria && !input.categoria.startsWith("PROPIA_")
      ? supabase.from("fin_categorias").select("comportamiento").eq("codigo", input.categoria).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!config) return { error: "Primero activa el flujo de caja." };
  const moneda = (cuentas?.find((c) => c.id === input.cuentaId)?.moneda ?? "COP") as Moneda;
  const monedaDestino = (cuentas?.find((c) => c.id === input.cuentaDestinoId)?.moneda ?? null) as Moneda | null;
  const requiereSocio = (categoria as { comportamiento: string } | null)?.comportamiento === "prestamo_socio";
  const error = validarMovimiento(
    {
      tipo: input.tipo,
      fecha: input.fecha,
      monto: input.monto,
      moneda,
      tasa: input.tasa,
      categoria: input.tipo === "transferencia" ? null : input.categoria,
      cuentaId: input.cuentaId,
      cuentaDestinoId: input.cuentaDestinoId,
      monedaDestino,
      montoDestino: input.montoDestino,
      socioId: input.socioId,
      requiereSocio,
    },
    { hoy: hoyBogota(), fechaInicio: config.fecha_inicio },
  );
  if (error) return { error };

  let soporte: { path: string; nombre: string } | null = null;
  if (input.soportePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "movimientos", input.id, input.soportePath, input.soporteNombre ?? "soporte", "finanzas");
    if ("error" in v) return { error: v.error };
    soporte = { path: v.path, nombre: v.nombre };
  }

  const propia = input.categoria?.startsWith("PROPIA_") ? input.categoria.slice(7) : null;
  if (propia && !esUuid(propia)) return { error: "Categoría inválida." };
  const montoDestino = input.tipo === "transferencia" ? (monedaDestino && monedaDestino !== moneda ? input.montoDestino : input.monto) : null;
  const activo = input.datosActivo?.nombre?.trim()
    ? { nombre: input.datosActivo.nombre.trim().slice(0, 200), clase: input.datosActivo.clase }
    : null;

  const { error: errorBd } = await supabase.from("fin_movimientos").insert({
    id: input.id,
    clinica_id: check.usuario.clinica_id,
    fecha: input.fecha,
    tipo: input.tipo,
    categoria_codigo: input.tipo === "transferencia" ? null : propia ? null : input.categoria,
    categoria_propia_id: input.tipo === "transferencia" ? null : propia,
    cuenta_id: input.cuentaId,
    cuenta_destino_id: input.tipo === "transferencia" ? input.cuentaDestinoId : null,
    monto_destino: montoDestino,
    sede_id: input.sedeId,
    proveedor_id: input.tipo === "transferencia" ? null : input.proveedorId,
    socio_id: input.tipo === "transferencia" ? null : input.socioId,
    tercero_tipo: input.proveedorId ? "proveedor" : input.socioId ? "socio" : textoOpcional(input.terceroNombre) ? "otro" : null,
    tercero_nombre: input.proveedorId || input.socioId ? null : textoOpcional(input.terceroNombre)?.slice(0, 200) ?? null,
    moneda,
    monto_original: input.monto,
    tasa_cop: moneda === "COP" ? 1 : input.tasa,
    descripcion: textoOpcional(input.descripcion)?.slice(0, 500) ?? null,
    soporte_storage_path: soporte?.path ?? null,
    soporte_nombre_archivo: soporte?.nombre ?? null,
    datos_activo: activo,
  });
  if (errorBd) return { error: mensajeError("registrarMovimiento", errorBd, "No se pudo registrar el movimiento.") };
  revalidar();
  return {};
}

export async function anularMovimiento(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Movimiento inválido." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se anula (al menos 10 caracteres)." };
  const check = await requirePermiso(MODULO_FINANZAS, "VOID");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fin_anular_movimiento", { p_id: id, p_motivo: motivo.trim().slice(0, 500) });
  if (error) return { error: mensajeError("anularMovimiento", error, "No se pudo anular el movimiento.") };
  revalidar();
  return {};
}

export async function urlSoporteMovimiento(id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Movimiento inválido." };
  const check = await requirePermiso(MODULO_FINANZAS, "VIEW");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase.from("fin_movimientos").select("soporte_storage_path, soporte_nombre_archivo").eq("id", id).maybeSingle();
  if (!data?.soporte_storage_path) return { error: "No hay soporte cargado." };
  return firmar(supabase, data.soporte_storage_path, data.soporte_nombre_archivo, "finanzas");
}
