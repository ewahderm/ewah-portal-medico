"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosMotivoDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    categoria: String(formData.get("categoria") ?? ""),
    codigo: campoOpcional(formData, "codigo"),
  };
}

// El código es el identificador estable que queda guardado para siempre en
// cada movimiento histórico (movimientos_insumos.motivo_movimiento) — nunca
// cambia aunque alguien edite el nombre mostrado. Si no se da uno explícito
// (alta nueva), se deriva del nombre una sola vez.
function derivarCodigo(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function crearMotivoMovimiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosMotivoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  if (datos.categoria !== "entrada" && datos.categoria !== "salida") {
    return { error: "Elige si es un motivo de entrada o de salida." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("motivos_movimiento_inventario").insert({
    clinica_id: check.usuario.clinica_id,
    categoria: datos.categoria,
    nombre: datos.nombre,
    codigo: datos.codigo || derivarCodigo(datos.nombre),
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un motivo con ese código." };
    return { error: "No se pudo crear el motivo." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function editarMotivoMovimiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Motivo inválido." };

  const datos = datosMotivoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  if (datos.categoria !== "entrada" && datos.categoria !== "salida") {
    return { error: "Elige si es un motivo de entrada o de salida." };
  }

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  // El código NO se edita aquí a propósito: es el valor ya guardado en el
  // historial de movimientos — cambiarlo rompería el vínculo con movimientos
  // ya registrados. Solo nombre y categoría son editables tras la creación.
  const { error } = await supabase
    .from("motivos_movimiento_inventario")
    .update({ nombre: datos.nombre, categoria: datos.categoria })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el motivo." };

  revalidatePath("/parametros");
  return null;
}

export async function toggleMotivoMovimiento(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("motivos_movimiento_inventario").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el motivo.");

  revalidatePath("/parametros");
}
