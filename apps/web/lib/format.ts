export function hoy() {
  return new Date().toISOString().slice(0, 10);
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
