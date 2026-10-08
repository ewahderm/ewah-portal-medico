// Subida de un soporte del flujo de caja desde el navegador directo a
// storage (ver prepararSubidaFinanzas). El servidor vuelve a verificar
// tamaño y firma antes de registrar.

import { createClient } from "@/lib/supabase/client";
import { prepararSubidaFinanzas, type AreaFinanzas } from "@/lib/finanzas/subidas";
import { detectarTipoArchivo } from "@/lib/habilitacion/archivos";
import { MAX_ARCHIVO_BYTES } from "@/lib/habilitacion/constantes";

export async function subirArchivoFinanzas(archivo: File, area: AreaFinanzas, entidadId: string): Promise<{ error: string } | { path: string; nombre: string }> {
  if (archivo.size === 0) return { error: "El archivo está vacío." };
  if (archivo.size > MAX_ARCHIVO_BYTES) return { error: "El archivo no puede pesar más de 10 MB." };
  const tipo = detectarTipoArchivo(new Uint8Array(await archivo.arrayBuffer()));
  if (!tipo) return { error: "Formato no soportado. Sube un PDF o una foto (JPG, PNG, WEBP)." };
  const destino = await prepararSubidaFinanzas(area, entidadId, tipo.extension);
  if (destino.error || !destino.path || !destino.token) return { error: destino.error ?? "No se pudo preparar la subida." };
  const { error } = await createClient().storage.from("finanzas").uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: tipo.mime });
  if (error) return { error: "No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo." };
  return { path: destino.path, nombre: archivo.name };
}
