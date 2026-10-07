"use server";

// Perfil del SG-SST (F1): las variables que deciden qué estándares aplican.
// Editable en todos los planes (sin él no hay diagnóstico).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";
import { FORMACIONES_RESPONSABLE } from "@/lib/sst/constantes";
import { MODULO_SST } from "@/lib/sst/consultas";

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function guardarPerfilSst(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const modo = String(formData.get("modo") ?? "");
  if (modo !== "empleador" && modo !== "independiente") return { error: "Cuéntanos si trabajas solo o con personal." };

  const codigo = campoOpcional(formData, "codigoActividad")?.replace(/\D/g, "") ?? null;
  if (codigo && !/^[1-5]\d{6}$/.test(codigo)) {
    return { error: "El código de actividad tiene 7 dígitos y empieza por la clase de riesgo (1 a 5). Cópialo de tu afiliación a la ARL." };
  }

  const otrosTexto = campoOpcional(formData, "otrosTrabajadores") ?? "0";
  const otros = Number(otrosTexto);
  if (!Number.isInteger(otros) || otros < 0 || otros > 100000) return { error: "Los otros trabajadores deben ser un número entero." };

  const excluye = formData.get("excluyeContratistas") === "on";
  const justificacion = campoOpcional(formData, "justificacionExclusion");
  if (excluye && (!justificacion || justificacion.length < 10)) {
    return { error: "Para no contar a los contratistas explica por qué (al menos 10 caracteres)." };
  }

  const formacion = valorOpcionalSelect(formData, "responsableFormacion");
  if (formacion && !FORMACIONES_RESPONSABLE.some((f) => f.value === formacion)) return { error: "Formación inválida." };
  const vence = campoOpcional(formData, "responsableLicenciaVence");
  const curso = campoOpcional(formData, "responsableCurso50h");
  if ((vence && !FECHA_ISO.test(vence)) || (curso && !FECHA_ISO.test(curso))) return { error: "Alguna de las fechas no es válida." };
  const nombre = campoOpcional(formData, "responsableNombre");
  if (nombre && (nombre.length < 3 || nombre.length > 200)) return { error: "El nombre del responsable debe tener entre 3 y 200 caracteres." };

  const check = await requirePermiso(MODULO_SST, "EDIT");
  if (!check.ok) return { error: check.error };

  const datos = {
    modo,
    codigo_actividad: codigo,
    otros_trabajadores: otros,
    otros_trabajadores_detalle: campoOpcional(formData, "otrosDetalle")?.slice(0, 500) ?? null,
    excluye_contratistas: excluye,
    justificacion_exclusion: excluye ? justificacion!.slice(0, 2000) : null,
    responsable_nombre: nombre,
    responsable_formacion: formacion,
    responsable_licencia: campoOpcional(formData, "responsableLicencia")?.slice(0, 100) ?? null,
    responsable_licencia_vence: vence,
    responsable_curso_50h: curso,
  };

  const supabase = await createClient();
  const { data: existente } = await supabase.from("sst_perfil").select("id").maybeSingle();
  const { error } = existente
    ? await supabase.from("sst_perfil").update(datos).eq("id", existente.id)
    : await supabase.from("sst_perfil").insert({ ...datos, clinica_id: check.usuario.clinica_id });
  if (error) {
    console.error("[sst] guardarPerfilSst", error);
    if (error.code === "42501") return { error: "No tienes permiso para editar el perfil del SG-SST." };
    return { error: "No se pudo guardar el perfil. Intenta de nuevo." };
  }
  revalidatePath("/sst", "layout");
  return null;
}
