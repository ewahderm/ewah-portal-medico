// Subida de un archivo del SG-SST desde el navegador directo a storage
// (ver prepararSubidaSst). El servidor vuelve a verificar tamaño y firma.

import { createClient } from "@/lib/supabase/client";
import { prepararSubidaSst, type AreaSst } from "@/lib/sst/subidas";
import { detectarTipoArchivo } from "@/lib/habilitacion/archivos";
import { MAX_ARCHIVO_BYTES } from "@/lib/habilitacion/constantes";

export async function subirArchivoSst(archivo: File, area: AreaSst, entidadId: string): Promise<{ error: string } | { path: string; nombre: string }> {
  if (archivo.size === 0) return { error: "El archivo está vacío." };
  if (archivo.size > MAX_ARCHIVO_BYTES) return { error: "El archivo no puede pesar más de 10 MB." };
  const tipo = detectarTipoArchivo(new Uint8Array(await archivo.arrayBuffer()));
  if (!tipo) return { error: "Formato no soportado. Sube un PDF, una imagen (JPG, PNG, WEBP) o un Word/Excel (.docx, .xlsx)." };
  const destino = await prepararSubidaSst(area, entidadId, tipo.extension);
  if (destino.error || !destino.path || !destino.token) return { error: destino.error ?? "No se pudo preparar la subida." };
  const { error } = await createClient().storage.from("sst").uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: tipo.mime });
  if (error) return { error: "No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo." };
  return { path: destino.path, nombre: archivo.name };
}
