"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { valorOpcionalSelect, campoOpcional } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

function datosProveedorDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    tipoIdentificacionId: valorOpcionalSelect(formData, "tipoIdentificacionId"),
    numeroIdentificacion: campoOpcional(formData, "numeroIdentificacion"),
    observaciones: campoOpcional(formData, "observaciones"),
  };
}

export async function crearProveedor(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosProveedorDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("proveedores").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    tipo_identificacion_id: datos.tipoIdentificacionId,
    numero_identificacion: datos.numeroIdentificacion,
    observaciones: datos.observaciones,
    created_by: check.usuario.id,
  });
  if (error) return { error: "No se pudo crear el proveedor." };

  revalidatePath("/parametros");
  return null;
}

export async function editarProveedor(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Proveedor inválido." };

  const datos = datosProveedorDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("proveedores")
    .update({
      nombre: datos.nombre,
      tipo_identificacion_id: datos.tipoIdentificacionId,
      numero_identificacion: datos.numeroIdentificacion,
      observaciones: datos.observaciones,
    })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el proveedor." };

  revalidatePath("/parametros");
  return null;
}

export async function toggleProveedor(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("proveedores").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el proveedor.");

  revalidatePath("/parametros");
}
