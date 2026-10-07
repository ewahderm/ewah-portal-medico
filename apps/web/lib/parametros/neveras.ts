"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosNeveraDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    sedeId: String(formData.get("sedeId") ?? ""),
    codigo: campoOpcional(formData, "codigo"),
  };
}

export async function crearNevera(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosNeveraDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  if (!datos.sedeId) return { error: "La sede es obligatoria." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("neveras").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    sede_id: datos.sedeId,
    codigo: datos.codigo,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe una nevera con ese código en esa sede." };
    return { error: "No se pudo crear la nevera." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function editarNevera(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Nevera inválida." };

  const datos = datosNeveraDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  if (!datos.sedeId) return { error: "La sede es obligatoria." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("neveras")
    .update({ nombre: datos.nombre, sede_id: datos.sedeId, codigo: datos.codigo })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe una nevera con ese código en esa sede." };
    return { error: "No se pudo actualizar la nevera." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleNevera(id: string, activo: boolean): Promise<ResultadoAccion> {
  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("neveras").update({ activo }).eq("id", id);
  if (error) return { error: "No se pudo actualizar la nevera." };

  revalidatePath("/parametros");
  return {};
}
