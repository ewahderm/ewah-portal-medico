"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosTipoTratamientoDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    codigo: campoOpcional(formData, "codigo"),
    // Servicio general (practicas_medicas) desde 0061: el código de
    // habilitación se resuelve con la sede donde se presta el tratamiento.
    practicaMedicaId: valorOpcionalSelect(formData, "practicaMedicaId"),
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
    practica_medica_id: datos.practicaMedicaId,
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
      practica_medica_id: datos.practicaMedicaId,
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

// Precio con historial (0109): nunca se edita uno anterior, se registra uno
// nuevo con la fecha desde la que rige (puede ser futura: un aumento
// programado).
export async function agregarPrecioTratamiento(
  tipoTratamientoId: string,
  valor: number,
  vigenteDesde: string,
): Promise<ResultadoAccion> {
  if (!tipoTratamientoId) return { error: "Tipo de tratamiento inválido." };
  if (!Number.isFinite(valor) || valor < 0) return { error: "Escribe un precio válido (0 o más)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde)) return { error: "Elige desde qué fecha rige el precio." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("precios_tratamiento").insert({
    clinica_id: check.usuario.clinica_id,
    tipo_tratamiento_id: tipoTratamientoId,
    valor: Math.round(valor),
    vigente_desde: vigenteDesde,
  });
  if (error) return { error: "No se pudo guardar el precio." };

  revalidatePath("/parametros");
  return {};
}

export async function toggleTipoTratamiento(id: string, activo: boolean): Promise<ResultadoAccion> {
  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("tipos_tratamiento").update({ activo }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el tipo de tratamiento." };

  revalidatePath("/parametros");
  return {};
}
