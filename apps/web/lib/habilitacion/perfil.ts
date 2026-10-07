"use server";

// Perfil del prestador (Etapa 1, HU-1.1 a HU-1.4). Editable en TODOS los
// planes (decisión B: sin perfil el calendario gratuito sale vacío), por eso
// ninguna de estas actions exige la sub-feature de gestión.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import {
  CARACTERISTICAS_PERFIL,
  ESTADOS_REPS,
  GRUPOS_SUPERSALUD,
  NATURALEZAS,
  TIPOS_PRESTADOR,
  type GrupoSupersalud,
} from "@/lib/habilitacion/constantes";
import type { RespuestasGrupo } from "@/lib/habilitacion/tipos";

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXTO = 200;

function fechaOpcional(formData: FormData, campo: string): string | null | "invalida" {
  const v = campoOpcional(formData, campo);
  if (!v) return null;
  return FECHA_ISO.test(v) ? v : "invalida";
}

function textoCorto(formData: FormData, campo: string): string | null {
  const v = campoOpcional(formData, campo);
  return v ? v.slice(0, MAX_TEXTO) : null;
}

function revalidar() {
  revalidatePath("/habilitacion", "layout");
}

export async function guardarPerfil(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tipo = String(formData.get("tipoPrestador") ?? "");
  const estadoReps = String(formData.get("estadoReps") ?? "");
  const naturaleza = valorOpcionalSelect(formData, "naturaleza");

  if (!(TIPOS_PRESTADOR as readonly string[]).includes(tipo)) {
    return { error: "Elige qué tipo de prestador eres." };
  }
  if (!ESTADOS_REPS.some((e) => e.value === estadoReps)) {
    return { error: "Cuéntanos tu situación ante el REPS." };
  }
  if (naturaleza && !NATURALEZAS.some((n) => n.value === naturaleza)) {
    return { error: "Naturaleza jurídica inválida." };
  }

  const fechaInscripcion = fechaOpcional(formData, "fechaInscripcion");
  const fechaVencimiento = fechaOpcional(formData, "fechaVencimiento");
  const fechaRadicacion = fechaOpcional(formData, "fechaPlaneadaRadicacion");
  if ([fechaInscripcion, fechaVencimiento, fechaRadicacion].includes("invalida")) {
    return { error: "Alguna de las fechas no es válida." };
  }
  if (estadoReps === "inscrito" && !fechaVencimiento) {
    return { error: "Si ya estás inscrito, escribe la fecha de vencimiento de tu inscripción tal como aparece en el REPS." };
  }
  if (fechaInscripcion && fechaVencimiento && fechaVencimiento <= fechaInscripcion) {
    return { error: "La fecha de vencimiento debe ser posterior a la de inscripción." };
  }

  const check = await requireHabilitacion("EDIT", { gestion: false });
  if (!check.ok) return { error: check.error };

  const caracteristicas = Object.fromEntries(
    CARACTERISTICAS_PERFIL.map((c) => [c.campo, formData.get(c.campo) === "on"]),
  );

  const datos: Record<string, unknown> = {
    tipo_prestador: tipo,
    naturaleza,
    estado_reps: estadoReps,
    fecha_inscripcion_inicial: fechaInscripcion,
    fecha_vencimiento_reps: fechaVencimiento,
    fecha_planeada_radicacion: fechaRadicacion,
    secretaria_departamento_id: valorOpcionalSelect(formData, "secretariaDepartamentoId"),
    secretaria_nombre: textoCorto(formData, "secretariaNombre"),
    representante_legal_nombre: textoCorto(formData, "representanteNombre"),
    representante_legal_documento: textoCorto(formData, "representanteDocumento"),
    ...caracteristicas,
    updated_by: check.usuario.id,
  };
  // HU-1.2 AC3: el profesional independiente no tiene grupo Supersalud (y
  // un check de 0061 lo exige en BD).
  if (tipo === "profesional_independiente") {
    datos.grupo_supersalud = null;
    datos.grupo_fecha_clasificacion = null;
  }

  const supabase = await createClient();
  const { data: existente } = await supabase.from("hab_perfil_prestador").select("id").maybeSingle();

  const { error } = existente
    ? await supabase.from("hab_perfil_prestador").update(datos).eq("id", existente.id)
    : await supabase
        .from("hab_perfil_prestador")
        .insert({ ...datos, clinica_id: check.usuario.clinica_id, created_by: check.usuario.id });

  if (error) {
    console.error("[habilitacion] guardarPerfil", error);
    if (error.code === "42501") return { error: "No tienes permiso para editar el perfil." };
    return { error: "No se pudo guardar el perfil. Intenta de nuevo." };
  }

  revalidar();
  return null;
}

export async function guardarGrupoSupersalud(input: {
  grupo: string;
  fechaClasificacion: string;
  respuestas: RespuestasGrupo | null;
  sugerido: string | null;
}): Promise<{ error?: string }> {
  if (!(GRUPOS_SUPERSALUD as readonly string[]).includes(input.grupo)) {
    return { error: "Elige un grupo de la lista." };
  }
  if (!FECHA_ISO.test(input.fechaClasificacion)) {
    return { error: "Escribe la fecha en que hiciste la clasificación." };
  }

  const check = await requireHabilitacion("EDIT", { gestion: false });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: perfil } = await supabase.from("hab_perfil_prestador").select("id, tipo_prestador").maybeSingle();
  if (!perfil) return { error: "Guarda primero tu perfil (tipo de prestador)." };
  if (perfil.tipo_prestador === "profesional_independiente") {
    return { error: "El profesional independiente no tiene grupo de clasificación Supersalud." };
  }

  // Snapshot de lo que respondió (no se filtra; por eso jsonb). Se guarda el
  // grupo CONFIRMADO por el usuario; el sugerido queda solo como registro.
  const snapshot = input.respuestas
    ? {
        ...input.respuestas,
        sugerido: (GRUPOS_SUPERSALUD as readonly string[]).includes(input.sugerido ?? "")
          ? (input.sugerido as GrupoSupersalud)
          : undefined,
      }
    : null;

  const { error } = await supabase
    .from("hab_perfil_prestador")
    .update({
      grupo_supersalud: input.grupo,
      grupo_fecha_clasificacion: input.fechaClasificacion,
      grupo_asistente: snapshot,
      updated_by: check.usuario.id,
    })
    .eq("id", perfil.id);
  if (error) {
    console.error("[habilitacion] guardarGrupoSupersalud", error);
    return { error: "No se pudo guardar el grupo. Intenta de nuevo." };
  }

  revalidar();
  return {};
}

// Código del prestador = clinicas.codigo_habilitacion (0052, HU-1.3 AC3):
// mismo campo que Datos básicos, escrito con la RPC angosta de 0061.
export async function actualizarCodigoPrestador(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const codigo = (campoOpcional(formData, "codigo") ?? "").slice(0, 50);

  const check = await requireHabilitacion("EDIT", { gestion: false });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_hab_actualizar_codigo_prestador", { p_codigo: codigo || null });
  if (error) {
    console.error("[habilitacion] actualizarCodigoPrestador", error);
    return { error: error.code === "P0001" ? error.message : "No se pudo guardar el código del prestador." };
  }

  revalidar();
  revalidatePath("/parametros");
  return null;
}
