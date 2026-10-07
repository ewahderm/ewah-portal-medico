"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { esAdministrador } from "@/lib/auth/session";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso() {
  return requirePermisoBase("rrhh", "CREATE");
}

export async function subirDocumentoNormativo(formData: FormData): Promise<ResultadoAccion> {
  const tipoDocumentoId = String(formData.get("tipoDocumentoId") ?? "");
  if (!tipoDocumentoId) return { error: "Selecciona el tipo de documento." };

  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Selecciona un archivo." };
  if (archivo.size > 10 * 1024 * 1024) return { error: "El archivo no puede pesar más de 10 MB." };

  const supabase = await createClient();

  const { data: ultima } = await supabase
    .from("documentos_normativos")
    .select("version")
    .eq("clinica_id", check.usuario.clinica_id)
    .eq("tipo_documento_id", tipoDocumentoId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const siguienteVersion = (ultima?.version ?? 0) + 1;

  const extension = archivo.name.split(".").pop() ?? "pdf";
  const path = `${check.usuario.clinica_id}/normativos/${tipoDocumentoId}-v${siguienteVersion}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("documentos-rrhh")
    .upload(path, archivo, { contentType: archivo.type });
  if (uploadError) return { error: "No se pudo subir el archivo." };

  const { error } = await supabase.from("documentos_normativos").insert({
    clinica_id: check.usuario.clinica_id,
    tipo_documento_id: tipoDocumentoId,
    version: siguienteVersion,
    storage_path: path,
    nombre_archivo: archivo.name,
    created_by: check.usuario.id,
  });
  if (error) return { error: "No se pudo guardar el documento." };

  revalidatePath("/rrhh/protocolos");
  return {};
}

export async function eliminarDocumentoNormativo(id: string): Promise<ResultadoAccion> {
  const check = await requirePermiso();
  if (!check.ok) return { error: check.error };
  if (!esAdministrador(check.usuario)) return { error: "Solo un administrador puede eliminar un documento." };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documentos_normativos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("documentos_normativos").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el documento." };

  if (doc?.storage_path) {
    await supabase.storage.from("documentos-rrhh").remove([doc.storage_path]);
  }

  revalidatePath("/rrhh/protocolos");
  return {};
}

// Última versión por tipo de documento — es lo "vigente"; el historial
// completo de versiones se puede ver filtrando por tipo_documento_id si
// hace falta, pero la pantalla principal solo necesita el más reciente.
export async function listarDocumentosNormativosVigentes() {
  const supabase = await createClient();
  const { data: tipos } = await supabase
    .from("tipos_documento_normativo")
    .select("id, nombre, categoria")
    .eq("activo", true)
    // Los de habilitación (0067) y los del SG-SST (0074) se gestionan desde
    // sus módulos: otro bucket, sin borrado y con versión asignada por la BD.
    .eq("categoria", "rrhh")
    .order("orden");

  const { data: documentosData } = await supabase
    .from("documentos_normativos")
    .select("id, tipo_documento_id, version, nombre_archivo, storage_path, vigente_desde, created_at")
    .order("version", { ascending: false });

  const documentos = documentosData ?? [];
  const porTipo = new Map<string, (typeof documentos)[number]>();
  for (const doc of documentos) {
    if (!porTipo.has(doc.tipo_documento_id)) porTipo.set(doc.tipo_documento_id, doc);
  }

  return (tipos ?? []).map((tipo) => ({ tipo, vigente: porTipo.get(tipo.id) ?? null }));
}
