"use server";

// Autoevaluación por estándar (Etapa 4, HU-4.2 a HU-4.5). Cada action
// empieza por requireHabilitacion(permiso, { gestion: true }); la RLS, los
// triggers y la RPC fn_hab_evaluar de 0066 vuelven a exigir todo (permiso,
// plan, misma clínica, criterio aplicable a la sede, evidencia para
// "Cumple", append-only). Aquí solo se valida la forma y se traducen los
// errores a mensajes claros. Ninguna action recibe clinica_id.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import {
  ESTADOS_EVALUACION,
  MAX_ARCHIVO_BYTES,
  MAX_JUSTIFICACION,
  MAX_OBSERVACION,
  MIN_JUSTIFICACION_NO_APLICA,
  MIN_MOTIVO_RETIRO,
  SEGUNDOS_URL_FIRMADA,
  type EstadoEvaluacion,
} from "@/lib/habilitacion/constantes";
import { detectarTipoArchivo, sha256Hex } from "@/lib/habilitacion/archivos";
import type { DetalleCriterio, Evidencia, EvaluacionHistorial, PlanMejora } from "@/lib/habilitacion/tipos";

const BUCKET = "habilitacion";
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Resultado = { error?: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;
type ErrorBd = { code?: string; message: string };

function revalidar() {
  revalidatePath("/habilitacion", "layout");
}

// Los triggers de 0066 lanzan mensajes ya escritos para el usuario
// (P0001). El resto se traduce; el detalle técnico queda en el servidor.
function mensajeError(contexto: string, error: ErrorBd, porDefecto: string): string {
  console.error(`[habilitacion] ${contexto}`, error);
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "No tienes permiso para esta acción o tu plan no la incluye.";
  if (error.message?.includes("hab_evaluaciones_no_aplica_justificada")) {
    return `Para marcar "No aplica" explica por qué (al menos ${MIN_JUSTIFICACION_NO_APLICA} caracteres).`;
  }
  if (error.code === "23514") return "Algún dato no tiene el formato esperado. Revisa el formulario.";
  return porDefecto;
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function textoOpcional(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim();
  return t ? t : null;
}

function esUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

// ============================================================
// Evaluar un criterio (HU-4.2) — RPC append-only
// ============================================================
export type EvaluarInput = {
  sedeId: string;
  criterioId: string;
  estado: EstadoEvaluacion;
  justificacion?: string | null;
  observacion?: string | null;
};

export async function evaluarCriterio(input: EvaluarInput): Promise<Resultado & { evaluacionId?: string }> {
  if (!esUuid(input.sedeId) || !esUuid(input.criterioId)) return { error: "Criterio inválido." };
  if (!ESTADOS_EVALUACION.some((e) => e.value === input.estado)) return { error: "Estado inválido." };
  const justificacion = textoOpcional(input.justificacion);
  const observacion = textoOpcional(input.observacion);
  if (justificacion && justificacion.length > MAX_JUSTIFICACION) return { error: "La justificación es demasiado larga." };
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };
  if (input.estado === "no_aplica" && (justificacion?.length ?? 0) < MIN_JUSTIFICACION_NO_APLICA) {
    return { error: `Para marcar "No aplica" explica por qué (al menos ${MIN_JUSTIFICACION_NO_APLICA} caracteres).` };
  }

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_hab_evaluar", {
    p_sede_id: input.sedeId,
    p_criterio_id: input.criterioId,
    p_estado: input.estado,
    p_justificacion: input.estado === "no_aplica" ? justificacion : null,
    p_observacion: observacion,
    p_evidencias: [],
  });
  if (error) return { error: mensajeError("evaluarCriterio", error, "No se pudo guardar la evaluación.") };

  revalidar();
  return { evaluacionId: data as string };
}

// ============================================================
// Evidencias (§1.4): archivo, nota o enlace. Cuelgan de (sede, criterio).
// ============================================================
type EvidenciaJson = {
  tipo: "archivo" | "nota" | "enlace";
  descripcion: string;
  url?: string;
  storage_path?: string;
  nombre_archivo?: string;
  mime?: string;
  tamano_bytes?: number;
  sha256?: string;
};

// ------------------------------------------------------------
// Archivos: el navegador sube DIRECTO a storage con una URL firmada que
// emite el servidor (las server actions se cortan en 1 MB y Vercel en
// 4,5 MB; las evidencias admiten 10 MB). El servidor decide la ruta (el
// nombre nunca sale del que sube el usuario, §1.5) y, antes de registrar
// la fila, descarga el objeto con la sesión y verifica tamaño y FIRMA.
// ------------------------------------------------------------
const EXTENSIONES = ["pdf", "jpg", "png", "webp", "docx", "xlsx"] as const;
type AreaArchivo = "evidencias" | "planes";

export async function prepararSubida(
  area: AreaArchivo,
  entidadId: string,
  extension: string,
): Promise<{ error?: string; path?: string; token?: string }> {
  if (area !== "evidencias" && area !== "planes") return { error: "Destino inválido." };
  if (!esUuid(entidadId)) return { error: "Destino inválido." };
  if (!(EXTENSIONES as readonly string[]).includes(extension)) return { error: "Formato no soportado." };

  const check = await requireHabilitacion(area === "planes" ? "EDIT" : "CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const path = `${check.usuario.clinica_id}/${area}/${entidadId.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[habilitacion] createSignedUploadUrl", error);
    return { error: "No se pudo preparar la subida del archivo." };
  }
  return { path: data.path, token: data.token };
}

type ArchivoVerificado = { path: string; nombre: string; mime: string; tamano: number; sha256: string };

async function verificarArchivoSubido(
  supabase: Supabase,
  clinicaId: string,
  area: AreaArchivo,
  entidadId: string,
  path: string,
  nombre: string,
): Promise<{ error: string } | ArchivoVerificado> {
  const prefijo = `${clinicaId}/${area}/${entidadId.toLowerCase()}/`;
  const resto = path.startsWith(prefijo) ? path.slice(prefijo.length) : "";
  const forma = /^[0-9a-f-]{36}\.([a-z]+)$/.exec(resto);
  if (!forma || !(EXTENSIONES as readonly string[]).includes(forma[1])) return { error: "Archivo inválido." };

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.error("[habilitacion] download", error);
    return { error: "No encontramos el archivo subido. Intenta de nuevo." };
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const tipo = detectarTipoArchivo(bytes);
  if (bytes.length === 0 || bytes.length > MAX_ARCHIVO_BYTES || !tipo || tipo.extension !== forma[1]) {
    // No hay política de delete en el bucket (ni admin): el archivo
    // inválido lo retira el service role.
    await createAdminClient().storage.from(BUCKET).remove([path]);
    return {
      error:
        bytes.length > MAX_ARCHIVO_BYTES
          ? "El archivo no puede pesar más de 10 MB."
          : "Formato no soportado. Sube un PDF, una imagen (JPG, PNG, WEBP) o un Word/Excel (.docx, .xlsx).",
    };
  }
  return {
    path,
    nombre: nombre.trim().slice(0, 255) || `archivo.${tipo.extension}`,
    mime: tipo.mime,
    tamano: bytes.length,
    sha256: await sha256Hex(bytes),
  };
}

// FormData: sedeId, criterioId, tipo, descripcion, url?, storagePath? y
// nombreArchivo? (archivo ya subido con prepararSubida),
// marcarCumple? ("1" = además evaluar "Cumple" en la misma transacción:
// es el flujo del botón Cumple cuando el criterio no tenía evidencia).
export async function agregarEvidencia(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const sedeId = texto(formData, "sedeId");
  const criterioId = texto(formData, "criterioId");
  const tipo = texto(formData, "tipo");
  const descripcion = texto(formData, "descripcion");
  const marcarCumple = formData.get("marcarCumple") === "1";
  const observacion = textoOpcional(texto(formData, "observacion"));

  if (!esUuid(sedeId) || !esUuid(criterioId)) return { error: "Criterio inválido." };
  if (tipo !== "archivo" && tipo !== "nota" && tipo !== "enlace") return { error: "Tipo de evidencia inválido." };
  if (descripcion.length < 3) return { error: "Describe la evidencia (qué es y qué demuestra)." };
  if (descripcion.length > MAX_OBSERVACION) return { error: "La descripción es demasiado larga." };
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };

  const ev: EvidenciaJson = { tipo, descripcion };
  if (tipo === "enlace") {
    const url = texto(formData, "url");
    if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) return { error: "El enlace debe empezar por https://" };
    ev.url = url;
  }
  const storagePath = texto(formData, "storagePath");
  if (tipo === "archivo" && !storagePath) return { error: "Selecciona un archivo." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };
  if (marcarCumple) {
    const puedeEvaluar = await requireHabilitacion("EDIT", { gestion: true });
    if (!puedeEvaluar.ok) return { error: puedeEvaluar.error };
  }

  const supabase = await createClient();
  if (tipo === "archivo") {
    const subido = await verificarArchivoSubido(
      supabase,
      check.usuario.clinica_id,
      "evidencias",
      criterioId,
      storagePath,
      texto(formData, "nombreArchivo"),
    );
    if ("error" in subido) return { error: subido.error };
    Object.assign(ev, {
      storage_path: subido.path,
      nombre_archivo: subido.nombre,
      mime: subido.mime,
      tamano_bytes: subido.tamano,
      sha256: subido.sha256,
    });
  }

  if (marcarCumple) {
    const { error } = await supabase.rpc("fn_hab_evaluar", {
      p_sede_id: sedeId,
      p_criterio_id: criterioId,
      p_estado: "cumple",
      p_justificacion: null,
      p_observacion: observacion,
      p_evidencias: [ev],
    });
    if (error) return { error: mensajeError("agregarEvidencia+cumple", error, "No se pudo guardar la evidencia.") };
  } else {
    const { error } = await supabase.from("hab_evidencias").insert({
      clinica_id: check.usuario.clinica_id,
      sede_id: sedeId,
      criterio_id: criterioId,
      created_by: check.usuario.id,
      ...ev,
    });
    if (error) return { error: mensajeError("agregarEvidencia", error, "No se pudo guardar la evidencia.") };
  }

  revalidar();
  return {};
}

export async function retirarEvidencia(evidenciaId: string, motivo: string): Promise<Resultado> {
  if (!esUuid(evidenciaId)) return { error: "Evidencia inválida." };
  const m = (motivo ?? "").trim();
  if (m.length < MIN_MOTIVO_RETIRO) return { error: `Explica por qué la retiras (al menos ${MIN_MOTIVO_RETIRO} caracteres).` };
  if (m.length > MAX_JUSTIFICACION) return { error: "El motivo es demasiado largo." };

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hab_evidencias")
    .update({ retirada_en: new Date().toISOString(), retirada_por: check.usuario.id, retiro_motivo: m })
    .eq("id", evidenciaId)
    .is("retirada_en", null)
    .select("id");
  if (error) return { error: mensajeError("retirarEvidencia", error, "No se pudo retirar la evidencia.") };
  if (!data?.length) return { error: "La evidencia no existe o ya fue retirada." };

  revalidar();
  return {};
}

// URL firmada de 60 s, emitida solo después de leer la fila con RLS.
export async function urlEvidencia(evidenciaId: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(evidenciaId)) return { error: "Evidencia inválida." };
  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data } = await supabase.from("hab_evidencias").select("storage_path, nombre_archivo").eq("id", evidenciaId).maybeSingle();
  if (!data?.storage_path) return { error: "El archivo no existe." };
  return firmar(supabase, data.storage_path, data.nombre_archivo);
}

async function firmar(supabase: Supabase, path: string, nombre: string | null) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SEGUNDOS_URL_FIRMADA, nombre ? { download: nombre } : undefined);
  if (error || !data) {
    console.error("[habilitacion] createSignedUrl", error);
    return { error: "No se pudo generar el enlace de descarga." };
  }
  return { url: data.signedUrl };
}

// ============================================================
// Responsable y fecha objetivo (HU-4.4)
// ============================================================
export async function asignarResponsable(input: {
  sedeId: string;
  criterioId: string;
  responsableId: string | null;
  fechaObjetivo: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.sedeId) || !esUuid(input.criterioId)) return { error: "Criterio inválido." };
  if (input.responsableId && !esUuid(input.responsableId)) return { error: "Responsable inválido." };
  if (input.fechaObjetivo && !FECHA_ISO.test(input.fechaObjetivo)) return { error: "La fecha no es válida." };

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const clave = { clinica_id: check.usuario.clinica_id, sede_id: input.sedeId, criterio_id: input.criterioId };
  const { error } =
    !input.responsableId && !input.fechaObjetivo
      ? await supabase.from("hab_criterio_asignaciones").delete().match(clave)
      : await supabase.from("hab_criterio_asignaciones").upsert(
          {
            ...clave,
            responsable_id: input.responsableId,
            fecha_objetivo: input.fechaObjetivo,
            updated_by: check.usuario.id,
          },
          { onConflict: "clinica_id,sede_id,criterio_id" },
        );
  if (error) return { error: mensajeError("asignarResponsable", error, "No se pudo guardar la asignación.") };

  revalidar();
  return {};
}

// ============================================================
// Planes de mejora (HU-4.5) — nacen de un "No cumple"
// ============================================================
export async function crearPlanMejora(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const sedeId = texto(formData, "sedeId");
  const criterioId = texto(formData, "criterioId");
  const evaluacionId = texto(formData, "evaluacionId");
  const accion = texto(formData, "accion");
  const responsableId = texto(formData, "responsableId");
  const fechaCompromiso = texto(formData, "fechaCompromiso");

  if (![sedeId, criterioId, evaluacionId].every(esUuid)) return { error: "Criterio inválido." };
  if (accion.length < 10) return { error: "Describe la acción de mejora (al menos 10 caracteres)." };
  if (accion.length > MAX_JUSTIFICACION) return { error: "La acción es demasiado larga." };
  if (!esUuid(responsableId)) return { error: "Elige el responsable." };
  if (!FECHA_ISO.test(fechaCompromiso)) return { error: "Escribe la fecha compromiso." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("hab_planes_mejora").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: sedeId,
    criterio_id: criterioId,
    evaluacion_id: evaluacionId,
    accion,
    responsable_id: responsableId,
    fecha_compromiso: fechaCompromiso,
    created_by: check.usuario.id,
  });
  if (error) return { error: mensajeError("crearPlanMejora", error, "No se pudo crear el plan de mejora.") };

  revalidar();
  return {};
}

// Cambia el estado (abierta ↔ en curso) o lo cierra con su soporte
// (observación y/o archivo). Cerrar NO cambia el criterio (AC3): la UI
// sugiere re-evaluar.
export async function actualizarPlanMejora(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const planId = texto(formData, "planId");
  const estado = texto(formData, "estado");
  const cierreObservacion = textoOpcional(texto(formData, "cierreObservacion"));
  const fechaCierre = texto(formData, "fechaCierre");
  const storagePath = texto(formData, "storagePath");

  if (!esUuid(planId)) return { error: "Plan inválido." };
  if (estado !== "abierta" && estado !== "en_curso" && estado !== "cerrada") return { error: "Estado inválido." };
  if (cierreObservacion && cierreObservacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };
  const conArchivo = storagePath !== "";
  if (estado === "cerrada") {
    if (!FECHA_ISO.test(fechaCierre)) return { error: "Escribe la fecha de cierre." };
    if ((cierreObservacion?.length ?? 0) < 10 && !conArchivo) {
      return { error: "Para cerrar el plan adjunta el soporte o describe cómo se cerró (al menos 10 caracteres)." };
    }
  }

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const cambios: Record<string, unknown> = { estado, updated_by: check.usuario.id };
  if (estado === "cerrada") {
    cambios.fecha_cierre = fechaCierre;
    cambios.cierre_observacion = cierreObservacion;
    if (conArchivo) {
      const subido = await verificarArchivoSubido(
        supabase,
        check.usuario.clinica_id,
        "planes",
        planId,
        storagePath,
        texto(formData, "nombreArchivo"),
      );
      if ("error" in subido) return { error: subido.error };
      Object.assign(cambios, {
        cierre_storage_path: subido.path,
        cierre_nombre_archivo: subido.nombre,
        cierre_mime: subido.mime,
        cierre_tamano_bytes: subido.tamano,
      });
    }
  }

  const { data, error } = await supabase.from("hab_planes_mejora").update(cambios).eq("id", planId).select("id");
  if (error) return { error: mensajeError("actualizarPlanMejora", error, "No se pudo actualizar el plan de mejora.") };
  if (!data?.length) return { error: "El plan no existe o no tienes permiso para modificarlo." };

  revalidar();
  return {};
}

export async function urlCierrePlan(planId: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(planId)) return { error: "Plan inválido." };
  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data } = await supabase
    .from("hab_planes_mejora")
    .select("cierre_storage_path, cierre_nombre_archivo")
    .eq("id", planId)
    .maybeSingle();
  if (!data?.cierre_storage_path) return { error: "El plan no tiene archivo de cierre." };
  return firmar(supabase, data.cierre_storage_path, data.cierre_nombre_archivo);
}

// ============================================================
// Detalle de un criterio (evidencias, historial, planes): se pide al abrir
// la tarjeta, no viaja con las ~250 filas del estándar.
// ============================================================
export async function obtenerDetalleCriterio(
  sedeId: string,
  criterioId: string,
): Promise<{ error?: string; detalle?: DetalleCriterio }> {
  if (!esUuid(sedeId) || !esUuid(criterioId)) return { error: "Criterio inválido." };
  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const [evidencias, historial, planes] = await Promise.all([
    supabase
      .from("hab_evidencias")
      .select("id, tipo, descripcion, nombre_archivo, mime, tamano_bytes, url, created_at, created_by, retirada_en, retiro_motivo")
      .eq("sede_id", sedeId)
      .eq("criterio_id", criterioId)
      .order("created_at", { ascending: false }),
    supabase
      .from("hab_evaluaciones")
      .select("id, estado, justificacion, observacion, fecha_verificacion, evaluado_por, created_at")
      .eq("sede_id", sedeId)
      .eq("criterio_id", criterioId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("hab_planes_mejora")
      .select("id, evaluacion_id, accion, responsable_id, fecha_compromiso, estado, cierre_nombre_archivo, cierre_observacion, fecha_cierre, created_at")
      .eq("sede_id", sedeId)
      .eq("criterio_id", criterioId)
      .order("created_at", { ascending: false }),
  ]);
  const error = evidencias.error ?? historial.error ?? planes.error;
  if (error) return { error: mensajeError("obtenerDetalleCriterio", error, "No se pudo cargar el detalle del criterio.") };

  return {
    detalle: {
      evidencias: (evidencias.data ?? []) as Evidencia[],
      historial: (historial.data ?? []) as EvaluacionHistorial[],
      planes: (planes.data ?? []) as PlanMejora[],
    },
  };
}
