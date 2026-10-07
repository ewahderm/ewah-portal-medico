import * as XLSX from "xlsx";
import { hoy } from "@/lib/format";

export type ColumnaXlsx = { header: string; key: string };

/**
 * Construye un libro .xlsx con una o varias hojas. Cada hoja se arma como
 * array-de-arrays (no json_to_sheet) para controlar el orden de columnas a
 * mano — `columnas` manda, no el orden de llaves del objeto fila.
 */
// Devuelve un Blob (no Buffer/Uint8Array) a propósito: es el único tipo
// que NextResponse/BlobPart acepta sin pelear con TS por el genérico
// ArrayBufferLike de los typed arrays — así cada Route Handler que llama
// a esto puede hacer `new NextResponse(construirLibroXlsx(...), {...})`
// directo, sin ningún workaround de conversión repetido.
export function construirLibroXlsx(
  hojas: { nombre: string; columnas: ColumnaXlsx[]; filas: Record<string, unknown>[] }[],
): Blob {
  const libro = XLSX.utils.book_new();
  for (const hoja of hojas) {
    const encabezados = hoja.columnas.map((c) => c.header);
    const datos = hoja.filas.map((fila) => hoja.columnas.map((c) => fila[c.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([encabezados, ...datos]);
    // Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ].
    const nombreHoja = hoja.nombre.replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "Hoja1";
    XLSX.utils.book_append_sheet(libro, ws, nombreHoja);
  }
  // OJO: con type:"array" esta versión de la librería (xlsx@0.18.5)
  // devuelve un ArrayBuffer, no un Uint8Array/array plano pese al nombre
  // — Uint8Array.from(arrayBuffer) no lo recorre (da un Uint8Array vacío,
  // confirmado: produjo un archivo de 0 bytes). El constructor sí lo
  // envuelve correctamente.
  const bytes = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([new Uint8Array(bytes)]);
}

/** Plantilla para importar: mismas columnas, sin filas de datos. */
export function construirPlantillaXlsx(nombreHoja: string, columnas: ColumnaXlsx[]): Blob {
  return construirLibroXlsx([{ nombre: nombreHoja, columnas, filas: [] }]);
}

/**
 * Lee la primera hoja de un .xlsx subido y devuelve filas como objetos
 * `{key: valor}`, mapeando por el TEXTO del encabezado (no por posición) —
 * así sigue funcionando si alguien reordenó columnas en Excel antes de
 * subirlo. Filas completamente vacías se descartan (Excel suele dejar
 * filas "fantasma" al final de una hoja).
 */
export function leerFilasXlsx(buffer: Buffer, columnas: ColumnaXlsx[]): Record<string, string>[] {
  const libro = XLSX.read(buffer, { type: "buffer" });
  const primeraHoja = libro.SheetNames[0];
  if (!primeraHoja) return [];
  const ws = libro.Sheets[primeraHoja];

  const filasAoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  const [encabezados, ...resto] = filasAoa;
  if (!encabezados) return [];

  const indicePorHeader = new Map(
    encabezados.map((h, i) => [String(h ?? "").trim(), i] as const),
  );

  return resto
    .filter((fila) => fila.some((v) => String(v ?? "").trim() !== ""))
    .map((fila) => {
      const obj: Record<string, string> = {};
      for (const col of columnas) {
        const idx = indicePorHeader.get(col.header);
        obj[col.key] = idx !== undefined ? String(fila[idx] ?? "").trim() : "";
      }
      return obj;
    });
}

/** Nombre de archivo con la fecha de hoy, sin caracteres problemáticos. */
export function nombreArchivoXlsx(base: string): string {
  const fecha = hoy();
  return `${base}-${fecha}.xlsx`;
}
