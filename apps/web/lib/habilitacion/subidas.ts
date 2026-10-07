"use server";

// URL firmada de SUBIDA para el bucket `habilitacion` (ver servidor.ts).
// El servidor decide la carpeta y exige el permiso de lo que se va a
// registrar después; el registro (otra action) vuelve a verificar el
// archivo antes de guardar la fila.

import { createClient } from "@/lib/supabase/server";
import { requireHabilitacion, type PermisoHabilitacion } from "@/lib/habilitacion/guard";
import { BUCKET, CARPETAS, EXTENSIONES, esUuid, type Carpeta } from "@/lib/habilitacion/servidor";

// "documentos" se resuelve en el servidor: si el documento del checklist es
// financiero, el archivo va a `financiero/` (solo EDIT lo lee, 0068).
export type AreaSubida = Exclude<Carpeta, "financiero">;

const PERMISO: Record<AreaSubida, PermisoHabilitacion> = {
  evidencias: "CREATE",
  planes: "EDIT",
  protocolos: "CREATE",
  documentos: "CREATE",
  tramite: "CREATE",
  obligaciones: "EDIT",
  novedades: "CREATE",
};

export async function prepararSubida(
  area: AreaSubida,
  entidadId: string,
  extension: string,
): Promise<{ error?: string; path?: string; token?: string }> {
  if (!(CARPETAS as readonly string[]).includes(area) || area === ("financiero" as string)) return { error: "Destino inválido." };
  if (!esUuid(entidadId)) return { error: "Destino inválido." };
  if (!(EXTENSIONES as readonly string[]).includes(extension)) return { error: "Formato no soportado." };

  const check = await requireHabilitacion(PERMISO[area], { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  let carpeta: Carpeta = area;
  if (area === "documentos") {
    const { data: doc } = await supabase
      .from("hab_documentos_clinica")
      .select("id, hab_documentos_catalogo(es_financiero)")
      .eq("id", entidadId)
      .maybeSingle();
    if (!doc) return { error: "Documento inválido." };
    const catalogo = doc.hab_documentos_catalogo as unknown as { es_financiero: boolean } | null;
    if (catalogo?.es_financiero) {
      const editar = await requireHabilitacion("EDIT", { gestion: true });
      if (!editar.ok) return { error: "Este documento es financiero: necesitas permiso de edición para cargarlo." };
      carpeta = "financiero";
    }
  }

  const path = `${check.usuario.clinica_id}/${carpeta}/${entidadId.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[habilitacion] createSignedUploadUrl", error);
    return { error: "No se pudo preparar la subida del archivo." };
  }
  return { path: data.path, token: data.token };
}
