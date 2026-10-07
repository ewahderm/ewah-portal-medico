"use server";

// Autoevaluación de estándares mínimos (SG-SST F2). La BD (0078) pone los
// ítems según el grupo, exige justificación para "no aplica", calcula el
// puntaje al cerrar y desde ahí no deja cambiar nada.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { esUuid, hoyBogota, mensajeError, textoOpcional } from "@/lib/habilitacion/servidor";
import { ESTADOS_ITEM } from "@/lib/sst/estandares";
import { getDiagnostico } from "@/lib/sst/diagnostico";

type Resultado = { error?: string };

async function requireGestion(permiso: string) {
  const check = await requirePermiso("sst", permiso);
  if (!check.ok) return check;
  const plan = await requireEntitlement("sst", "gestion");
  if (!plan.ok) return { ok: false as const, error: "Esta sección del SG-SST está disponible en el plan Pro." };
  return check;
}
const revalidar = () => revalidatePath("/sst", "layout");

// El grupo NO lo elige el cliente: lo decide el diagnóstico (trabajadores y
// clase de riesgo) y la BD lo vuelve a calcular y rechaza uno menor (0086).
export async function iniciarAutoevaluacion(anio: number): Promise<Resultado> {
  const actual = Number(hoyBogota().slice(0, 4));
  if (!Number.isInteger(anio) || anio < 2019 || anio > actual) return { error: "Año inválido." };
  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { d, errorPerfil } = await getDiagnostico(supabase);
  if (errorPerfil) return { error: "No se pudo leer el perfil de SG-SST. Intenta de nuevo." };
  if (!d?.estandares) return { error: "Primero completa el diagnóstico (trabajadores y clase de riesgo) para saber qué grupo de estándares te corresponde." };
  const { error } = await supabase.rpc("fn_sst_iniciar_autoevaluacion", { p_anio: anio, p_grupo: String(d.estandares) });
  if (error) return { error: mensajeError("iniciarAutoevaluacion", error, "No se pudo iniciar la autoevaluación.") };
  revalidar();
  return {};
}

export async function calificarItem(input: {
  id: string;
  estado: string;
  justificacion: string | null;
  observacion: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Ítem inválido." };
  if (!ESTADOS_ITEM.some((e) => e.value === input.estado)) return { error: "Calificación inválida." };
  const justificacion = textoOpcional(input.justificacion)?.slice(0, 2000) ?? null;
  if (input.estado === "no_aplica" && (justificacion?.length ?? 0) < 10) {
    return { error: "Explica por qué no aplica (al menos 10 caracteres)." };
  }
  const check = await requireGestion("EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_autoevaluacion_items")
    .update({
      estado: input.estado,
      justificacion: input.estado === "no_aplica" ? justificacion : null,
      observacion: textoOpcional(input.observacion)?.slice(0, 2000) ?? null,
    })
    .eq("id", input.id)
    .select("id");
  if (error) return { error: mensajeError("calificarItem", error, "No se pudo guardar la calificación.") };
  if (!data?.length) return { error: "No tienes permiso para calificar." };
  revalidar();
  return {};
}

export async function cerrarAutoevaluacion(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Autoevaluación inválida." };
  const check = await requireGestion("APPROVE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_autoevaluaciones")
    .update({ estado: "cerrada" })
    .eq("id", id)
    .eq("estado", "abierta")
    .select("id");
  if (error) return { error: mensajeError("cerrarAutoevaluacion", error, "No se pudo cerrar la autoevaluación.") };
  if (!data?.length) return { error: "La autoevaluación ya está cerrada o no tienes permiso para cerrarla." };
  revalidar();
  return {};
}
