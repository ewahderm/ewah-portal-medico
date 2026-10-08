import { describe, expect, it } from "vitest";
import { TARIFA_BOLD, agruparPorAbono, desglose, tarifaVigente, totalizar, validarLiquidacion, validarTarifa, type PendientePasarela } from "../tarifas";

describe("desglose de la pasarela", () => {
  it("Bold: de $100.000 llegan $93.996", () => {
    expect(desglose(100000, TARIFA_BOLD)).toEqual({ comision: 4090, retefuente: 1500, reteica: 414, reteiva: 0, neto: 93996 });
  });
  it("sin IVA incluido la comisión suma el 19 %", () => {
    expect(desglose(100000, { ...TARIFA_BOLD, porcentaje_comision: 3, valor_fijo_comision: 0, comision_incluye_iva: false }).comision).toBe(3570);
  });
  it("redondea a centavos", () => {
    expect(desglose(33333, TARIFA_BOLD).reteica).toBe(138);
    expect(desglose(12345, TARIFA_BOLD).comision).toBe(767.88);
  });
  it("sin tarifa llega todo", () => expect(desglose(5000, null).neto).toBe(5000));
});

describe("tarifa vigente", () => {
  const t = [
    { id: "a", vigente_desde: "2026-01-01" },
    { id: "b", vigente_desde: "2026-06-01" },
  ];
  it("toma la más reciente a la fecha", () => {
    expect(tarifaVigente(t, "2026-05-31")?.id).toBe("a");
    expect(tarifaVigente(t, "2026-06-01")?.id).toBe("b");
    expect(tarifaVigente(t, "2025-12-31")).toBeNull();
  });
});

describe("validarTarifa", () => {
  const base = { ...TARIFA_BOLD, vigente_desde: "2026-01-01" };
  it("acepta la de Bold", () => expect(validarTarifa(base)).toBeNull());
  it("rechaza porcentajes fuera de rango y días inválidos", () => {
    expect(validarTarifa({ ...base, porcentaje_comision: 101 })).toMatch(/0 a 100/);
    expect(validarTarifa({ ...base, porcentaje_reteica: -1 })).toMatch(/0 a 100/);
    expect(validarTarifa({ ...base, dias_habiles_abono: 1.5 })).toMatch(/días/);
    expect(validarTarifa({ ...base, vigente_desde: "" })).toMatch(/cuándo/);
    expect(validarTarifa({ ...base, valor_fijo_comision: -5 })).toMatch(/negativo/);
  });
});

const p = (id: string, fecha_esperada: string | null, bruto: number): PendientePasarela => ({
  movimiento_id: id, fecha: "2026-03-02", fecha_esperada, cuenta_id: "c", medio_pago_id: "m", descripcion: null, bruto,
  tarifa_id: "t", pago_id: null, ...desglose(bruto, TARIFA_BOLD),
});

describe("pendientes de la pasarela", () => {
  it("totaliza y agrupa por día esperado", () => {
    const grupos = agruparPorAbono([p("1", "2026-03-04", 100000), p("2", "2026-03-03", 50000), p("3", "2026-03-04", 100000)]);
    expect(grupos.map((g) => g.fecha)).toEqual(["2026-03-03", "2026-03-04"]);
    expect(grupos[1].totales).toEqual({ cantidad: 2, bruto: 200000, comision: 8180, retenciones: 3828, neto: 187992 });
    expect(totalizar([]).cantidad).toBe(0);
  });
  it("valida la liquidación", () => {
    const base = { ids: ["1"], cuentaId: "b", fecha: "2026-03-04", netoReal: 93996, bruto: 100000, hoy: "2026-03-05", fechaMinima: "2026-03-02" };
    expect(validarLiquidacion(base)).toBeNull();
    expect(validarLiquidacion({ ...base, ids: [] })).toMatch(/cobros/);
    expect(validarLiquidacion({ ...base, cuentaId: null })).toMatch(/cuenta/);
    expect(validarLiquidacion({ ...base, fecha: "2026-03-01" })).toMatch(/anterior/);
    expect(validarLiquidacion({ ...base, fecha: "2026-03-06" })).toMatch(/futura/);
    expect(validarLiquidacion({ ...base, netoReal: 100001 })).toMatch(/más que lo cobrado/);
    expect(validarLiquidacion({ ...base, netoReal: null })).toMatch(/cuánto llegó/);
  });
});

import { leerPorcentajeTarifa, resumenTarifa } from "../tarifas";
describe("porcentajes de tarifa", () => {
  it("lee hasta 4 decimales con coma o punto", () => {
    expect(leerPorcentajeTarifa("0,414")).toBe(0.414);
    expect(leerPorcentajeTarifa("3.79 %")).toBe(3.79);
    expect(leerPorcentajeTarifa("101")).toBeNull();
    expect(leerPorcentajeTarifa("1,23456")).toBeNull();
    expect(leerPorcentajeTarifa("")).toBeNull();
  });
  it("resume la tarifa", () => {
    expect(resumenTarifa(TARIFA_BOLD)).toBe("3,79 % + $300 (IVA incluido) · abono en 1 día hábil");
  });
});
