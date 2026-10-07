"use server";

// Matriz de peligros (F5, GTC 45). La BD (0075) calcula NP, NR y el nivel
// de riesgo; aquí se validan los valores de la escala y los textos.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { esUuid, mensajeError, textoOpcional } from "@/lib/habilitacion/servidor";
import { CLASIFICACIONES, NIVELES_CONSECUENCIA, NIVELES_DEFICIENCIA, NIVELES_EXPOSICION } from "@/lib/sst/gtc45";

type Resultado = { error?: string };

export type PeligroInput = {
  sedeId: string | null;
  proceso: string;
  actividad: string;
  cargos: string | null;
  rutinaria: boolean;
  clasificacion: string;
  descripcion: string;
  efectos: string | null;
  expuestos: number;
  controlFuente: string | null;
  controlMedio: string | null;
  controlIndividuo: string | null;
  nd: number;
  ne: number;
  nc: number;
  peorConsecuencia: string | null;
  requisitoLegal: string | null;
};

const t = (v: string | null | undefined, max: number) => textoOpcional(v)?.slice(0, max) ?? null;

function validar(i: PeligroInput): string | null {
  if (i.sedeId && !esUuid(i.sedeId)) return "Sede inválida.";
  if (i.proceso.trim().length < 2) return "Escribe el proceso.";
  if (i.actividad.trim().length < 2) return "Escribe la actividad.";
  if (i.descripcion.trim().length < 3) return "Describe el peligro.";
  if (!CLASIFICACIONES.some((c) => c.value === i.clasificacion)) return "Elige la clasificación del peligro.";
  if (!NIVELES_DEFICIENCIA.some((n) => n.value === i.nd)) return "Elige el nivel de deficiencia.";
  if (!NIVELES_EXPOSICION.some((n) => n.value === i.ne)) return "Elige el nivel de exposición.";
  if (!NIVELES_CONSECUENCIA.some((n) => n.value === i.nc)) return "Elige el nivel de consecuencia.";
  if (!Number.isInteger(i.expuestos) || i.expuestos < 0 || i.expuestos > 100000) return "Número de expuestos inválido.";
  return null;
}

async function requireGestion(permiso: string) {
  const check = await requirePermiso("sst", permiso);
  if (!check.ok) return check;
  const plan = await requireEntitlement("sst", "gestion");
  if (!plan.ok) return { ok: false as const, error: "La matriz de peligros está disponible en el plan Pro." };
  return check;
}

export async function guardarPeligro(id: string | null, i: PeligroInput): Promise<Resultado> {
  if (id && !esUuid(id)) return { error: "Peligro inválido." };
  const error = validar(i);
  if (error) return { error };
  const check = await requireGestion(id ? "EDIT" : "CREATE");
  if (!check.ok) return { error: check.error };

  const datos = {
    sede_id: i.sedeId,
    proceso: i.proceso.trim().slice(0, 200),
    actividad: i.actividad.trim().slice(0, 300),
    cargos: t(i.cargos, 300),
    rutinaria: i.rutinaria,
    clasificacion: i.clasificacion,
    descripcion: i.descripcion.trim().slice(0, 500),
    efectos: t(i.efectos, 1000),
    expuestos: i.expuestos,
    control_fuente: t(i.controlFuente, 1000),
    control_medio: t(i.controlMedio, 1000),
    control_individuo: t(i.controlIndividuo, 1000),
    nd: i.nd,
    ne: i.ne,
    nc: i.nc,
    peor_consecuencia: t(i.peorConsecuencia, 500),
    requisito_legal: t(i.requisitoLegal, 500),
  };
  const supabase = await createClient();
  const r = id
    ? await supabase.from("sst_peligros").update(datos).eq("id", id).select("id")
    : await supabase.from("sst_peligros").insert({ ...datos, clinica_id: check.usuario.clinica_id }).select("id");
  if (r.error) return { error: mensajeError("guardarPeligro", r.error, "No se pudo guardar el peligro.") };
  if (!r.data?.length) return { error: "No tienes permiso para editar la matriz." };
  revalidatePath("/sst", "layout");
  return {};
}

export async function retirarPeligro(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Peligro inválido." };
  if (motivo.trim().length < 10) return { error: "Explica por qué ya no aplica (al menos 10 caracteres)." };
  const check = await requireGestion("EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_peligros")
    .update({ activo: false, retiro_motivo: motivo.trim().slice(0, 2000) })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError("retirarPeligro", error, "No se pudo retirar.") };
  if (!data?.length) return { error: "No tienes permiso para editar la matriz." };
  revalidatePath("/sst", "layout");
  return {};
}
