// Fecha de hoy en Colombia (aaaa-mm-dd). NO usar new Date().toISOString():
// es UTC y desde las 7 p. m. ya devuelve "mañana" (default de fechas de
// tratamientos, Agenda, cortes, etc.). Es la única fuente de "hoy" para
// las pantallas clínicas; el formateador se crea una vez porque se llama
// por fila en algunas tablas.
const FORMATO_HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

export function hoy() {
  return FORMATO_HOY.format(new Date());
}

export function formatoMoneda(valor: number | null) {
  if (valor === null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

// Tasa en fracción (0.01044) → "1,044 %". Hasta 3 decimales: las tarifas
// ARL oficiales los usan (Decreto 1772 de 1994).
export function formatoPorcentaje(fraccion: number | null) {
  if (fraccion === null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(fraccion);
}
