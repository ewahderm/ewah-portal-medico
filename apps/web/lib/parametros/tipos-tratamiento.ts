"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosTipoTratamientoDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    codigo: campoOpcional(formData, "codigo"),
    servicioHabilitadoId: valorOpcionalSelect(formData, "servicioHabilitadoId"),
    cupsId: valorOpcionalSelect(formData, "cupsId"),
  };
}

export async function crearTipoTratamiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosTipoTratamientoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("tipos_tratamiento").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    codigo: datos.codigo,
    servicio_habilitado_id: datos.servicioHabilitadoId,
    cups_id: datos.cupsId,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un tipo de tratamiento con ese código." };
    return { error: "No se pudo crear el tipo de tratamiento." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function editarTipoTratamiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Tipo de tratamiento inválido." };

  const datos = datosTipoTratamientoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tipos_tratamiento")
    .update({
      nombre: datos.nombre,
      codigo: datos.codigo,
      servicio_habilitado_id: datos.servicioHabilitadoId,
      cups_id: datos.cupsId,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un tipo de tratamiento con ese código." };
    return { error: "No se pudo actualizar el tipo de tratamiento." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleTipoTratamiento(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("tipos_tratamiento").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el tipo de tratamiento.");

  revalidatePath("/parametros");
}
