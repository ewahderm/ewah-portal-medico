"use server";

// Autoevaluación por estándar (Etapa 4, HU-4.2 a HU-4.5). Cada action
// empieza por requireHabilitacion(permiso, { gestion: true }); la RLS, los
// triggers y la RPC fn_hab_evaluar de 0066 vuelven a exigir todo (permiso,
// plan, misma clínica, criterio aplicable a la sede, evidencia para
// "Cumple", append-only). Aquí solo se valida la forma y se traducen los
// errores a mensajes claros. Ninguna action recibe clinica_id.

import { createClient } from "@/lib/supabase/server";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import {
  ESTADOS_EVALUACION,
  FUENTES_EVIDENCIA,
  type FuenteEvidencia,
  MAX_JUSTIFICACION,
  MAX_OBSERVACION,
  MIN_JUSTIFICACION_NO_APLICA,
  MIN_MOTIVO_RETIRO,
  type EstadoEvaluacion,
} from "@/lib/habilitacion/constantes";
import {
  FECHA_ISO,
  esUuid,
  firmar,
  mensajeError,
  revalidar,
  textoForm,
  textoOpcional,
  verificarArchivoSubido,
  type Supabase,
} from "@/lib/habilitacion/servidor";
import type {
  DetalleCriterio,
  Evidencia,
  EvaluacionHistorial,
  PlanMejora,
  ProtocoloVigente,
  ResumenEvidencia,
  SugerenciaEvidencia,
} from "@/lib/habilitacion/tipos";

type Resultado = { error?: string };
const texto = textoForm;

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
  const [evidencias, historial, planes, sugeridas] = await Promise.all([
    supabase
      .from("hab_evidencias")
      .select(
        "id, tipo, fuente_codigo, tipo_documento_normativo_id, sugerida_por_sistema, descripcion, nombre_archivo, mime, tamano_bytes, url, created_at, created_by, retirada_en, retiro_motivo",
      )
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
    supabase
      .from("hab_criterio_fuentes_sugeridas")
      .select("fuente_codigo, nota, tipo_documento_normativo_id, tipos_documento_normativo(nombre)")
      .eq("criterio_id", criterioId),
  ]);
  const error = evidencias.error ?? historial.error ?? planes.error;
  if (error) return { error: mensajeError("obtenerDetalleCriterio", error, "No se pudo cargar el detalle del criterio.") };

  const lista = (evidencias.data ?? []) as Evidencia[];
  const activas = lista.filter((e) => !e.retirada_en);
  type FilaSugerida = {
    fuente_codigo: FuenteEvidencia | null;
    nota: string | null;
    tipo_documento_normativo_id: string | null;
    tipos_documento_normativo: { nombre: string } | null;
  };
  const filasSugeridas = (sugeridas.data ?? []) as unknown as FilaSugerida[];

  // Fuentes a resumir: las sugeridas + las ya usadas como evidencia.
  const fuentes = new Set<FuenteEvidencia>();
  for (const f of filasSugeridas) if (f.fuente_codigo) fuentes.add(f.fuente_codigo);
  for (const e of lista) if (e.fuente_codigo) fuentes.add(e.fuente_codigo);
  const resumenes: Partial<Record<FuenteEvidencia, ResumenEvidencia>> = {};
  await Promise.all(
    [...fuentes].map(async (fuente) => {
      const r = await resumirFuente(supabase, fuente, sedeId);
      if (r) resumenes[fuente] = r;
    }),
  );

  // Protocolos: los sugeridos + los usados como evidencia.
  const tiposProtocolo = new Set<string>();
  for (const f of filasSugeridas) if (f.tipo_documento_normativo_id) tiposProtocolo.add(f.tipo_documento_normativo_id);
  for (const e of lista) if (e.tipo_documento_normativo_id) tiposProtocolo.add(e.tipo_documento_normativo_id);
  const protocolos: Record<string, ProtocoloVigente | null> = {};
  const nombresProtocolo: Record<string, string> = {};
  if (tiposProtocolo.size > 0) {
    const [{ data: vigentes }, { data: tipos }] = await Promise.all([
      supabase
        .from("hab_protocolos_vigentes")
        .select("id, tipo_documento_id, nombre, version, nombre_archivo, vigente_desde, created_at")
        .in("tipo_documento_id", [...tiposProtocolo]),
      supabase.from("tipos_documento_normativo").select("id, nombre").in("id", [...tiposProtocolo]),
    ]);
    for (const t of tipos ?? []) {
      nombresProtocolo[t.id] = t.nombre;
      protocolos[t.id] = null;
    }
    for (const v of (vigentes ?? []) as ProtocoloVigente[]) protocolos[v.tipo_documento_id] = v;
  }

  const sugerencias: SugerenciaEvidencia[] = filasSugeridas.map((f) =>
    f.fuente_codigo
      ? {
          clase: "fuente" as const,
          fuente: f.fuente_codigo,
          nota: f.nota,
          resumen: resumenes[f.fuente_codigo] ?? null,
          enUso: activas.some((e) => e.fuente_codigo === f.fuente_codigo),
        }
      : {
          clase: "protocolo" as const,
          tipoId: f.tipo_documento_normativo_id!,
          nombre: f.tipos_documento_normativo?.nombre ?? nombresProtocolo[f.tipo_documento_normativo_id!] ?? "Protocolo",
          vigente: protocolos[f.tipo_documento_normativo_id!] ?? null,
          enUso: activas.some((e) => e.tipo_documento_normativo_id === f.tipo_documento_normativo_id),
        },
  );

  return {
    detalle: {
      evidencias: lista,
      historial: (historial.data ?? []) as EvaluacionHistorial[],
      planes: (planes.data ?? []) as PlanMejora[],
      sugerencias,
      resumenes,
      protocolos,
      nombresProtocolo,
    },
  };
}

// ============================================================
// Evidencia de otros módulos (F6, §6): resumen vivo + referencia
// ============================================================
async function resumirFuente(supabase: Supabase, fuente: FuenteEvidencia, sedeId: string): Promise<ResumenEvidencia | null> {
  const { data, error } = await supabase.rpc("fn_hab_resumen_evidencia", { p_fuente: fuente, p_sede_id: sedeId, p_parametros: {} });
  if (error) {
    console.error(`[habilitacion] fn_hab_resumen_evidencia ${fuente}`, error);
    return null;
  }
  return data as ResumenEvidencia;
}

function esFuente(v: string): v is FuenteEvidencia {
  return FUENTES_EVIDENCIA.some((f) => f.value === v);
}

// "Usar como evidencia": crea la REFERENCIA (no copia el dato). La
// sugerencia del sistema nunca cambia el estado del criterio: el
// responsable decide Cumple / No cumple (HU-4.7).
export async function usarFuenteComoEvidencia(sedeId: string, criterioId: string, fuente: string): Promise<Resultado> {
  if (!esUuid(sedeId) || !esUuid(criterioId)) return { error: "Criterio inválido." };
  if (!esFuente(fuente)) return { error: "Fuente inválida." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const etiqueta = FUENTES_EVIDENCIA.find((f) => f.value === fuente)!;
  const { error } = await supabase.from("hab_evidencias").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: sedeId,
    criterio_id: criterioId,
    tipo: "registro_modulo",
    fuente_codigo: fuente,
    descripcion: `${etiqueta.label} (${etiqueta.modulo}) — resumen vivo`,
    sugerida_por_sistema: true,
    created_by: check.usuario.id,
  });
  if (error) return { error: mensajeError("usarFuenteComoEvidencia", error, "No se pudo agregar la evidencia.") };

  revalidar();
  return {};
}

export async function usarProtocoloComoEvidencia(sedeId: string, criterioId: string, tipoId: string): Promise<Resultado> {
  if (!esUuid(sedeId) || !esUuid(criterioId) || !esUuid(tipoId)) return { error: "Protocolo inválido." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: tipo } = await supabase.from("tipos_documento_normativo").select("nombre").eq("id", tipoId).maybeSingle();
  const { error } = await supabase.from("hab_evidencias").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: sedeId,
    criterio_id: criterioId,
    tipo: "documento_normativo",
    tipo_documento_normativo_id: tipoId,
    descripcion: `Protocolo: ${tipo?.nombre ?? "de habilitación"} (siempre la versión vigente)`,
    sugerida_por_sistema: true,
    created_by: check.usuario.id,
  });
  if (error) return { error: mensajeError("usarProtocoloComoEvidencia", error, "No se pudo agregar la evidencia.") };

  revalidar();
  return {};
}

// Carga una versión nueva de un protocolo de habilitación. El archivo ya
// subió con prepararSubida("protocolos", tipoId, ext); la versión la pone
// la BD (0067) y las versiones anteriores no se borran.
export async function registrarVersionProtocolo(tipoId: string, storagePath: string, nombreArchivo: string): Promise<Resultado> {
  if (!esUuid(tipoId)) return { error: "Protocolo inválido." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const subido = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "protocolos", tipoId, storagePath, nombreArchivo);
  if ("error" in subido) return { error: subido.error };

  const { error } = await supabase.from("documentos_normativos").insert({
    clinica_id: check.usuario.clinica_id,
    tipo_documento_id: tipoId,
    version: 1, // la reemplaza el trigger fn_hab_version_siguiente
    storage_path: subido.path,
    nombre_archivo: subido.nombre,
    created_by: check.usuario.id,
  });
  if (error) return { error: mensajeError("registrarVersionProtocolo", error, "No se pudo registrar el protocolo.") };

  revalidar();
  return {};
}

export async function urlProtocoloVigente(tipoId: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(tipoId)) return { error: "Protocolo inválido." };
  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data } = await supabase
    .from("hab_protocolos_vigentes")
    .select("storage_path, nombre_archivo")
    .eq("tipo_documento_id", tipoId)
    .maybeSingle();
  if (!data?.storage_path) return { error: "Ese protocolo todavía no se ha cargado." };
  return firmar(supabase, data.storage_path, data.nombre_archivo);
}
