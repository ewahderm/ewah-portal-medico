"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosCargoDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    codigo: campoOpcional(formData, "codigo"),
    claseRiesgoId: valorOpcionalSelect(formData, "claseRiesgoId"),
  };
}

export async function crearCargo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosCargoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("cargos").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    codigo: datos.codigo,
    clase_riesgo_id: datos.claseRiesgoId,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un cargo con ese código." };
    return { error: "No se pudo crear el cargo." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function editarCargo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Cargo inválido." };

  const datos = datosCargoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cargos")
    .update({ nombre: datos.nombre, codigo: datos.codigo, clase_riesgo_id: datos.claseRiesgoId })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un cargo con ese código." };
    return { error: "No se pudo actualizar el cargo." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleCargo(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("cargos").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el cargo.");

  revalidatePath("/parametros");
}
