"use server";

// Documentos de inscripción, trámite ante la secretaría y suficiencia
// patrimonial (Etapa 3, HU-3.1 a HU-3.5). La BD (0068) vuelve a exigir todo:
// forma del renglón según el catálogo, versión asignada por trigger, ruta
// del archivo, append-only, lectura financiera solo con EDIT. Aquí se
// valida la forma y se traducen errores. Ninguna action recibe clinica_id.

import { createClient } from "@/lib/supabase/server";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import { MAX_OBSERVACION, MIN_MOTIVO_RETIRO, TIPOS_HITO } from "@/lib/habilitacion/constantes";
import { parsePesosCO } from "@/lib/habilitacion/suficiencia";
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


// ------------------------------------------------------------
// Checklist
// ------------------------------------------------------------
type ClaveRenglon = { catalogoId: string; sedeId: string | null; servicioId: string | null };

function claveValida(k: ClaveRenglon) {
  return esUuid(k.catalogoId) && (k.sedeId === null || esUuid(k.sedeId)) && (k.servicioId === null || esUuid(k.servicioId));
}

// El renglón nace bajo demanda (al subir el primer archivo o marcar "No
// aplica"): un GET nunca escribe. Devuelve el existente si ya está.
export async function asegurarRenglon(k: ClaveRenglon): Promise<{ error?: string; id?: string }> {
  if (!claveValida(k)) return { error: "Documento inválido." };
  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const buscar = () => {
    let q = supabase.from("hab_documentos_clinica").select("id").eq("documento_catalogo_id", k.catalogoId);
    q = k.sedeId ? q.eq("sede_id", k.sedeId) : q.is("sede_id", null);
    q = k.servicioId ? q.eq("servicio_habilitado_id", k.servicioId) : q.is("servicio_habilitado_id", null);
    return q.maybeSingle();
  };
  const { data: existente } = await buscar();
  if (existente) return { id: existente.id };

  const { data, error } = await supabase
    .from("hab_documentos_clinica")
    .insert({
      clinica_id: check.usuario.clinica_id,
      documento_catalogo_id: k.catalogoId,
      sede_id: k.sedeId,
      servicio_habilitado_id: k.servicioId,
      created_by: check.usuario.id,
      updated_by: check.usuario.id,
    })
    .select("id")
    .single();
  if (error) {
    // Dos pestañas a la vez: el unique lo resolvió la otra.
    if (error.code === "23505") {
      const { data: otra } = await buscar();
      if (otra) return { id: otra.id };
    }
    return { error: mensajeError("asegurarRenglon", error, "No se pudo preparar el documento.") };
  }
  return { id: data.id };
}

export async function crearDocumentoAdicional(nombre: string, sedeId: string | null): Promise<{ error?: string; id?: string }> {
  const n = (nombre ?? "").trim();
  if (n.length < 3 || n.length > 200) return { error: "Escribe el nombre del documento (3 a 200 caracteres)." };
  if (sedeId !== null && !esUuid(sedeId)) return { error: "Sede inválida." };
  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hab_documentos_clinica")
    .insert({ clinica_id: check.usuario.clinica_id, nombre_adicional: n, sede_id: sedeId, created_by: check.usuario.id, updated_by: check.usuario.id })
    .select("id")
    .single();
  if (error) return { error: mensajeError("crearDocumentoAdicional", error, "No se pudo crear el documento.") };
  revalidar();
  return { id: data.id };
}

// El archivo ya subió con prepararSubida("documentos", documentoId, ext);
// aquí se verifica (firma y tamaño) y se registra la versión N+1.
export async function registrarVersionDocumento(input: {
  documentoId: string;
  storagePath: string;
  nombreArchivo: string;
  fechaExpedicion: string | null;
  fechaVencimiento: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.documentoId)) return { error: "Documento inválido." };
  for (const f of [input.fechaExpedicion, input.fechaVencimiento]) if (f && !FECHA_ISO.test(f)) return { error: "Alguna fecha no es válida." };
  if (input.fechaExpedicion && input.fechaExpedicion > hoyBogota()) return { error: "La fecha de expedición no puede ser futura." };
  if (input.fechaExpedicion && input.fechaVencimiento && input.fechaVencimiento < input.fechaExpedicion) {
    return { error: "La fecha de vencimiento no puede ser anterior a la de expedición." };
  }
  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const carpeta = input.storagePath.split("/")[1] === "financiero" ? "financiero" : "documentos";
  const subido = await verificarArchivoSubido(supabase, check.usuario.clinica_id, carpeta, input.documentoId, input.storagePath, input.nombreArchivo);
  if ("error" in subido) return { error: subido.error };

  const { error } = await supabase.from("hab_documento_versiones").insert({
    clinica_id: check.usuario.clinica_id,
    documento_id: input.documentoId,
    version: 1, // la reemplaza el trigger fn_hab_doc_version_siguiente
    storage_path: subido.path,
    nombre_archivo: subido.nombre,
    mime: subido.mime,
    tamano_bytes: subido.tamano,
    sha256: subido.sha256,
    fecha_expedicion: input.fechaExpedicion,
    fecha_vencimiento: input.fechaVencimiento,
    created_by: check.usuario.id,
  });
  if (error) return { error: mensajeError("registrarVersionDocumento", error, "No se pudo guardar el documento.") };
  revalidar();
  return {};
}

export async function marcarNoAplicaDocumento(k: ClaveRenglon, justificacion: string): Promise<Resultado> {
  const j = (justificacion ?? "").trim();
  if (j.length < 10 || j.length > 2000) return { error: "Explica por qué no aplica (al menos 10 caracteres)." };
  if (!claveValida(k)) return { error: "Documento inválido." };
  const editar = await requireHabilitacion("EDIT", { gestion: true });
  if (!editar.ok) return { error: editar.error };

  const renglon = await asegurarRenglon(k);
  if (renglon.error || !renglon.id) return { error: renglon.error ?? "No se pudo preparar el documento." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("hab_documentos_clinica")
    .update({ no_aplica: true, no_aplica_justificacion: j, updated_by: editar.usuario.id })
    .eq("id", renglon.id);
  if (error) return { error: mensajeError("marcarNoAplicaDocumento", error, "No se pudo guardar.") };
  revalidar();
  return {};
}

export async function quitarNoAplicaDocumento(documentoId: string): Promise<Resultado> {
  if (!esUuid(documentoId)) return { error: "Documento inválido." };
  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("hab_documentos_clinica")
    .update({ no_aplica: false, no_aplica_justificacion: null, updated_by: check.usuario.id })
    .eq("id", documentoId);
  if (error) return { error: mensajeError("quitarNoAplicaDocumento", error, "No se pudo guardar.") };
  revalidar();
  return {};
}

export async function urlVersionDocumento(versionId: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(versionId)) return { error: "Versión inválida." };
  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  // RLS: una versión financiera solo la "ve" quien tiene EDIT.
  const { data } = await supabase.from("hab_documento_versiones").select("storage_path, nombre_archivo").eq("id", versionId).maybeSingle();
  if (!data) return { error: "No tienes acceso a ese archivo." };
  return firmar(supabase, data.storage_path, data.nombre_archivo);
}

// ------------------------------------------------------------
// Trámite (HU-3.4)
// ------------------------------------------------------------
export async function registrarHito(input: {
  id: string; // uuid generado en el cliente (la carpeta del acuse lo usa)
  tipo: string;
  fecha: string;
  numero: string | null;
  observacion: string | null;
  haySubsanables: boolean;
  storagePath: string | null;
  nombreArchivo: string | null;
  fechaVencimientoReps: string | null;
}): Promise<Resultado> {
  if (!esUuid(input.id)) return { error: "Registro inválido." };
  if (!TIPOS_HITO.some((t) => t.value === input.tipo)) return { error: "Tipo de evento inválido." };
  if (!FECHA_ISO.test(input.fecha)) return { error: "Escribe la fecha." };
  if (input.fecha > hoyBogota() && input.tipo !== "visita_previa_programada") return { error: "La fecha no puede ser futura." };
  if (input.fechaVencimientoReps && !FECHA_ISO.test(input.fechaVencimientoReps)) return { error: "La fecha de vencimiento no es válida." };
  const numero = textoOpcional(input.numero);
  const observacion = textoOpcional(input.observacion);
  if (numero && numero.length > 100) return { error: "El número es demasiado largo." };
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();

  let archivo: { path: string; nombre: string; mime: string; tamano: number; sha256: string } | null = null;
  if (input.storagePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "tramite", input.id, input.storagePath, input.nombreArchivo ?? "");
    if ("error" in v) return { error: v.error };
    archivo = v;
  }

  const { error } = await supabase.rpc("fn_hab_registrar_hito", {
    p_id: input.id,
    p_tipo: input.tipo,
    p_fecha: input.fecha,
    p_numero: numero,
    p_observacion: observacion,
    p_hay_subsanables: input.tipo === "visita_realizada" ? input.haySubsanables : null,
    p_storage_path: archivo?.path ?? null,
    p_nombre_archivo: archivo?.nombre ?? null,
    p_mime: archivo?.mime ?? null,
    p_tamano_bytes: archivo?.tamano ?? null,
    p_sha256: archivo?.sha256 ?? null,
    p_fecha_vencimiento_reps: input.fechaVencimientoReps,
  });
  if (error) return { error: mensajeError("registrarHito", error, "No se pudo registrar el evento del trámite.") };
  revalidar();
  return {};
}

export async function anularHito(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Registro inválido." };
  const m = (motivo ?? "").trim();
  if (m.length < MIN_MOTIVO_RETIRO) return { error: "Explica por qué lo anulas (al menos 10 caracteres)." };
  const check = await requireHabilitacion("VOID", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hab_tramite_hitos")
    .update({ anulado: true, anulado_motivo: m })
    .eq("id", id)
    .eq("anulado", false)
    .select("id");
  if (error) return { error: mensajeError("anularHito", error, "No se pudo anular.") };
  if (!data?.length) return { error: "El registro no existe o ya estaba anulado." };
  revalidar();
  return {};
}

export async function urlHito(id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Registro inválido." };
  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase.from("hab_tramite_hitos").select("storage_path, nombre_archivo").eq("id", id).maybeSingle();
  if (!data?.storage_path) return { error: "Ese registro no tiene archivo." };
  return firmar(supabase, data.storage_path, data.nombre_archivo);
}

// ------------------------------------------------------------
// Suficiencia patrimonial (HU-3.3)
// ------------------------------------------------------------
export async function registrarSuficiencia(input: {
  fechaCorte: string;
  patrimonioTotal: string;
  capital: string;
  mercantiles360: string;
  laborales360: string;
  pasivoCorriente: string;
  observacion: string | null;
}): Promise<Resultado> {
  if (!FECHA_ISO.test(input.fechaCorte) || input.fechaCorte > hoyBogota()) return { error: "Escribe la fecha de corte de los estados financieros." };
  const cifras = {
    patrimonio_total: parsePesosCO(input.patrimonioTotal),
    capital: parsePesosCO(input.capital),
    obligaciones_mercantiles_360: parsePesosCO(input.mercantiles360),
    obligaciones_laborales_360: parsePesosCO(input.laborales360),
    pasivo_corriente: parsePesosCO(input.pasivoCorriente),
  };
  if (Object.values(cifras).some((v) => v === null)) return { error: "Revisa las cifras: escríbelas en pesos, por ejemplo 125.000.000." };
  const noNegativas = [cifras.capital, cifras.obligaciones_mercantiles_360, cifras.obligaciones_laborales_360, cifras.pasivo_corriente];
  if (noNegativas.some((v) => (v as number) < 0)) return { error: "Solo el patrimonio puede ser negativo." };
  const observacion = textoOpcional(input.observacion);
  if (observacion && observacion.length > MAX_OBSERVACION) return { error: "La observación es demasiado larga." };

  const check = await requireHabilitacion("CREATE", { gestion: true });
  if (!check.ok) return { error: check.error };
  const editar = await requireHabilitacion("EDIT", { gestion: true });
  if (!editar.ok) return { error: "La suficiencia patrimonial es información financiera: necesitas permiso de edición." };

  const supabase = await createClient();
  const { error } = await supabase.from("hab_suficiencia_patrimonial").insert({
    clinica_id: check.usuario.clinica_id,
    fecha_corte: input.fechaCorte,
    ...cifras,
    observacion,
    created_by: check.usuario.id,
  });
  if (error) return { error: mensajeError("registrarSuficiencia", error, "No se pudieron guardar las cifras.") };
  revalidar();
  return {};
}

export async function anularSuficiencia(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Registro inválido." };
  const m = (motivo ?? "").trim();
  if (m.length < MIN_MOTIVO_RETIRO) return { error: "Explica por qué lo anulas (al menos 10 caracteres)." };
  const check = await requireHabilitacion("VOID", { gestion: true });
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hab_suficiencia_patrimonial")
    .update({ anulado: true, anulado_motivo: m })
    .eq("id", id)
    .eq("anulado", false)
    .select("id");
  if (error) return { error: mensajeError("anularSuficiencia", error, "No se pudo anular.") };
  if (!data?.length) return { error: "El registro no existe o ya estaba anulado." };
  revalidar();
  return {};
}
