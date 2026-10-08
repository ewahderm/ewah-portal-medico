// Informe de flujo de efectivo por actividades (NIIF para Pymes, Sección 7)
// y meses del cierre (FC6). Lógica pura: la usan la pantalla, los
// exportes y el PDF.

import type { Actividad, Moneda } from "@/lib/finanzas/constantes";

export type FilaFlujo = { codigo: string; actividad: Actividad; entradas: number; salidas: number };

export const ACTIVIDADES_INFORME: { valor: Actividad; titulo: string }[] = [
  { valor: "operacion", titulo: "Actividades de operación" },
  { valor: "inversion", titulo: "Actividades de inversión" },
  { valor: "financiacion", titulo: "Actividades de financiación" },
];

// Códigos que no son categorías.
export const NOMBRES_ESPECIALES: Record<string, string> = {
  ABONO_PASARELA: "Abonos de la pasarela (cobros con tarjeta)",
};

export type Renglon = { codigo: string; nombre: string; valor: number };
export type BloqueActividad = { actividad: Actividad; titulo: string; entradas: Renglon[]; salidas: Renglon[]; neto: number };
export type Informe = { bloques: BloqueActividad[]; entradas: number; salidas: number; variacion: number };

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// Cada categoría va por su neto: las anulaciones (movimientos inversos) se
// compensan con lo que anulan y no aparecen como cobros y pagos ficticios.
export function armarInforme(filas: FilaFlujo[], nombre: (codigo: string) => string): Informe {
  const bloques = ACTIVIDADES_INFORME.map(({ valor, titulo }) => {
    const netos = filas
      .filter((f) => f.actividad === valor)
      .map((f) => ({ codigo: f.codigo, nombre: NOMBRES_ESPECIALES[f.codigo] ?? nombre(f.codigo), neto: r2(f.entradas - f.salidas) }))
      .filter((f) => f.neto !== 0);
    const entradas = netos.filter((f) => f.neto > 0).map((f) => ({ codigo: f.codigo, nombre: f.nombre, valor: f.neto })).sort((a, b) => b.valor - a.valor);
    const salidas = netos.filter((f) => f.neto < 0).map((f) => ({ codigo: f.codigo, nombre: f.nombre, valor: -f.neto })).sort((a, b) => b.valor - a.valor);
    const neto = r2(entradas.reduce((t, r) => t + r.valor, 0) - salidas.reduce((t, r) => t + r.valor, 0));
    return { actividad: valor, titulo, entradas, salidas, neto };
  });
  const entradas = r2(bloques.reduce((t, b) => t + b.entradas.reduce((s, r) => s + r.valor, 0), 0));
  const salidas = r2(bloques.reduce((t, b) => t + b.salidas.reduce((s, r) => s + r.valor, 0), 0));
  return { bloques, entradas, salidas, variacion: r2(entradas - salidas) };
}

// Saldo disponible en pesos: COP + divisas a la última tasa usada. Las
// divisas con saldo y sin ninguna tasa no se pueden convertir: quedan por
// fuera y se nombran en `sinTasa`.
export function disponibleEnPesos(
  cuentas: { id: string; moneda: Moneda; es_disponible: boolean }[],
  saldos: Map<string, number>,
  tasas: Map<string, number>,
): { total: number; sinTasa: string[] } {
  let total = 0;
  const sinTasa = new Set<string>();
  for (const c of cuentas.filter((c) => c.es_disponible)) {
    const saldo = saldos.get(c.id) ?? 0;
    if (c.moneda === "COP") total += saldo;
    else if (saldo !== 0) {
      const tasa = tasas.get(c.moneda);
      if (tasa) total += saldo * tasa;
      else sinTasa.add(c.moneda);
    }
  }
  return { total: r2(total), sinTasa: [...sinTasa] };
}

// Diferencia que no explican los movimientos: la de las divisas al cambiar
// su tasa entre el inicio y el final del periodo.
export function efectoTasa(inicial: number, variacion: number, final: number): number {
  return r2(final - inicial - variacion);
}

// ---------- Meses ----------

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type Mes = { anio: number; mes: number };

export const claveMes = (m: Mes) => `${m.anio}-${String(m.mes).padStart(2, "0")}`;
export const nombreMes = (m: Mes) => `${MESES[m.mes - 1]} de ${m.anio}`;
export const primerDia = (m: Mes) => `${claveMes(m)}-01`;
export function ultimoDia(m: Mes): string {
  const d = new Date(Date.UTC(m.anio, m.mes, 0));
  return d.toISOString().slice(0, 10);
}
export function mesDe(fecha: string): Mes {
  return { anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) };
}
export function sumarMeses(m: Mes, n: number): Mes {
  const total = m.anio * 12 + (m.mes - 1) + n;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}
export function leerMes(texto: string | undefined | null): Mes | null {
  if (!texto || !/^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return null;
  return mesDe(`${texto}-01`);
}

// Meses ya terminados desde el del inicio hasta el anterior a hoy (para el cierre).
export function mesesCerrables(fechaInicio: string, hoy: string): Mes[] {
  const meses: Mes[] = [];
  const ultimo = sumarMeses(mesDe(hoy), -1);
  for (let m = mesDe(fechaInicio); claveMes(m) <= claveMes(ultimo); m = sumarMeses(m, 1)) meses.push(m);
  return meses;
}

// El siguiente mes por cerrar: el primero que no está cerrado (en orden).
export function siguientePorCerrar(cerrables: Mes[], cerrados: Set<string>): Mes | null {
  return cerrables.find((m) => !cerrados.has(claveMes(m))) ?? null;
}
