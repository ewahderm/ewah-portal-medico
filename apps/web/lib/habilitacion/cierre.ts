"use server";

// Cierre de la autoevaluación (F10, HU-4.6). La foto la arma la BD
// (fn_hab_cerrar_autoevaluacion, 0070; 0085 suma los servicios sin evaluar a los
// que exigen confirmar): conjunto de criterios, estados
// derivados, evidencias y resumen. Aquí solo se valida la forma de lo que
// escribe el usuario (nombre, motivo, fechas) y se traducen los errores.

import { createClient } from "@/lib/supabase/server";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import { MOTIVOS_AUTOEVALUACION } from "@/lib/habilitacion/constantes";
import { FECHA_ISO, esUuid, hoyBogota, mensajeError, revalidar } from "@/lib/habilitacion/servidor";
import { fechaColombiaDe } from "@/lib/habilitacion/ruta";
import type { EstadoDeclaracionServicio } from "@/lib/habilitacion/tipos";

type Resultado = { error?: string };

// Lo que verá el diálogo antes de cerrar: estado de declaración de cada
// servicio × sede (el mismo cálculo que usa el cierre). Se pide al abrir
// el diálogo, no en cada carga de la página.
export async function previsualizarCierre(): Promise<Resultado & { servicios?: EstadoDeclaracionServicio[] }> {
  const check = await requireHabilitacion("APPROVE", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_hab_estados_declaracion");
  if (error) return { error: mensajeError("previsualizarCierre", error, "No se pudo calcular el estado de tus servicios.") };
  return { servicios: (data ?? []) as EstadoDeclaracionServicio[] };
}

export async function cerrarAutoevaluacion(input: {
  nombre: string;
  motivo: string;
  confirmoNoAptos: boolean;
}): Promise<Resultado & { id?: string; requiereConfirmar?: boolean }> {
  const nombre = input.nombre.trim();
  if (nombre.length < 3 || nombre.length > 200) return { error: "Ponle un nombre a la autoevaluación (3 a 200 caracteres)." };
  if (!MOTIVOS_AUTOEVALUACION.some((m) => m.value === input.motivo)) return { error: "Elige el motivo de la autoevaluación." };

  const check = await requireHabilitacion("APPROVE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_hab_cerrar_autoevaluacion", {
    p_nombre: nombre,
    p_motivo: input.motivo,
    p_confirmo_no_aptos: input.confirmoNoAptos,
  });
  if (error) {
    // La lista de no aptos pudo cambiar entre que se abrió el diálogo y el
    // clic (otra persona marcó un No cumple): se pide confirmar de nuevo.
    if (error.code === "P0001" && error.message.startsWith("SERVICIOS_NO_APTOS")) {
      return { error: error.message.replace(/^SERVICIOS_NO_APTOS:\s*/, ""), requiereConfirmar: true };
    }
    return { error: mensajeError("cerrarAutoevaluacion", error, "No se pudo cerrar la autoevaluación.") };
  }
  revalidar();
  return { id: data as string };
}

// AC4: después de declarar en el REPS el usuario digita la fecha. Una sola
// vez (la BD lo exige con el trigger de 0066).
export async function registrarFechaDeclaracionReps(id: string, fecha: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Autoevaluación inválida." };
  if (!FECHA_ISO.test(fecha)) return { error: "Escribe la fecha en que declaraste en el REPS." };
  if (fecha > hoyBogota()) return { error: "La fecha de declaración no puede ser futura." };

  const check = await requireHabilitacion("APPROVE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("hab_autoevaluaciones").select("fecha_cierre").eq("id", id).maybeSingle();
  if (!actual) return { error: "Autoevaluación inválida." };
  if (fecha < fechaColombiaDe(String(actual.fecha_cierre))) return { error: "La declaración no puede ser anterior al cierre de la autoevaluación." };

  const { data, error } = await supabase
    .from("hab_autoevaluaciones")
    .update({ fecha_declaracion_reps: fecha })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError("registrarFechaDeclaracionReps", error, "No se pudo guardar la fecha.") };
  if (!data?.length) return { error: "No tienes permiso para registrar la declaración." };
  revalidar();
  return {};
}

// Una foto equivocada no se borra: se anula con un motivo (queda en el
// historial tachada). La ocurrencia del REPS que esa foto hubiera marcado
// como presentada se reabre sola (trigger de 0071: se anula y nace una
// pendiente del mismo periodo).
export async function anularAutoevaluacion(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Autoevaluación inválida." };
  const texto = motivo.trim();
  if (texto.length < 10 || texto.length > 2000) return { error: "Explica por qué la anulas (al menos 10 caracteres)." };

  const check = await requireHabilitacion("VOID", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hab_autoevaluaciones")
    .update({ anulado: true, anulado_motivo: texto })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError("anularAutoevaluacion", error, "No se pudo anular.") };
  if (!data?.length) return { error: "No tienes permiso para anular la autoevaluación." };
  revalidar();
  return {};
}
