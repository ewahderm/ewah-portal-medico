import { describe, expect, it } from "vitest";
import { armarInforme, disponibleEnPesos, efectoTasa, leerMes, mesesCerrables, nombreMes, siguientePorCerrar, sumarMeses, ultimoDia, claveMes } from "../informe";

describe("informe por actividades", () => {
  const filas = [
    { codigo: "SERVICIOS_SALUD", actividad: "operacion" as const, entradas: 1000000, salidas: 0 },
    { codigo: "ABONO_PASARELA", actividad: "operacion" as const, entradas: 93996, salidas: 0 },
    { codigo: "ARRENDAMIENTO", actividad: "operacion" as const, entradas: 0, salidas: 2500000 },
    { codigo: "COMPRA_ACTIVOS", actividad: "inversion" as const, entradas: 0, salidas: 800000 },
    { codigo: "PRESTAMO_A_SOCIO", actividad: "financiacion" as const, entradas: 400000, salidas: 1000000 },
  ];
  const i = armarInforme(filas, (c) => c.toLowerCase());
  it("agrupa por actividad con su neto", () => {
    expect(i.bloques.map((b) => b.neto)).toEqual([-1406004, -800000, -600000]);
    expect(i.bloques[0].entradas.map((r) => r.nombre)).toEqual(["servicios_salud", "Abonos de la pasarela (cobros con tarjeta)"]);
    expect(i.bloques[2].entradas).toEqual([]);
    expect(i.bloques[2].salidas[0]).toMatchObject({ codigo: "PRESTAMO_A_SOCIO", valor: 600000 });
  });
  it("la variación es entradas menos salidas", () => {
    expect(i.variacion).toBe(i.bloques.reduce((t, b) => t + b.neto, 0));
    expect(i).toMatchObject({ entradas: 1093996, salidas: 3900000, variacion: -2806004 });
  });
  it("lo anulado se compensa y no aparece", () => {
    const a = armarInforme([{ codigo: "ARRENDAMIENTO", actividad: "operacion", entradas: 2500000, salidas: 2500000 }], (c) => c);
    expect(a.bloques[0].entradas.length + a.bloques[0].salidas.length).toBe(0);
  });
});

describe("saldo disponible en pesos", () => {
  const cuentas = [
    { id: "a", moneda: "COP" as const, es_disponible: true },
    { id: "b", moneda: "USD" as const, es_disponible: true },
    { id: "c", moneda: "COP" as const, es_disponible: false },
  ];
  it("convierte divisas con la última tasa y omite lo no disponible", () => {
    expect(disponibleEnPesos(cuentas, new Map([["a", 100], ["b", 10], ["c", 999]]), new Map([["USD", 4000]]))).toEqual({ total: 40100, sinTasa: [] });
  });
  it("una divisa con saldo y sin tasa queda por fuera y se nombra", () => {
    expect(disponibleEnPesos(cuentas, new Map([["a", 5], ["b", 10]]), new Map())).toEqual({ total: 5, sinTasa: ["USD"] });
    expect(disponibleEnPesos(cuentas, new Map([["a", 5]]), new Map())).toEqual({ total: 5, sinTasa: [] });
  });
  it("el efecto de la tasa cuadra el informe", () => expect(efectoTasa(1000, 500, 1600)).toBe(100));
});

describe("meses", () => {
  it("fechas del mes", () => {
    expect(ultimoDia({ anio: 2026, mes: 2 })).toBe("2026-02-28");
    expect(ultimoDia({ anio: 2028, mes: 2 })).toBe("2028-02-29");
    expect(sumarMeses({ anio: 2026, mes: 12 }, 1)).toEqual({ anio: 2027, mes: 1 });
    expect(sumarMeses({ anio: 2026, mes: 1 }, -1)).toEqual({ anio: 2025, mes: 12 });
    expect(nombreMes({ anio: 2026, mes: 3 })).toBe("marzo de 2026");
    expect(leerMes("2026-13")).toBeNull();
    expect(leerMes("2026-09")).toEqual({ anio: 2026, mes: 9 });
  });
  it("cierre en orden desde el mes del inicio", () => {
    const meses = mesesCerrables("2026-01-15", "2026-04-02");
    expect(meses.map(claveMes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(siguientePorCerrar(meses, new Set(["2026-01"]))).toEqual({ anio: 2026, mes: 2 });
    expect(siguientePorCerrar(meses, new Set(["2026-01", "2026-02", "2026-03"]))).toBeNull();
    expect(mesesCerrables("2026-04-01", "2026-04-20")).toEqual([]);
  });
});
