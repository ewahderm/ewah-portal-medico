"use server";

// Capacitación, EPP y profesiograma (SG-SST F6). La BD (0076) protege lo
// realizado y lo entregado (no se modifica; se cancela o anula con motivo)
// y verifica que cada persona y cargo sean de la clínica.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { FECHA_ISO, esUuid, firmar, hoyBogota, mensajeError, textoOpcional, verificarArchivoSubido } from "@/lib/habilitacion/servidor";
import { TIPOS_CAPACITACION } from "@/lib/sst/personas";

type Resultado = { error?: string };

async function requireGestion(permiso: string) {
  const check = await requirePermiso("sst", permiso);
  if (!check.ok) return check;
  const plan = await requireEntitlement("sst", "gestion");
  if (!plan.ok) return { ok: false as const, error: "Esta sección del SG-SST está disponible en el plan Pro." };
  return check;
}

const revalidar = () => revalidatePath("/sst", "layout");

export async function guardarCapacitacion(input: {
  id: string;
  tema: string;
  tipo: string;
  fecha: string;
  duracionHoras: number | null;
  facilitador: string | null;
  modalidad: string;
  realizada: boolean;
  asistentes: string[];
  soportePath: string | null;
  soporteNombre: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Capacitación inválida." };
  const tema = input.tema.trim();
  if (tema.length < 3 || tema.length > 300) return { error: "Escribe el tema." };
  if (!TIPOS_CAPACITACION.some((t) => t.value === input.tipo)) return { error: "Tipo inválido." };
  if (!FECHA_ISO.test(input.fecha)) return { error: "Escribe la fecha." };
  if (input.realizada && input.fecha > hoyBogota()) return { error: "Una capacitación futura no puede marcarse como realizada." };
  if (input.modalidad !== "presencial" && input.modalidad !== "virtual") return { error: "Modalidad inválida." };
  if (input.duracionHoras !== null && !(input.duracionHoras > 0 && input.duracionHoras <= 200)) return { error: "Duración inválida." };
  if (input.asistentes.length > 500 || input.asistentes.some((a) => !esUuid(a))) return { error: "Asistentes inválidos." };
  if (input.realizada && input.asistentes.length === 0) return { error: "Marca quiénes asistieron." };

  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();

  const { data: existente, error: errorExistente } = await supabase.from("sst_capacitaciones").select("id, estado").eq("id", input.id).maybeSingle();
  if (errorExistente) {
    console.error("[sst] guardarCapacitacion: leer la capacitación existente", errorExistente);
    return { error: "No se pudo verificar la capacitación. Intenta de nuevo." };
  }
  if (existente && existente.estado !== "programada") return { error: "Esta capacitación ya está cerrada." };
  // Marcarla realizada y quitar asistentes se hacen con UPDATE/DELETE: piden EDIT.
  if (existente || input.realizada) {
    const editar = await requireGestion("EDIT");
    if (!editar.ok) return { error: editar.error };
  }

  let soporte: { path: string; nombre: string } | null = null;
  if (input.soportePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "personas", input.id, input.soportePath, input.soporteNombre ?? "asistencia", "sst");
    if ("error" in v) return { error: v.error };
    soporte = { path: v.path, nombre: v.nombre };
  }

  const datos = {
    tema,
    tipo: input.tipo,
    fecha: input.fecha,
    duracion_horas: input.duracionHoras,
    facilitador: textoOpcional(input.facilitador)?.slice(0, 200) ?? null,
    modalidad: input.modalidad,
    // Siempre "programada" aquí: pasa a "realizada" dentro de la misma
    // transacción que guarda la asistencia (fn_sst_guardar_asistencia, 0087).
    // Si la asistencia falla queda programada y se puede reintentar.
    estado: "programada",
    ...(soporte ? { soporte_storage_path: soporte.path, soporte_nombre_archivo: soporte.nombre } : {}),
  };
  const r = existente
    ? await supabase.from("sst_capacitaciones").update(datos).eq("id", input.id)
    : await supabase.from("sst_capacitaciones").insert({ ...datos, id: input.id, clinica_id: check.usuario.clinica_id });
  if (r.error) return { error: mensajeError("guardarCapacitacion", r.error, "No se pudo guardar la capacitación.") };

  // La lista queda igual a la enviada (agrega y quita) y, si corresponde,
  // la capacitación pasa a realizada: todo o nada.
  const { error } = await supabase.rpc("fn_sst_guardar_asistencia", {
    p_capacitacion_id: input.id,
    p_asistentes: [...new Set(input.asistentes)],
    p_realizada: input.realizada,
  });
  if (error) {
    return { error: mensajeError("asistencia", error, "Se guardó la capacitación como programada pero no la asistencia. Vuelve a guardarla para completarla.") };
  }
  revalidar();
  return {};
}

export async function cancelarCapacitacion(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Capacitación inválida." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se cancela (al menos 10 caracteres)." };
  const check = await requireGestion("EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_capacitaciones")
    .update({ estado: "cancelada", motivo_cancelacion: motivo.trim().slice(0, 2000) })
    .eq("id", id)
    .eq("estado", "programada")
    .select("id");
  if (error) return { error: mensajeError("cancelarCapacitacion", error, "No se pudo cancelar.") };
  if (!data?.length) return { error: "Solo se cancela una capacitación programada." };
  revalidar();
  return {};
}

export async function registrarEntregaEpp(input: {
  id: string;
  empleadoId: string;
  fecha: string;
  elementos: { elemento: string; cantidad: number }[];
  capacitadoUso: boolean;
  observacion: string | null;
  soportePath: string | null;
  soporteNombre: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id) || !esUuid(input.empleadoId)) return { error: "Elige la persona." };
  if (!FECHA_ISO.test(input.fecha) || input.fecha > hoyBogota()) return { error: "Escribe la fecha de entrega (no futura)." };
  const elementos = input.elementos
    .map((e) => ({ elemento: e.elemento.trim().slice(0, 120), cantidad: Math.trunc(e.cantidad) }))
    .filter((e) => e.elemento.length > 0);
  if (elementos.length === 0 || elementos.length > 30) return { error: "Agrega al menos un elemento entregado." };
  if (elementos.some((e) => !(e.cantidad >= 1 && e.cantidad <= 10000))) return { error: "Las cantidades deben ser números enteros positivos." };

  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  let soporte: { path: string; nombre: string } | null = null;
  if (input.soportePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "personas", input.id, input.soportePath, input.soporteNombre ?? "entrega", "sst");
    if ("error" in v) return { error: v.error };
    soporte = { path: v.path, nombre: v.nombre };
  }
  const { error } = await supabase.from("sst_epp_entregas").insert({
    id: input.id,
    clinica_id: check.usuario.clinica_id,
    empleado_id: input.empleadoId,
    fecha: input.fecha,
    elementos,
    capacitado_uso: input.capacitadoUso,
    observacion: textoOpcional(input.observacion)?.slice(0, 1000) ?? null,
    soporte_storage_path: soporte?.path ?? null,
    soporte_nombre_archivo: soporte?.nombre ?? null,
  });
  if (error) return { error: mensajeError("registrarEntregaEpp", error, "No se pudo registrar la entrega.") };
  revalidar();
  return {};
}

export async function anularEntregaEpp(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Entrega inválida." };
  if (motivo.trim().length < 10) return { error: "Explica por qué se anula (al menos 10 caracteres)." };
  const check = await requireGestion("VOID");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_epp_entregas")
    .update({ anulado: true, anulado_motivo: motivo.trim().slice(0, 2000) })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError("anularEntregaEpp", error, "No se pudo anular.") };
  if (!data?.length) return { error: "No tienes permiso para anular entregas." };
  revalidar();
  return {};
}

export async function guardarPeriodicidad(cargoId: string, meses: number | null): Promise<Resultado> {
  if (!esUuid(cargoId)) return { error: "Cargo inválido." };
  if (meses !== null && !(Number.isInteger(meses) && meses >= 1 && meses <= 36)) {
    return { error: "La periodicidad va de 1 a 36 meses (la Res. 1843 de 2025 fija como máximo 3 años)." };
  }
  const check = await requireGestion("EDIT");
  if (!check.ok) return { error: check.error };
  if (meses === null) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("sst_examenes_cargo")
    .upsert({ clinica_id: check.usuario.clinica_id, cargo_id: cargoId, periodicidad_meses: meses }, { onConflict: "cargo_id" });
  if (error) return { error: mensajeError("guardarPeriodicidad", error, "No se pudo guardar.") };
  revalidar();
  return {};
}

export async function urlSoportePersonas(tabla: "capacitacion" | "epp", id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Registro inválido." };
  const check = await requirePermiso("sst", "VIEW");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase
    .from(tabla === "capacitacion" ? "sst_capacitaciones" : "sst_epp_entregas")
    .select("soporte_storage_path, soporte_nombre_archivo")
    .eq("id", id)
    .maybeSingle();
  if (!data?.soporte_storage_path) return { error: "No hay soporte cargado." };
  return firmar(supabase, data.soporte_storage_path, data.soporte_nombre_archivo, "sst");
}
