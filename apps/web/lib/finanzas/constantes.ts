// Flujo de caja (Etapa 1). Constantes compartidas por servidor y cliente.

export const MODULO_FINANZAS = "finanzas";

export const MONEDAS = [
  { value: "COP", label: "Pesos (COP)" },
  { value: "USD", label: "Dólares (USD)" },
  { value: "EUR", label: "Euros (EUR)" },
] as const;
export type Moneda = (typeof MONEDAS)[number]["value"];

// `pro`: solo con el plan Pro (has_entitlement('finanzas', 'gestion')).
export const TIPOS_CUENTA = [
  { value: "banco", label: "Banco", ayuda: "Cuenta de ahorros o corriente.", pro: false },
  { value: "nequi", label: "Nequi", ayuda: "Billetera digital.", pro: false },
  { value: "daviplata", label: "Daviplata", ayuda: "Billetera digital.", pro: false },
  { value: "efectivo", label: "Efectivo", ayuda: "Caja en pesos, dólares o euros.", pro: false },
  { value: "pasarela", label: "Pasarela (Bold)", ayuda: "Cobros con tarjeta que llegan al banco días después.", pro: true },
  { value: "tarjeta_socio", label: "Tarjeta de crédito de socio", ayuda: "Gastos que paga un socio con su tarjeta: la clínica se los debe.", pro: true },
] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number]["value"];

export const ACTIVIDADES = [
  { value: "operacion", label: "Operación", ayuda: "El día a día: cobros a pacientes, gastos, nómina e impuestos." },
  { value: "inversion", label: "Inversión", ayuda: "Compra de equipos, muebles y obras." },
  { value: "financiacion", label: "Financiación", ayuda: "Préstamos y aportes de los socios." },
] as const;
export type Actividad = (typeof ACTIVIDADES)[number]["value"];

// Subnavegación. `disponible: false` se ve sin enlace hasta su fase.
export const SECCIONES_FINANZAS = [
  { href: "/finanzas", label: "Inicio", disponible: true },
  { href: "/finanzas/movimientos", label: "Movimientos", disponible: true },
  { href: "/finanzas/cobros", label: "Cobros", disponible: true },
  { href: "/finanzas/bold", label: "Bold", disponible: true },
  { href: "/finanzas/socios", label: "Socios", disponible: true },
  { href: "/finanzas/informe", label: "Informe", disponible: true },
  { href: "/finanzas/cierre", label: "Cierre", disponible: true },
  { href: "/finanzas/configuracion", label: "Configuración", disponible: true },
] as const;

export function etiqueta<T extends string>(opciones: readonly { value: T; label: string }[], v: string | null | undefined): string {
  return opciones.find((o) => o.value === v)?.label ?? (v ?? "");
}
