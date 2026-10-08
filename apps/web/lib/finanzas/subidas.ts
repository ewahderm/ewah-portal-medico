"use server";

// URL firmada de SUBIDA para el bucket `finanzas` (mismo flujo que SG-SST:
// el servidor decide la ruta, el navegador sube directo y la acción que
// registra vuelve a verificar el archivo antes de guardar la fila).

import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { EXTENSIONES, esUuid } from "@/lib/habilitacion/servidor";
import { MODULO_FINANZAS } from "@/lib/finanzas/constantes";

export type AreaFinanzas = "movimientos";
const AREAS: AreaFinanzas[] = ["movimientos"];

export async function prepararSubidaFinanzas(
  area: AreaFinanzas,
  entidadId: string,
  extension: string,
): Promise<{ error?: string; path?: string; token?: string }> {
  if (!AREAS.includes(area) || !esUuid(entidadId)) return { error: "Destino inválido." };
  if (!(EXTENSIONES as readonly string[]).includes(extension)) return { error: "Formato no soportado." };
  const check = await requirePermiso(MODULO_FINANZAS, "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const path = `${check.usuario.clinica_id}/${area}/${entidadId.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from("finanzas").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[finanzas] createSignedUploadUrl", error);
    return { error: "No se pudo preparar la subida del archivo." };
  }
  return { path: data.path, token: data.token };
}
