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
