// Literales SQL estándar (sin dollar-quoting: el texto de la norma puede
// contener `$`). Con standard_conforming_strings = on (default de Postgres)
// la única secuencia a escapar dentro de '…' es la comilla simple.

export class Crudo {
  constructor(sql) {
    this.sql = sql;
  }
}
/** Fragmento SQL que se emite tal cual (subconsultas, casts). */
export const crudo = (sql) => new Crudo(sql);

export function texto(v) {
  if (v.includes("\u0000")) throw new Error("texto con carácter NUL");
  return `'${v.replace(/'/g, "''")}'`;
}

/** Arreglo text[]; null se respeta como null (≠ arreglo vacío). */
export function arreglo(v) {
  if (v == null) return "null";
  if (v.length === 0) return "'{}'::text[]";
  return `array[${v.map((x) => texto(String(x))).join(", ")}]::text[]`;
}

export function int_arreglo(v) {
  if (v == null) return "null";
  if (v.length === 0) return "'{}'::int[]";
  return `array[${v.map((x) => String(Math.trunc(x))).join(", ")}]::int[]`;
}

export function lit(v) {
  if (v instanceof Crudo) return v.sql;
  if (v == null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`número no finito: ${v}`);
    return String(v);
  }
  if (Array.isArray(v)) return arreglo(v);
  if (typeof v === "string") return texto(v);
  throw new Error(`tipo no soportado en SQL: ${typeof v}`);
}

/**
 * INSERT por lotes, idempotente (`on conflict … do nothing`). Las filas se
 * emiten en el orden recibido: quien llama decide el orden (padres antes que
 * hijos), así el resultado es determinista.
 */
export function insertarPorLotes({ tabla, columnas, filas, conflicto, tamLote = 500 }) {
  const partes = [];
  for (let i = 0; i < filas.length; i += tamLote) {
    const lote = filas.slice(i, i + tamLote);
    const valores = lote
      .map((f) => {
        if (f.length !== columnas.length) {
          throw new Error(`${tabla}: la fila tiene ${f.length} valores y hay ${columnas.length} columnas`);
        }
        return `  (${f.map(lit).join(", ")})`;
      })
      .join(",\n");
    partes.push(
      `insert into ${tabla} (${columnas.join(", ")}) values\n${valores}\non conflict ${conflicto} do nothing;`,
    );
  }
  return partes.join("\n\n");
}
