"use server";

// Obligaciones de reporte, sus fechas (ocurrencias) y novedades del REPS
// (Etapa 5, HU-5.1 a HU-5.5). Las fechas las genera la BD (0069) con el
// mismo cálculo que el cron; aquí nunca se calcula una fecha límite. La BD
// vuelve a exigir: transiciones de estado, prueba para "presentado", que lo
// presentado no se edite, anular por RPC. EWAH no radica nada ante el
// Estado: guarda la fecha, el radicado y el acuse que digita el usuario.

import { createClient } from "@/lib/supabase/server";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import { MAX_OBSERVACION } from "@/lib/habilitacion/constantes";
import {
  FECHA_ISO,
  esUuid,
  firmar,
  hoyBogota,
  mensajeError,
  revalidar,
  textoOpcional,
  verificarArchivoSubido,
} from "@/lib/habilitacion/servidor";

type Resultado = { error?: string };
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ------------------------------------------------------------
// Configuración por clínica (HU-5.1 AC3, D6)
// ------------------------------------------------------------
export async function configurarObligacion(input: {
  id: string;
  activa: boolean;
  confirmada: boolean;
  justificacion: string | null;
  fechaConsultaAsesor: string | null;
  diasAviso: number[] | null;
  responsableId: string | null;
  correoAdicional: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Obligación inválida." };
  const justificacion = textoOpcional(input.justificacion);
  if (justificacion && (justificacion.length < 10 || justificacion.length > 2000)) return { error: "La justificación debe tener entre 10 y 2.000 caracteres." };
  if (input.fechaConsultaAsesor && (!FECHA_ISO.test(input.fechaConsultaAsesor) || input.fechaConsultaAsesor > hoyBogota())) {
    return { error: "La fecha de consulta con el asesor no es válida." };
  }
  if (input.diasAviso && (input.diasAviso.length === 0 || input.diasAviso.length > 10 || input.diasAviso.some((d) => !Number.isInteger(d) || d < 0 || d > 365))) {
    return { error: "Los días de aviso deben ser números entre 0 y 365 (máximo 10)." };
  }
  if (input.responsableId && !esUuid(input.responsableId)) return { error: "Responsable inválido." };
  const correo = textoOpcional(input.correoAdicional);
  if (correo && (!CORREO.test(correo) || correo.length > 254)) return { error: "El correo adicional no es válido." };

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("hab_obligaciones_clinica").select("aplica_segun_perfil").eq("id", input.id).maybeSingle();
  if (!actual) return { error: "Obligación inválida." };
  // D6 / AC3: apartarse de lo que dice el perfil exige justificar (la BD lo
  // vuelve a exigir con un check).
  if (input.activa !== actual.aplica_segun_perfil && !justificacion) {
    return {
      error: input.activa
        ? "Explica por qué la activas si según tu perfil no te aplica (al menos 10 caracteres)."
        : "Explica por qué la desactivas (al menos 10 caracteres). Si lo consultaste con tu asesor, anota la fecha.",
    };
  }

  const { error } = await supabase
    .from("hab_obligaciones_clinica")
    .update({
      activa: input.activa,
      confirmada: input.confirmada,
      // Si vuelve a coincidir con el perfil, la decisión deja de ser una
      // excepción: se limpia para que el sincronizador vuelva a mandar.
      justificacion: input.activa === actual.aplica_segun_perfil ? null : justificacion,
      fecha_consulta_asesor: input.fechaConsultaAsesor,
      dias_aviso: input.diasAviso,
      responsable_id: input.responsableId,
      correo_adicional: correo,
    })
    .eq("id", input.id);
  if (error) return { error: mensajeError("configurarObligacion", error, "No se pudo guardar la configuración.") };

  // Activar / desactivar cambia las fechas: se regeneran en la BD.
  const { error: eRecalculo } = await supabase.rpc("fn_hab_recalcular_mis_obligaciones");
  if (eRecalculo) console.error("[habilitacion] recalcular tras configurar", eRecalculo);
  revalidar();
  return {};
}

// Botón "Recalcular" (transparencia). EDIT sin gestión: rehace lo que el
// perfil ya determina (el perfil se edita en todos los planes).
export async function recalcularObligaciones(): Promise<Resultado> {
  const check = await requireHabilitacion("EDIT", { gestion: false });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_hab_recalcular_mis_obligaciones");
  if (error) return { error: mensajeError("recalcularObligaciones", error, "No se pudieron recalcular las fechas.") };
  revalidar();
  return {};
}

// ------------------------------------------------------------
// Ocurrencias (HU-5.2 / HU-5.3)
// ------------------------------------------------------------
async function verificarAcuse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicaId: string,
  entidadId: string,
  storagePath: string | null,
  nombre: string | null,
) {
  if (!storagePath) return { archivo: null };
  const v = await verificarArchivoSubido(supabase, clinicaId, "obligaciones", entidadId, storagePath, nombre ?? "");
  if ("error" in v) return { error: v.error };
  return { archivo: v };
}

export async function presentarOcurrencia(input: {
  id: string;
  fechaPresentacion: string;
  radicado: string | null;
  observacion: string | null;
  storagePath: string | null;
  nombreArchivo: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Obligación inválida." };
  if (!FECHA_ISO.test(input.fechaPresentacion) || input.fechaPresentacion > hoyBogota()) return { error: "La fecha de presentación no puede ser futura." };
  const radicado = textoOpcional(input.radicado);
  const observacion = textoOpcional(input.observacion);
  if (radicado && radicado.length > 100) return { error: "El radicado es demasiado largo." };
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };
  if (!radicado && !input.storagePath) return { error: "Escribe el número de radicado o adjunta el acuse: sin prueba no queda como presentada." };

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const acuse = await verificarAcuse(supabase, check.usuario.clinica_id, input.id, input.storagePath, input.nombreArchivo);
  if (acuse.error) return { error: acuse.error };

  const { data, error } = await supabase
    .from("hab_obligacion_ocurrencias")
    .update({
      estado: "presentado",
      fecha_presentacion: input.fechaPresentacion,
      radicado,
      observacion,
      storage_path: acuse.archivo?.path ?? null,
      nombre_archivo: acuse.archivo?.nombre ?? null,
      mime: acuse.archivo?.mime ?? null,
      tamano_bytes: acuse.archivo?.tamano ?? null,
    })
    .eq("id", input.id)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return { error: mensajeError("presentarOcurrencia", error, "No se pudo registrar la presentación.") };
  if (!data?.length) return { error: "Esta obligación ya no está pendiente." };
  revalidar();
  return {};
}

export async function noAplicaPeriodo(id: string, justificacion: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Obligación inválida." };
  const j = (justificacion ?? "").trim();
  if (j.length < 10 || j.length > 2000) return { error: "Explica por qué no aplica en este periodo (al menos 10 caracteres)." };
  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hab_obligacion_ocurrencias")
    .update({ estado: "no_aplica_periodo", justificacion: j })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return { error: mensajeError("noAplicaPeriodo", error, "No se pudo guardar.") };
  if (!data?.length) return { error: "Esta obligación ya no está pendiente." };
  revalidar();
  return {};
}

// Anular = la corrección (HU-5.3 AC3): si estaba presentada, la BD reabre
// el periodo con una pendiente nueva que apunta a la anulada.
export async function anularOcurrencia(id: string, motivo: string): Promise<Resultado & { nuevaId?: string | null }> {
  if (!esUuid(id)) return { error: "Obligación inválida." };
  const check = await requireHabilitacion("VOID", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_hab_anular_ocurrencia", { p_id: id, p_motivo: (motivo ?? "").trim() });
  if (error) return { error: mensajeError("anularOcurrencia", error, "No se pudo anular.") };
  revalidar();
  return { nuevaId: (data as string | null) ?? null };
}

// Obligaciones sin calendario (RIPS, SIVIGILA, novedades…): el usuario
// registra un envío ya hecho, con su prueba.
export async function registrarEnvio(input: {
  id: string; // uuid generado en el cliente (carpeta del acuse)
  obligacionId: string;
  fechaPresentacion: string;
  radicado: string | null;
  observacion: string | null;
  storagePath: string | null;
  nombreArchivo: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id) || !esUuid(input.obligacionId)) return { error: "Obligación inválida." };
  if (!FECHA_ISO.test(input.fechaPresentacion) || input.fechaPresentacion > hoyBogota()) return { error: "La fecha de presentación no puede ser futura." };
  const radicado = textoOpcional(input.radicado);
  const observacion = textoOpcional(input.observacion);
  if (radicado && radicado.length > 100) return { error: "El radicado es demasiado largo." };
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };
  if (!radicado && !input.storagePath) return { error: "Escribe el número de radicado o adjunta el acuse." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };
  const editar = await requireHabilitacion("EDIT", { gestion: true });
  if (!editar.ok) return { error: editar.error };
  const supabase = await createClient();
  const acuse = await verificarAcuse(supabase, check.usuario.clinica_id, input.id, input.storagePath, input.nombreArchivo);
  if (acuse.error) return { error: acuse.error };

  const { error } = await supabase.from("hab_obligacion_ocurrencias").insert({
    id: input.id,
    clinica_id: check.usuario.clinica_id,
    obligacion_id: input.obligacionId,
    origen: "manual",
    clave_periodo: `envio-${input.id}`,
    etiqueta_periodo: "envío registrado",
    fecha_limite: input.fechaPresentacion,
    generada_por: "usuario",
    estado: "presentado",
    fecha_presentacion: input.fechaPresentacion,
    radicado,
    observacion,
    storage_path: acuse.archivo?.path ?? null,
    nombre_archivo: acuse.archivo?.nombre ?? null,
    mime: acuse.archivo?.mime ?? null,
    tamano_bytes: acuse.archivo?.tamano ?? null,
  });
  if (error) return { error: mensajeError("registrarEnvio", error, "No se pudo registrar el envío.") };
  revalidar();
  return {};
}

export async function urlAcuse(id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Obligación inválida." };
  const check = await requireHabilitacion("VIEW", { gestion: false });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase.from("hab_obligacion_ocurrencias").select("storage_path, nombre_archivo").eq("id", id).maybeSingle();
  if (!data?.storage_path) return { error: "No tiene acuse adjunto." };
  return firmar(supabase, data.storage_path, data.nombre_archivo);
}

// ------------------------------------------------------------
// Novedades del REPS (HU-5.5)
// ------------------------------------------------------------
export async function registrarNovedad(input: {
  carpetaId: string; // uuid generado en el cliente (carpeta del soporte)
  novedadId: string;
  fechaReporte: string;
  sedeId: string | null;
  servicioId: string | null;
  radicado: string | null;
  observacion: string | null;
  storagePath: string | null;
  nombreArchivo: string | null;
}): Promise<Resultado & { sugerirAltaServicio?: boolean }> {
  if (!esUuid(input.carpetaId) || !esUuid(input.novedadId)) return { error: "Novedad inválida." };
  if (!FECHA_ISO.test(input.fechaReporte)) return { error: "Escribe la fecha del reporte." };
  if ((input.sedeId && !esUuid(input.sedeId)) || (input.servicioId && !esUuid(input.servicioId))) return { error: "Sede o servicio inválido." };
  const radicado = textoOpcional(input.radicado);
  const observacion = textoOpcional(input.observacion);
  if (radicado && radicado.length > 100) return { error: "El radicado es demasiado largo." };
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  let archivo: { path: string; nombre: string; mime: string; tamano: number } | null = null;
  if (input.storagePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "novedades", input.carpetaId, input.storagePath, input.nombreArchivo ?? "");
    if ("error" in v) return { error: v.error };
    archivo = v;
  }

  const { error } = await supabase.rpc("fn_hab_registrar_novedad", {
    p_novedad_id: input.novedadId,
    p_fecha_reporte: input.fechaReporte,
    p_sede_id: input.sedeId,
    p_servicio_id: input.servicioId,
    p_radicado: radicado,
    p_observacion: observacion,
    p_storage_path: archivo?.path ?? null,
    p_nombre_archivo: archivo?.nombre ?? null,
    p_mime: archivo?.mime ?? null,
    p_tamano_bytes: archivo?.tamano ?? null,
  });
  if (error) return { error: mensajeError("registrarNovedad", error, "No se pudo registrar la novedad.") };

  const { data: cat } = await supabase.from("hab_novedades_catalogo").select("efecto").eq("id", input.novedadId).maybeSingle();
  revalidar();
  return { sugerirAltaServicio: cat?.efecto === "sugerir_alta_servicio" };
}

export async function anularNovedad(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Novedad inválida." };
  const check = await requireHabilitacion("VOID", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_hab_anular_novedad", { p_id: id, p_motivo: (motivo ?? "").trim() });
  if (error) return { error: mensajeError("anularNovedad", error, "No se pudo anular la novedad.") };
  revalidar();
  return {};
}

export async function urlNovedad(id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Novedad inválida." };
  const check = await requireHabilitacion("VIEW", { gestion: false });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase.from("hab_novedades_reportadas").select("storage_path, nombre_archivo").eq("id", id).maybeSingle();
  if (!data?.storage_path) return { error: "No tiene soporte adjunto." };
  return firmar(supabase, data.storage_path, data.nombre_archivo);
}
