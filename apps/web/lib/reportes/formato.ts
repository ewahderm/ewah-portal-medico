// Formatos de presentación propios de Reportes. Las fechas y el dinero usan
// los helpers del proyecto (formatoFecha / formatoMoneda); aquí solo vive lo
// que no existía: el mes de las tendencias ("2026-03" → "mar 2026") y la
// etiqueta del tipo de periodo de nómina. Sin Date a propósito: el mes llega
// como texto sin huso horario y pasarlo por Date podría correrlo un mes.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split("-");
  const nombre = MESES_CORTOS[Number(numero) - 1];
  return nombre && anio ? `${nombre} ${anio}` : mes;
}

const TIPOS_PERIODO: Record<string, string> = {
  quincenal: "Quincenal",
  mensual: "Mensual",
};

export function etiquetaTipoPeriodo(tipo: string): string {
  return TIPOS_PERIODO[tipo] ?? tipo;
}

const ENTERO = new Intl.NumberFormat("es-CO");

export function formatoEntero(valor: number): string {
  return ENTERO.format(valor);
}
