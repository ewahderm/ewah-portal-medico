"use server";

// URL firmada de SUBIDA para el bucket `sst` (mismo flujo que Habilitación:
// el servidor decide la ruta, el navegador sube directo y el registro
// vuelve a verificar el archivo antes de guardar la fila).

import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { EXTENSIONES, esUuid } from "@/lib/habilitacion/servidor";

export type AreaSst = "investigaciones" | "actas" | "documentos" | "personas";
const AREAS: AreaSst[] = ["investigaciones", "actas", "documentos", "personas"];

export async function prepararSubidaSst(
  area: AreaSst,
  entidadId: string,
  extension: string,
): Promise<{ error?: string; path?: string; token?: string }> {
  if (!AREAS.includes(area) || !esUuid(entidadId)) return { error: "Destino inválido." };
  if (!(EXTENSIONES as readonly string[]).includes(extension)) return { error: "Formato no soportado." };
  const check = await requirePermiso("sst", "CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const path = `${check.usuario.clinica_id}/${area}/${entidadId.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from("sst").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[sst] createSignedUploadUrl", error);
    return { error: "No se pudo preparar la subida del archivo." };
  }
  return { path: data.path, token: data.token };
}
