"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA } from "./motivos";

export type InventarioActionState = { error?: string; warning?: string } | null;

function requirePermiso(permiso: "CREATE" | "VOID") {
  return requirePermisoBase("inventario", permiso);
}

export async function crearLote(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const insumoId = String(formData.get("insumoId") ?? "");
  const sedeId = String(formData.get("sedeId") ?? "");
  const numeroLote = String(formData.get("numeroLote") ?? "").trim();
  const motivoEntrada = String(formData.get("motivoEntrada") ?? "");
  const fechaVencimiento = campoOpcional(formData, "fechaVencimiento");
  const proveedor = campoOpcional(formData, "proveedor");
  const costoTexto = campoOpcional(formData, "costoUnitario");
  const cantidadTexto = String(formData.get("cantidadRecibida") ?? "").trim();

  if (!insumoId || !sedeId || !numeroLote || !cantidadTexto) {
    return { error: "Insumo, sede, número de lote y cantidad recibida son obligatorios." };
  }

  if (!MOTIVOS_ENTRADA.includes(motivoEntrada as (typeof MOTIVOS_ENTRADA)[number])) {
    return { error: "Elige un motivo de ingreso válido." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad recibida debe ser un número mayor que cero." };
  }

  const costoUnitario = costoTexto ? Number(costoTexto) : null;
  if (costoTexto && (Number.isNaN(costoUnitario) || (costoUnitario ?? 0) < 0)) {
    return { error: "El costo unitario debe ser un número válido." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: lote, error: loteError } = await supabase
    .from("lotes")
    .insert({
      clinica_id: check.usuario.clinica_id,
      insumo_id: insumoId,
      sede_id: sedeId,
      numero_lote: numeroLote,
      fecha_vencimiento: fechaVencimiento,
      proveedor,
      costo_unitario: costoUnitario,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (loteError || !lote) return { error: "No se pudo crear el lote." };

  const { error: movimientoError } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: lote.id,
    tipo: "entrada",
    motivo_movimiento: motivoEntrada,
    cantidad,
    created_by: check.usuario.id,
  });

  if (movimientoError) {
    // El lote quedó sin su entrada inicial — no lo dejamos huérfano.
    await supabase.from("lotes").delete().eq("id", lote.id);
    return { error: "No se pudo registrar la entrada del lote." };
  }

  revalidatePath("/inventario");
  return null;
}

export async function registrarAjusteLote(id: string, cantidad: number, motivo: string) {
  if (!motivo.trim()) throw new Error("El motivo del ajuste es obligatorio.");
  if (cantidad === 0) throw new Error("La cantidad del ajuste no puede ser cero.");

  const check = await requirePermiso("VOID");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: id,
    tipo: "ajuste",
    cantidad,
    motivo: motivo.trim(),
    created_by: check.usuario.id,
  });

  if (error) throw new Error("No se pudo registrar el ajuste.");

  revalidatePath("/inventario");
}

export async function registrarMovimiento(
  _prevState: InventarioActionState,
  formData: FormData,
): Promise<InventarioActionState> {
  const loteId = String(formData.get("loteId") ?? "");
  const motivo = String(formData.get("motivoMovimiento") ?? "");
  const cantidadTexto = String(formData.get("cantidad") ?? "").trim();
  const observaciones = campoOpcional(formData, "observaciones");

  const esEntrada = (MOTIVOS_ENTRADA as readonly string[]).includes(motivo);
  const esSalida = (MOTIVOS_SALIDA as readonly string[]).includes(motivo);

  if (!loteId || !cantidadTexto || (!esEntrada && !esSalida)) {
    return { error: "Lote, tipo de movimiento y cantidad son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número mayor que cero." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: lote } = await supabase
    .from("lotes")
    .select("cantidad_actual")
    .eq("id", loteId)
    .maybeSingle();

  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteId,
    tipo: esEntrada ? "entrada" : "salida",
    motivo_movimiento: motivo,
    cantidad,
    motivo: observaciones,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar el movimiento." };

  revalidatePath("/inventario");

  if (esSalida) {
    const stockRestante = (lote?.cantidad_actual ?? 0) - cantidad;
    if (stockRestante < 0) {
      return { warning: "El lote queda con stock negativo — revisa el conteo físico." };
    }
  }
  return null;
}

export async function registrarTraslado(
  _prevState: InventarioActionState,
  formData: FormData,
): Promise<InventarioActionState> {
  const loteOrigenId = String(formData.get("loteOrigenId") ?? "");
  const sedeDestinoId = String(formData.get("sedeDestinoId") ?? "");
  const cantidadTexto = String(formData.get("cantidad") ?? "").trim();
  const observaciones = campoOpcional(formData, "observaciones");

  if (!loteOrigenId || !sedeDestinoId || !cantidadTexto) {
    return { error: "Lote de origen, sede destino y cantidad son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número mayor que cero." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: loteOrigen } = await supabase
    .from("lotes")
    .select("id, insumo_id, sede_id, numero_lote, fecha_vencimiento, proveedor, costo_unitario, cantidad_actual")
    .eq("id", loteOrigenId)
    .maybeSingle();

  if (!loteOrigen) return { error: "El lote de origen no existe." };
  if (loteOrigen.sede_id === sedeDestinoId) {
    return { error: "La sede destino debe ser distinta a la sede de origen." };
  }

  let loteDestinoId: string;
  const { data: loteExistente } = await supabase
    .from("lotes")
    .select("id")
    .eq("insumo_id", loteOrigen.insumo_id)
    .eq("sede_id", sedeDestinoId)
    .eq("numero_lote", loteOrigen.numero_lote)
    .eq("activo", true)
    .maybeSingle();

  if (loteExistente) {
    loteDestinoId = loteExistente.id;
  } else {
    const { data: loteNuevo, error: loteError } = await supabase
      .from("lotes")
      .insert({
        clinica_id: check.usuario.clinica_id,
        insumo_id: loteOrigen.insumo_id,
        sede_id: sedeDestinoId,
        numero_lote: loteOrigen.numero_lote,
        fecha_vencimiento: loteOrigen.fecha_vencimiento,
        proveedor: loteOrigen.proveedor,
        costo_unitario: loteOrigen.costo_unitario,
        created_by: check.usuario.id,
      })
      .select("id")
      .single();

    if (loteError || !loteNuevo) return { error: "No se pudo crear el lote en la sede destino." };
    loteDestinoId = loteNuevo.id;
  }

  const trasladoId = randomUUID();
  const { error: salidaError } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteOrigenId,
    tipo: "salida",
    motivo_movimiento: "traslado",
    cantidad,
    motivo: observaciones,
    traslado_id: trasladoId,
    created_by: check.usuario.id,
  });
  if (salidaError) return { error: "No se pudo registrar la salida del traslado." };

  const { error: entradaError } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteDestinoId,
    tipo: "entrada",
    motivo_movimiento: "traslado",
    cantidad,
    motivo: observaciones,
    traslado_id: trasladoId,
    created_by: check.usuario.id,
  });
  if (entradaError) return { error: "La salida ya se registró, pero falló la entrada en destino — revisa el lote manualmente." };

  revalidatePath("/inventario");

  const stockRestante = loteOrigen.cantidad_actual - cantidad;
  return stockRestante < 0
    ? { warning: "El lote de origen queda con stock negativo — revisa el conteo físico." }
    : null;
}

export async function registrarConsumo(
  _prevState: InventarioActionState,
  formData: FormData,
): Promise<InventarioActionState> {
  const tratamientoId = String(formData.get("tratamientoId") ?? "");
  const loteId = String(formData.get("loteId") ?? "");
  const cantidadTexto = String(formData.get("cantidad") ?? "").trim();
  const cantidadInvimaTexto = campoOpcional(formData, "cantidadInvima");
  const sitioAnatomico = campoOpcional(formData, "sitioAnatomico");
  const motivo = campoOpcional(formData, "motivo");

  if (!tratamientoId || !loteId || !cantidadTexto) {
    return { error: "Insumo/lote y cantidad son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número mayor que cero." };
  }

  const cantidadInvima = cantidadInvimaTexto ? Number(cantidadInvimaTexto) : null;
  if (cantidadInvimaTexto && (Number.isNaN(cantidadInvima) || (cantidadInvima ?? 0) < 0)) {
    return { error: "La cantidad INVIMA debe ser un número válido." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: lote } = await supabase
    .from("lotes")
    .select("cantidad_actual")
    .eq("id", loteId)
    .maybeSingle();

  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteId,
    tipo: "salida",
    motivo_movimiento: "consumo_tratamiento",
    cantidad,
    cantidad_invima: cantidadInvima,
    tratamiento_id: tratamientoId,
    sitio_anatomico: sitioAnatomico,
    motivo,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar el consumo." };

  revalidatePath("/tratamientos");
  revalidatePath("/inventario");

  const stockRestante = (lote?.cantidad_actual ?? 0) - cantidad;
  return stockRestante < 0
    ? { warning: "El lote queda con stock negativo — revisa el conteo físico." }
    : null;
}

export async function listarMovimientos(filtros: {
  insumoId?: string;
  sedeId?: string;
  tipo?: string;
  motivo?: string;
  desde?: string;
  hasta?: string;
}) {
  const supabase = await createClient();
  const embedLote = filtros.insumoId || filtros.sedeId ? "lotes!inner" : "lotes";

  let query = supabase
    .from("movimientos_insumos")
    .select(
      `id, tipo, motivo_movimiento, cantidad, cantidad_invima, sitio_anatomico, motivo, created_at,
       ${embedLote}(numero_lote, insumo_id, sede_id, insumos(nombre, unidad_medida), sedes(nombre)),
       tratamientos(fecha, pacientes(primer_nombre, primer_apellido)),
       creador:usuarios!movimientos_insumos_created_by_fkey(nombre)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (filtros.insumoId) query = query.eq("lotes.insumo_id", filtros.insumoId);
  if (filtros.sedeId) query = query.eq("lotes.sede_id", filtros.sedeId);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros.motivo) query = query.eq("motivo_movimiento", filtros.motivo);
  if (filtros.desde) query = query.gte("created_at", filtros.desde);
  if (filtros.hasta) query = query.lte("created_at", `${filtros.hasta}T23:59:59`);

  const { data } = await query;
  return data ?? [];
}

export async function listarConsumoTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos_insumos")
    .select(
      `id, cantidad, cantidad_invima, sitio_anatomico, motivo, motivo_movimiento, revierte_movimiento_id, created_at,
       lotes(numero_lote, insumos(nombre, unidad_medida))`,
    )
    .eq("tratamiento_id", tratamientoId)
    .in("motivo_movimiento", ["consumo_tratamiento", "reverso_consumo"])
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function revertirConsumo(movimientoId: string) {
  const check = await requirePermiso("CREATE");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { data: original } = await supabase
    .from("movimientos_insumos")
    .select("id, lote_id, cantidad, tratamiento_id, motivo_movimiento")
    .eq("id", movimientoId)
    .maybeSingle();

  if (!original || original.motivo_movimiento !== "consumo_tratamiento") {
    throw new Error("Ese movimiento no es un consumo válido para revertir.");
  }

  const { data: yaRevertido } = await supabase
    .from("movimientos_insumos")
    .select("id")
    .eq("revierte_movimiento_id", movimientoId)
    .maybeSingle();
  if (yaRevertido) throw new Error("Este consumo ya fue revertido.");

  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: original.lote_id,
    tipo: "entrada",
    motivo_movimiento: "reverso_consumo",
    cantidad: original.cantidad,
    tratamiento_id: original.tratamiento_id,
    revierte_movimiento_id: original.id,
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo revertir el consumo.");

  revalidatePath("/tratamientos");
  revalidatePath("/inventario");
}

export type CorteInventarioFila = {
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  ingresos: number;
  egresos: number;
  saldo: number;
};

export async function calcularCorteInventario(fechaCorte: string, sedeId?: string) {
  const supabase = await createClient();
  const embedLote = sedeId ? "lotes!inner" : "lotes";

  let query = supabase
    .from("movimientos_insumos")
    .select(`tipo, cantidad, ${embedLote}(sede_id, insumo_id, insumos(nombre, unidad_medida))`)
    .lte("created_at", `${fechaCorte}T23:59:59`);

  if (sedeId) query = query.eq("lotes.sede_id", sedeId);

  const { data } = await query;

  const acumulado = new Map<string, CorteInventarioFila>();
  for (const fila of (data ?? []) as unknown as {
    tipo: string;
    cantidad: number;
    lotes: { insumo_id: string; insumos: { nombre: string; unidad_medida: string } | null } | null;
  }[]) {
    const insumo = fila.lotes?.insumos;
    const insumoId = fila.lotes?.insumo_id;
    if (!insumo || !insumoId) continue;

    const entrada = acumulado.get(insumoId) ?? {
      insumoId,
      nombre: insumo.nombre,
      unidadMedida: insumo.unidad_medida,
      ingresos: 0,
      egresos: 0,
      saldo: 0,
    };

    if (fila.tipo === "entrada") entrada.ingresos += fila.cantidad;
    else if (fila.tipo === "salida") entrada.egresos += fila.cantidad;
    else if (fila.tipo === "ajuste") {
      if (fila.cantidad > 0) entrada.ingresos += fila.cantidad;
      else entrada.egresos += Math.abs(fila.cantidad);
    }
    entrada.saldo = entrada.ingresos - entrada.egresos;

    acumulado.set(insumoId, entrada);
  }

  return Array.from(acumulado.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
