"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosConsultorioDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    sedeId: String(formData.get("sedeId") ?? ""),
    codigo: campoOpcional(formData, "codigo"),
  };
}

export async function crearConsultorio(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosConsultorioDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  if (!datos.sedeId) return { error: "La sede es obligatoria." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("consultorios").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    sede_id: datos.sedeId,
    codigo: datos.codigo,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un consultorio con ese código en esa sede." };
    return { error: "No se pudo crear el consultorio." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function editarConsultorio(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Consultorio inválido." };

  const datos = datosConsultorioDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  if (!datos.sedeId) return { error: "La sede es obligatoria." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("consultorios")
    .update({ nombre: datos.nombre, sede_id: datos.sedeId, codigo: datos.codigo })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un consultorio con ese código en esa sede." };
    return { error: "No se pudo actualizar el consultorio." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleConsultorio(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("consultorios").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el consultorio.");

  revalidatePath("/parametros");
}
