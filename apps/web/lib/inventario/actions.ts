"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/actions";

export type InventarioActionState = { error?: string; warning?: string } | null;

function campoOpcional(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor || null;
}

async function requirePermiso(permiso: "CREATE" | "VOID") {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tienePermiso } = await supabase.rpc("has_permission", {
    modulo_code: "inventario",
    permiso_code: permiso,
  });

  if (!tienePermiso) {
    return { ok: false as const, error: "No tienes permiso para esta acción." };
  }
  return { ok: true as const, usuario };
}

export async function crearLote(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const insumoId = String(formData.get("insumoId") ?? "");
  const sedeId = String(formData.get("sedeId") ?? "");
  const numeroLote = campoOpcional(formData, "numeroLote");
  const fechaVencimiento = campoOpcional(formData, "fechaVencimiento");
  const proveedor = campoOpcional(formData, "proveedor");
  const costoTexto = campoOpcional(formData, "costoUnitario");
  const cantidadTexto = String(formData.get("cantidadRecibida") ?? "").trim();

  if (!insumoId || !sedeId || !cantidadTexto) {
    return { error: "Insumo, sede y cantidad recibida son obligatorios." };
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
    tipo: "salida_consumo",
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

export async function listarMovimientosLote(loteId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos_insumos")
    .select(
      `id, tipo, cantidad, cantidad_invima, sitio_anatomico, motivo, created_at,
       tratamientos(fecha, pacientes(primer_nombre, primer_apellido)),
       creador:usuarios!movimientos_insumos_created_by_fkey(nombre)`,
    )
    .eq("lote_id", loteId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function listarConsumoTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos_insumos")
    .select(
      `id, cantidad, cantidad_invima, sitio_anatomico, motivo, created_at,
       lotes(numero_lote, insumos(nombre, unidad_medida))`,
    )
    .eq("tratamiento_id", tratamientoId)
    .eq("tipo", "salida_consumo")
    .order("created_at", { ascending: false });

  return data ?? [];
}
