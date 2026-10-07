// Subida de un archivo de Habilitación desde el NAVEGADOR directo a
// storage (ver prepararSubida en autoevaluacion.ts). La verificación en el
// navegador es solo para avisar rápido: el servidor vuelve a verificar
// tamaño y firma antes de registrar la fila.

import { createClient } from "@/lib/supabase/client";
import { prepararSubida } from "@/lib/habilitacion/autoevaluacion";
import { detectarTipoArchivo } from "@/lib/habilitacion/archivos";
import { MAX_ARCHIVO_BYTES } from "@/lib/habilitacion/constantes";

export async function subirArchivoHabilitacion(
  archivo: File,
  area: "evidencias" | "planes" | "protocolos",
  entidadId: string,
): Promise<{ error: string } | { path: string; nombre: string }> {
  if (archivo.size === 0) return { error: "El archivo está vacío." };
  if (archivo.size > MAX_ARCHIVO_BYTES) return { error: "El archivo no puede pesar más de 10 MB." };
  const tipo = detectarTipoArchivo(new Uint8Array(await archivo.arrayBuffer()));
  if (!tipo) return { error: "Formato no soportado. Sube un PDF, una imagen (JPG, PNG, WEBP) o un Word/Excel (.docx, .xlsx)." };

  const destino = await prepararSubida(area, entidadId, tipo.extension);
  if (destino.error || !destino.path || !destino.token) return { error: destino.error ?? "No se pudo preparar la subida." };

  const { error } = await createClient()
    .storage.from("habilitacion")
    .uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: tipo.mime });
  if (error) return { error: "No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo." };
  return { path: destino.path, nombre: archivo.name };
}
