// Utilidades de SERVIDOR compartidas por las actions de Habilitación
// (autoevaluación, documentos, trámite, obligaciones). Sin directiva: no es
// invocable desde el cliente; solo lo importan archivos "use server".

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectarTipoArchivo, sha256Hex } from "@/lib/habilitacion/archivos";
import {
  MAX_ARCHIVO_BYTES,
  MIN_JUSTIFICACION_NO_APLICA,
  SEGUNDOS_URL_FIRMADA,
} from "@/lib/habilitacion/constantes";

export const BUCKET = "habilitacion";
export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Supabase = Awaited<ReturnType<typeof createClient>>;
type ErrorBd = { code?: string; message: string };

export function revalidar() {
  revalidatePath("/habilitacion", "layout");
}

// Los triggers de 0066–0069 lanzan mensajes ya escritos para el usuario
// (P0001). El resto se traduce; el detalle técnico queda en el servidor.
export function mensajeError(contexto: string, error: ErrorBd, porDefecto: string): string {
  console.error(`[habilitacion] ${contexto}`, error);
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "No tienes permiso para esta acción o tu plan no la incluye.";
  if (error.message?.includes("hab_evaluaciones_no_aplica_justificada")) {
    return `Para marcar "No aplica" explica por qué (al menos ${MIN_JUSTIFICACION_NO_APLICA} caracteres).`;
  }
  if (error.message?.includes("hab_ocurrencia_presentada_con_prueba")) {
    return "Para marcarla como presentada escribe el número de radicado o adjunta el acuse.";
  }
  if (error.code === "23505") return "Ese registro ya existe.";
  if (error.code === "23514") return "Algún dato no tiene el formato esperado. Revisa el formulario.";
  return porDefecto;
}

export function textoForm(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

export function textoOpcional(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim();
  return t ? t : null;
}

export function esUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

// Hoy en Colombia (las fechas de la norma cortan por día local).
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

// ------------------------------------------------------------
// Archivos: el navegador sube DIRECTO a storage con una URL firmada que
// emite el servidor (subidas.ts: las server actions se cortan en 1 MB y
// Vercel en 4,5 MB; los archivos admiten 10 MB). El servidor decide la ruta
// (<clinica>/<carpeta>/<entidad>/<uuid>.<ext>; el nombre nunca sale del que
// sube el usuario, §1.5) y, antes de registrar la fila, descarga el objeto
// con la sesión y verifica tamaño y FIRMA.
// ------------------------------------------------------------
export const EXTENSIONES = ["pdf", "jpg", "png", "webp", "docx", "xlsx"] as const;
export const CARPETAS = [
  "evidencias",
  "planes",
  "protocolos",
  "documentos",
  "financiero",
  "tramite",
  "obligaciones",
  "novedades",
] as const;
export type Carpeta = (typeof CARPETAS)[number];

export type ArchivoVerificado = { path: string; nombre: string; mime: string; tamano: number; sha256: string };

export async function verificarArchivoSubido(
  supabase: Supabase,
  clinicaId: string,
  carpeta: Carpeta,
  entidadId: string,
  path: string,
  nombre: string,
): Promise<{ error: string } | ArchivoVerificado> {
  const prefijo = `${clinicaId}/${carpeta}/${entidadId.toLowerCase()}/`;
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
    nombre: nombreSeguro(nombre) || `archivo.${tipo.extension}`,
    mime: tipo.mime,
    tamano: bytes.length,
    sha256: await sha256Hex(bytes),
  };
}

// El nombre original solo se muestra y se usa como nombre de descarga
// (Content-Disposition): sin caracteres de control, comillas ni barras
// (F11). La ruta en Storage nunca sale de él.
export function nombreSeguro(nombre: string): string {
  return nombre
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .trim()
    .slice(0, 255);
}

// URL firmada de 60 s; quien llama ya leyó la fila con RLS.
export async function firmar(supabase: Supabase, path: string, nombre: string | null) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SEGUNDOS_URL_FIRMADA, nombre ? { download: nombre } : undefined);
  if (error || !data) {
    console.error("[habilitacion] createSignedUrl", error);
    return { error: "No se pudo generar el enlace de descarga." };
  }
  return { url: data.signedUrl };
}
