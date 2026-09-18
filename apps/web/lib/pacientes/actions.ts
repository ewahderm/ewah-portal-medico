"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import type { ActionState } from "@/lib/auth/actions";
import { valorOpcionalSelect, campoOpcional } from "@/lib/forms/opcional";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("pacientes", permiso);
}

function datosPacienteDesdeForm(formData: FormData) {
  return {
    tipo_identificacion_id: String(formData.get("tipoIdentificacionId") ?? ""),
    numero_identificacion: String(formData.get("numeroIdentificacion") ?? "").trim(),
    primer_nombre: String(formData.get("primerNombre") ?? "").trim(),
    segundo_nombre: campoOpcional(formData, "segundoNombre"),
    primer_apellido: String(formData.get("primerApellido") ?? "").trim(),
    segundo_apellido: campoOpcional(formData, "segundoApellido"),
    fecha_nacimiento: campoOpcional(formData, "fechaNacimiento"),
    genero_id: valorOpcionalSelect(formData, "generoId"),
    nacionalidad_id: valorOpcionalSelect(formData, "nacionalidadId"),
    pais_residencia_id: valorOpcionalSelect(formData, "paisResidenciaId"),
    canal_captacion_id: valorOpcionalSelect(formData, "canalCaptacionId"),
    eps_id: valorOpcionalSelect(formData, "epsId"),
    email: campoOpcional(formData, "email"),
    telefono1: campoOpcional(formData, "telefono1"),
    telefono2: campoOpcional(formData, "telefono2"),
  };
}

export async function crearPaciente(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosPacienteDesdeForm(formData);

  if (!datos.tipo_identificacion_id || !datos.numero_identificacion) {
    return { error: "Tipo y número de identificación son obligatorios." };
  }
  if (!datos.primer_nombre || !datos.primer_apellido) {
    return { error: "Nombre y apellido son obligatorios." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("pacientes").insert({
    ...datos,
    clinica_id: check.usuario.clinica_id,
    created_by: check.usuario.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un paciente con ese tipo y número de identificación." };
    }
    return { error: "No se pudo crear el paciente." };
  }

  revalidatePath("/pacientes");
  return null;
}

export async function actualizarPaciente(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Paciente inválido." };

  const datos = datosPacienteDesdeForm(formData);

  if (!datos.tipo_identificacion_id || !datos.numero_identificacion) {
    return { error: "Tipo y número de identificación son obligatorios." };
  }
  if (!datos.primer_nombre || !datos.primer_apellido) {
    return { error: "Nombre y apellido son obligatorios." };
  }

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("pacientes").update(datos).eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un paciente con ese tipo y número de identificación." };
    }
    return { error: "No se pudo actualizar el paciente." };
  }

  revalidatePath("/pacientes");
  return null;
}

export async function toggleActivoPaciente(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("pacientes").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el estado del paciente.");

  revalidatePath("/pacientes");
}
