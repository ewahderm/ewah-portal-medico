// Tipo de archivo decidido por su FIRMA (magic bytes), no por el nombre ni
// por el `type` que manda el navegador (§1.5, corrige la debilidad de
// lib/rrhh/documentos.ts). La extensión del objeto en storage sale de aquí;
// el nombre original solo se guarda para mostrarlo. Puro, sin E/S.

export type TipoArchivo = { mime: string; extension: string; etiqueta: string };

const PDF: TipoArchivo = { mime: "application/pdf", extension: "pdf", etiqueta: "PDF" };
const JPEG: TipoArchivo = { mime: "image/jpeg", extension: "jpg", etiqueta: "JPG" };
const PNG: TipoArchivo = { mime: "image/png", extension: "png", etiqueta: "PNG" };
const WEBP: TipoArchivo = { mime: "image/webp", extension: "webp", etiqueta: "WEBP" };
const DOCX: TipoArchivo = {
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  extension: "docx",
  etiqueta: "Word",
};
const XLSX: TipoArchivo = {
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  extension: "xlsx",
  etiqueta: "Excel",
};

function empiezaCon(bytes: Uint8Array, firma: number[], desde = 0) {
  if (bytes.length < desde + firma.length) return false;
  return firma.every((b, i) => bytes[desde + i] === b);
}

// Busca un nombre de entrada ASCII dentro del zip (el directorio central
// lista todas las rutas al final del archivo).
function contieneAscii(bytes: Uint8Array, texto: string) {
  const objetivo = [...texto].map((c) => c.charCodeAt(0));
  const primero = objetivo[0];
  for (let i = 0; i <= bytes.length - objetivo.length; i++) {
    if (bytes[i] !== primero) continue;
    let ok = true;
    for (let j = 1; j < objetivo.length; j++) {
      if (bytes[i + j] !== objetivo[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function detectarTipoArchivo(bytes: Uint8Array): TipoArchivo | null {
  if (empiezaCon(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return PDF; // %PDF-
  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (empiezaCon(bytes, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return WEBP; // RIFF....WEBP
  if (empiezaCon(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // Office Open XML = zip con [Content_Types].xml y la parte principal.
    if (!contieneAscii(bytes, "[Content_Types].xml")) return null;
    if (contieneAscii(bytes, "word/document.xml")) return DOCX;
    if (contieneAscii(bytes, "xl/workbook.xml")) return XLSX;
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
