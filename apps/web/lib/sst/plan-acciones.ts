"use server";

// Plan anual de trabajo y comités (SG-SST F7). La BD (0077) protege lo
// ejecutado o cancelado, los periodos de comité y las actas (no se
// modifican), las fechas futuras y que el responsable sea de la clínica.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { FECHA_ISO, esUuid, firmar, hoyBogota, mensajeError, textoOpcional, verificarArchivoSubido } from "@/lib/habilitacion/servidor";

type Resultado = { error?: string };

async function requireGestion(permiso: string) {
  const check = await requirePermiso("sst", permiso);
  if (!check.ok) return check;
  const plan = await requireEntitlement("sst", "gestion");
  if (!plan.ok) return { ok: false as const, error: "Esta sección del SG-SST está disponible en el plan Pro." };
  return check;
}
const revalidar = () => revalidatePath("/sst", "layout");
const CICLOS = ["planear", "hacer", "verificar", "actuar"];

export async function crearActividad(input: {
  anio: number;
  mes: number;
  ciclo: string;
  actividad: string;
  meta: string | null;
  recursos: string | null;
  responsableId: string | null;
}): Promise<Resultado> {
  if (!Number.isInteger(input.anio) || input.anio < 2019 || input.anio > 2100) return { error: "Año inválido." };
  if (!Number.isInteger(input.mes) || input.mes < 1 || input.mes > 12) return { error: "Mes inválido." };
  if (!CICLOS.includes(input.ciclo)) return { error: "Ciclo inválido." };
  const actividad = input.actividad.trim();
  if (actividad.length < 3 || actividad.length > 500) return { error: "Describe la actividad." };
  if (input.responsableId && !esUuid(input.responsableId)) return { error: "Responsable inválido." };
  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.from("sst_plan_actividades").insert({
    clinica_id: check.usuario.clinica_id,
    anio: input.anio,
    mes: input.mes,
    ciclo: input.ciclo,
    actividad,
    meta: textoOpcional(input.meta)?.slice(0, 300) ?? null,
    recursos: textoOpcional(input.recursos)?.slice(0, 300) ?? null,
    responsable_id: input.responsableId,
  });
  if (error) return { error: mensajeError("crearActividad", error, "No se pudo agregar la actividad.") };
  revalidar();
  return {};
}

export async function cerrarActividad(id: string, estado: "ejecutada" | "cancelada", fecha: string | null, observacion: string | null): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Actividad inválida." };
  if (estado === "ejecutada" && (!fecha || !FECHA_ISO.test(fecha) || fecha > hoyBogota())) return { error: "Escribe la fecha en que se ejecutó (no futura)." };
  if (estado === "cancelada" && (observacion ?? "").trim().length < 10) return { error: "Explica por qué se cancela (al menos 10 caracteres)." };
  const check = await requireGestion("EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_plan_actividades")
    .update({ estado, fecha_ejecucion: estado === "ejecutada" ? fecha : null, observacion: textoOpcional(observacion)?.slice(0, 2000) ?? null })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return { error: mensajeError("cerrarActividad", error, "No se pudo actualizar.") };
  if (!data?.length) return { error: "Solo se actualiza una actividad pendiente." };
  revalidar();
  return {};
}

const ROLES = ["principal", "suplente", "presidente", "secretario", "vigia"];
const PARTES = ["empleador", "trabajadores"];

export async function conformarComite(input: {
  id: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  integrantes: { nombre: string; representa: string; rol: string }[];
  actaPath: string | null;
  actaNombre: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Comité inválido." };
  if (!["vigia", "copasst", "convivencia"].includes(input.tipo)) return { error: "Tipo de comité inválido." };
  if (!FECHA_ISO.test(input.fechaInicio) || !FECHA_ISO.test(input.fechaFin)) return { error: "Escribe las fechas del periodo." };
  if (input.fechaInicio > hoyBogota()) return { error: "El periodo no puede empezar en el futuro." };
  if (input.fechaFin <= input.fechaInicio) return { error: "El fin del periodo debe ser posterior al inicio." };
  const integrantes = input.integrantes
    .map((i) => ({ nombre: i.nombre.trim().slice(0, 200), representa: i.representa, rol: i.rol }))
    .filter((i) => i.nombre.length > 0);
  if (integrantes.length === 0 || integrantes.length > 30) return { error: "Registra a los integrantes." };
  if (integrantes.some((i) => !ROLES.includes(i.rol) || !PARTES.includes(i.representa))) return { error: "Revisa el rol de cada integrante." };

  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  let acta: { path: string; nombre: string } | null = null;
  if (input.actaPath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "actas", input.id, input.actaPath, input.actaNombre ?? "acta", "sst");
    if ("error" in v) return { error: v.error };
    acta = { path: v.path, nombre: v.nombre };
  }
  const { error } = await supabase.from("sst_comites").insert({
    id: input.id,
    clinica_id: check.usuario.clinica_id,
    tipo: input.tipo,
    fecha_inicio: input.fechaInicio,
    fecha_fin: input.fechaFin,
    integrantes,
    acta_storage_path: acta?.path ?? null,
    acta_nombre_archivo: acta?.nombre ?? null,
  });
  if (error) return { error: mensajeError("conformarComite", error, "No se pudo registrar el comité.") };
  revalidar();
  return {};
}

export async function registrarReunion(input: {
  id: string;
  comiteId: string;
  fecha: string;
  temas: string;
  compromisos: string | null;
  actaPath: string | null;
  actaNombre: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id) || !esUuid(input.comiteId)) return { error: "Reunión inválida." };
  if (!FECHA_ISO.test(input.fecha) || input.fecha > hoyBogota()) return { error: "Escribe la fecha de la reunión (no futura)." };
  const temas = input.temas.trim();
  if (temas.length < 3) return { error: "Escribe los temas tratados." };
  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  let acta: { path: string; nombre: string } | null = null;
  if (input.actaPath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "actas", input.id, input.actaPath, input.actaNombre ?? "acta", "sst");
    if ("error" in v) return { error: v.error };
    acta = { path: v.path, nombre: v.nombre };
  }
  const { error } = await supabase.from("sst_comite_reuniones").insert({
    id: input.id,
    clinica_id: check.usuario.clinica_id,
    comite_id: input.comiteId,
    fecha: input.fecha,
    temas: temas.slice(0, 4000),
    compromisos: textoOpcional(input.compromisos)?.slice(0, 4000) ?? null,
    acta_storage_path: acta?.path ?? null,
    acta_nombre_archivo: acta?.nombre ?? null,
  });
  if (error) return { error: mensajeError("registrarReunion", error, "No se pudo registrar la reunión.") };
  revalidar();
  return {};
}

export async function urlActa(tabla: "comite" | "reunion", id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Acta inválida." };
  const check = await requirePermiso("sst", "VIEW");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase
    .from(tabla === "comite" ? "sst_comites" : "sst_comite_reuniones")
    .select("acta_storage_path, acta_nombre_archivo")
    .eq("id", id)
    .maybeSingle();
  if (!data?.acta_storage_path) return { error: "No hay acta cargada." };
  return firmar(supabase, data.acta_storage_path, data.acta_nombre_archivo, "sst");
}
