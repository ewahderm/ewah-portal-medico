// Movimientos del flujo de caja (FC2): validación compartida por el
// formulario y la acción de servidor, y resúmenes del tablero. Pura. La BD
// (0091) vuelve a validar todo y calcula el valor en COP.

import type { Moneda } from "@/lib/finanzas/constantes";

export type TipoMovimiento = "ingreso" | "egreso" | "transferencia";

export type MovimientoEntrada = {
  tipo: TipoMovimiento;
  fecha: string;
  monto: number | null;
  // Moneda de la cuenta de origen (la decide la cuenta, no el usuario).
  moneda: Moneda;
  tasa: number | null;
  categoria: string | null;
  cuentaId: string | null;
  cuentaDestinoId: string | null;
  monedaDestino: Moneda | null;
  montoDestino: number | null;
  socioId: string | null;
  requiereSocio: boolean;
};

export const TASA_MAXIMA = 100000;

export function validarMovimiento(m: MovimientoEntrada, contexto: { hoy: string; fechaInicio: string }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) return "Elige la fecha.";
  if (m.fecha > contexto.hoy) return "La fecha no puede ser futura.";
  if (m.fecha < contexto.fechaInicio) return "La fecha es anterior al inicio del flujo de caja.";
  if (m.monto === null || !(m.monto > 0)) return "Escribe cuánto fue.";
  if (m.monto > 1e12) return "El monto es demasiado grande.";
  if (!m.cuentaId) return m.tipo === "ingreso" ? "Elige a dónde llegó la plata." : "Elige de dónde salió la plata.";
  if (m.moneda !== "COP" && (m.tasa === null || !(m.tasa > 0) || m.tasa > TASA_MAXIMA)) return `Escribe a cuánto estaba el ${m.moneda} en pesos.`;
  if (m.tipo === "transferencia") {
    if (!m.cuentaDestinoId) return "Elige a qué cuenta pasa la plata.";
    if (m.cuentaDestinoId === m.cuentaId) return "La cuenta de origen y la de destino deben ser distintas.";
    if (m.monedaDestino && m.monedaDestino !== m.moneda) {
      if (m.montoDestino === null || !(m.montoDestino > 0)) return `Escribe cuántos ${m.monedaDestino} llegaron.`;
    }
    return null;
  }
  if (!m.categoria) return m.tipo === "ingreso" ? "Elige de qué es la entrada." : "Elige en qué se gastó.";
  if (m.requiereSocio && !m.socioId) return "Elige el socio.";
  return null;
}

// Valor en pesos como lo calculará la BD (redondeo a 2 decimales).
export function valorEnPesos(monto: number, moneda: Moneda, tasa: number | null): number {
  return moneda === "COP" ? monto : Math.round(monto * (tasa ?? 0) * 100) / 100;
}

export type MovimientoResumen = {
  tipo: TipoMovimiento;
  categoria: string | null;
  valor_cop: number;
  origen: string;
};

export type ResumenPeriodo = {
  entradas: number;
  salidas: number;
  porCategoria: { categoria: string; salidas: number }[];
};

// Entradas y salidas del periodo (sin transferencias: mover plata entre
// cuentas no es entrar ni salir). Las anulaciones restan de su categoría.
export function resumirPeriodo(movs: MovimientoResumen[]): ResumenPeriodo {
  let entradas = 0;
  let salidas = 0;
  const cats = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo === "transferencia" || !m.categoria) continue;
    const anulacion = m.origen === "anulacion";
    // Una anulación tiene el tipo invertido: restarla del lado original.
    const ladoSalida = anulacion ? m.tipo === "ingreso" : m.tipo === "egreso";
    const signo = anulacion ? -1 : 1;
    if (ladoSalida) {
      salidas += signo * m.valor_cop;
      cats.set(m.categoria, (cats.get(m.categoria) ?? 0) + signo * m.valor_cop);
    } else {
      entradas += signo * m.valor_cop;
    }
  }
  const porCategoria = [...cats.entries()]
    .map(([categoria, salidas]) => ({ categoria, salidas: Math.round(salidas * 100) / 100 }))
    .filter((c) => c.salidas !== 0)
    .sort((a, b) => b.salidas - a.salidas);
  return { entradas: Math.round(entradas * 100) / 100, salidas: Math.round(salidas * 100) / 100, porCategoria };
}

// Código de categoría como lo ve la app: el global o "PROPIA_<id>".
export function codigoCategoria(m: { categoria_codigo: string | null; categoria_propia_id: string | null }): string | null {
  return m.categoria_codigo ?? (m.categoria_propia_id ? `PROPIA_${m.categoria_propia_id}` : null);
}
