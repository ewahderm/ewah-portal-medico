// Lee en el navegador el reporte que se descarga de la pasarela (Excel, CSV o
// texto separado por tabuladores) y lo entrega ya validado. El archivo no se
// sube a ningún lado: solo viajan los pagos leídos.

import { decodificarTexto, leerFilas, parsearDelimitado, type Lectura } from "@/lib/finanzas/pasarelas/lector";

const MAX_BYTES = 5 * 1024 * 1024;

export async function leerArchivoReporte(archivo: File): Promise<Lectura> {
  if (archivo.size === 0) return { ok: false, error: "El archivo está vacío." };
  if (archivo.size > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 5 MB: súbelo por partes." };
  try {
    const bytes = await archivo.arrayBuffer();
    if (/\.(xlsx|xlsm|xls)$/i.test(archivo.name)) {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(bytes, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      if (!hoja) return { ok: false, error: "El libro no tiene hojas." };
      // raw: números y fechas llegan como valores, no como texto formateado.
      const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: "" });
      return leerFilas(filas);
    }
    return leerFilas(parsearDelimitado(decodificarTexto(bytes)));
  } catch {
    return { ok: false, error: "No se pudo leer el archivo. Descárgalo de nuevo de la pasarela y súbelo sin editarlo." };
  }
}
