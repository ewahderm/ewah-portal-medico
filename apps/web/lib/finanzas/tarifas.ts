// Tarifas de los medios de pago y liquidación de la pasarela (FC4). La BD
// (fn_fin_desglose) hace el mismo cálculo; este es para el simulador y la
// pantalla.

export type Tarifa = {
  id: string;
  medio_pago_id: string;
  vigente_desde: string;
  porcentaje_comision: number;
  comision_incluye_iva: boolean;
  valor_fijo_comision: number;
  porcentaje_retefuente: number;
  porcentaje_reteica: number;
  porcentaje_reteiva: number;
  recargo_internacional: number;
  dias_habiles_abono: number;
};

export type DatosTarifa = Omit<Tarifa, "id" | "medio_pago_id">;

// Tarifa estándar de Bold que compartió la clínica (IVA incluido).
export const TARIFA_BOLD: Omit<DatosTarifa, "vigente_desde"> = {
  porcentaje_comision: 3.79,
  comision_incluye_iva: true,
  valor_fijo_comision: 300,
  porcentaje_retefuente: 1.5,
  porcentaje_reteica: 0.414,
  porcentaje_reteiva: 0,
  recargo_internacional: 0,
  dias_habiles_abono: 1,
};

export type Desglose = { comision: number; retefuente: number; reteica: number; reteiva: number; neto: number };

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function desglose(bruto: number, t: Omit<DatosTarifa, "vigente_desde" | "dias_habiles_abono" | "recargo_internacional"> | null): Desglose {
  if (!t) return { comision: 0, retefuente: 0, reteica: 0, reteiva: 0, neto: bruto };
  const comision = r2(((bruto * t.porcentaje_comision) / 100 + t.valor_fijo_comision) * (t.comision_incluye_iva ? 1 : 1.19));
  const retefuente = r2((bruto * t.porcentaje_retefuente) / 100);
  const reteica = r2((bruto * t.porcentaje_reteica) / 100);
  const reteiva = r2((bruto * t.porcentaje_reteiva) / 100);
  return { comision, retefuente, reteica, reteiva, neto: r2(bruto - comision - retefuente - reteica - reteiva) };
}

// Tarifa vigente a una fecha (la más reciente con vigencia ≤ fecha).
export function tarifaVigente<T extends { vigente_desde: string }>(tarifas: T[], fecha: string): T | null {
  return tarifas.filter((t) => t.vigente_desde <= fecha).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null;
}

export function validarTarifa(t: DatosTarifa): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.vigente_desde)) return "Elige desde cuándo aplica.";
  const porcentajes = [t.porcentaje_comision, t.porcentaje_retefuente, t.porcentaje_reteica, t.porcentaje_reteiva, t.recargo_internacional];
  if (porcentajes.some((p) => !Number.isFinite(p) || p < 0 || p > 100)) return "Los porcentajes van de 0 a 100.";
  if (!Number.isFinite(t.valor_fijo_comision) || t.valor_fijo_comision < 0) return "El valor fijo no puede ser negativo.";
  if (!Number.isInteger(t.dias_habiles_abono) || t.dias_habiles_abono < 0 || t.dias_habiles_abono > 30) return "Los días de abono van de 0 a 30.";
  return null;
}

export type PendientePasarela = {
  movimiento_id: string;
  fecha: string;
  fecha_esperada: string | null;
  cuenta_id: string;
  medio_pago_id: string | null;
  descripcion: string | null;
  bruto: number;
  tarifa_id: string | null;
  comision: number;
  retefuente: number;
  reteica: number;
  reteiva: number;
  neto: number;
};

export type Totales = { cantidad: number; bruto: number; comision: number; retenciones: number; neto: number };

export function totalizar(pendientes: PendientePasarela[]): Totales {
  return pendientes.reduce(
    (t, p) => ({
      cantidad: t.cantidad + 1,
      bruto: r2(t.bruto + p.bruto),
      comision: r2(t.comision + p.comision),
      retenciones: r2(t.retenciones + p.retefuente + p.reteica + p.reteiva),
      neto: r2(t.neto + p.neto),
    }),
    { cantidad: 0, bruto: 0, comision: 0, retenciones: 0, neto: 0 },
  );
}

// Pendientes agrupados por día esperado de abono (los vencidos primero).
export function agruparPorAbono(pendientes: PendientePasarela[]): { fecha: string | null; items: PendientePasarela[]; totales: Totales }[] {
  const grupos = new Map<string, PendientePasarela[]>();
  for (const p of pendientes) {
    const k = p.fecha_esperada ?? "";
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, items]) => ({ fecha: fecha || null, items, totales: totalizar(items) }));
}

export function validarLiquidacion(input: { ids: string[]; cuentaId: string | null; fecha: string; netoReal: number | null; bruto: number; hoy: string; fechaMinima: string }): string | null {
  if (!input.ids.length) return "Elige los cobros que llegaron.";
  if (!input.cuentaId) return "Elige a qué cuenta llegó.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return "Elige la fecha del abono.";
  if (input.fecha > input.hoy) return "La fecha no puede ser futura.";
  if (input.fecha < input.fechaMinima) return "La fecha del abono no puede ser anterior a los cobros.";
  if (input.netoReal === null || !Number.isFinite(input.netoReal) || input.netoReal <= 0) return "Escribe cuánto llegó al banco.";
  if (input.netoReal > input.bruto) return "Lo que llegó no puede ser más que lo cobrado.";
  return null;
}

// Porcentajes de tarifa con hasta 4 decimales ("0,414", "3.79 %").
export function leerPorcentajeTarifa(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").replace(/[\s%]/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

export function formatoPorcentaje(n: number): string {
  return `${n.toLocaleString("es-CO", { maximumFractionDigits: 4 })} %`;
}

export function resumenTarifa(t: Pick<Tarifa, "porcentaje_comision" | "valor_fijo_comision" | "comision_incluye_iva" | "dias_habiles_abono">): string {
  const fijo = t.valor_fijo_comision ? ` + $${t.valor_fijo_comision.toLocaleString("es-CO")}` : "";
  const dias = t.dias_habiles_abono === 1 ? "1 día hábil" : `${t.dias_habiles_abono} días hábiles`;
  return `${formatoPorcentaje(t.porcentaje_comision)}${fijo}${t.comision_incluye_iva ? " (IVA incluido)" : " + IVA"} · abono en ${dias}`;
}
