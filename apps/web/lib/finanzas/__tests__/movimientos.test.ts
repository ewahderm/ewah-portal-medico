import { describe, expect, it } from "vitest";
import { resumirPeriodo, validarMovimiento, valorEnPesos, type MovimientoEntrada } from "@/lib/finanzas/movimientos";

const ctx = { hoy: "2026-10-08", fechaInicio: "2026-01-01" };
const base: MovimientoEntrada = {
  tipo: "egreso",
  fecha: "2026-10-08",
  monto: 100000,
  moneda: "COP",
  tasa: null,
  categoria: "ARRENDAMIENTO",
  cuentaId: "c1",
  cuentaDestinoId: null,
  monedaDestino: null,
  montoDestino: null,
  socioId: null,
  requiereSocio: false,
};

describe("validarMovimiento", () => {
  it("un egreso completo es válido", () => {
    expect(validarMovimiento(base, ctx)).toBeNull();
  });
  it("fechas: ni futura ni antes del inicio", () => {
    expect(validarMovimiento({ ...base, fecha: "2026-10-09" }, ctx)).toMatch(/futura/);
    expect(validarMovimiento({ ...base, fecha: "2025-12-31" }, ctx)).toMatch(/anterior al inicio/);
  });
  it("monto, cuenta y categoría", () => {
    expect(validarMovimiento({ ...base, monto: 0 }, ctx)).toMatch(/cuánto/);
    expect(validarMovimiento({ ...base, cuentaId: null }, ctx)).toMatch(/de dónde salió/);
    // Primero la categoría (paso 2) y luego la cuenta (paso 3).
    expect(validarMovimiento({ ...base, categoria: null, cuentaId: null }, ctx)).toMatch(/en qué se gastó/);
    expect(validarMovimiento({ ...base, tipo: "ingreso", cuentaId: null }, ctx)).toMatch(/a dónde llegó/);
    expect(validarMovimiento({ ...base, categoria: null }, ctx)).toMatch(/en qué se gastó/);
  });
  it("divisas exigen tasa", () => {
    expect(validarMovimiento({ ...base, moneda: "USD" }, ctx)).toMatch(/USD en pesos/);
    expect(validarMovimiento({ ...base, moneda: "USD", tasa: 4100 }, ctx)).toBeNull();
  });
  it("préstamos exigen socio", () => {
    expect(validarMovimiento({ ...base, requiereSocio: true }, ctx)).toMatch(/socio/);
  });
  it("transferencias: destino distinto y monto destino entre monedas", () => {
    const t: MovimientoEntrada = { ...base, tipo: "transferencia", categoria: null, cuentaDestinoId: "c2", monedaDestino: "COP" };
    expect(validarMovimiento(t, ctx)).toBeNull();
    expect(validarMovimiento({ ...t, cuentaDestinoId: "c1" }, ctx)).toMatch(/distintas/);
    expect(validarMovimiento({ ...t, monedaDestino: "USD" }, ctx)).toMatch(/USD llegaron/);
  });
});

describe("valorEnPesos", () => {
  it("redondea como la BD", () => {
    expect(valorEnPesos(20, "USD", 4123.45)).toBe(82469);
    expect(valorEnPesos(1.5, "EUR", 4500.333)).toBe(6750.5);
    expect(valorEnPesos(5000, "COP", null)).toBe(5000);
  });
});

describe("resumirPeriodo", () => {
  it("entradas, salidas por categoría, sin transferencias y con anulaciones restando", () => {
    const r = resumirPeriodo([
      { tipo: "ingreso", categoria: "SERVICIOS_SALUD", valor_cop: 1000000, origen: "tratamiento" },
      { tipo: "egreso", categoria: "ARRENDAMIENTO", valor_cop: 2500000, origen: "manual" },
      { tipo: "ingreso", categoria: "ARRENDAMIENTO", valor_cop: 2500000, origen: "anulacion" },
      { tipo: "egreso", categoria: "ARRENDAMIENTO", valor_cop: 2400000, origen: "manual" },
      { tipo: "egreso", categoria: "GASOLINA", valor_cop: 100000, origen: "manual" },
      { tipo: "transferencia", categoria: null, valor_cop: 300000, origen: "manual" },
    ]);
    expect(r.entradas).toBe(1000000);
    expect(r.salidas).toBe(2500000);
    expect(r.porCategoria).toEqual([
      { categoria: "ARRENDAMIENTO", salidas: 2400000 },
      { categoria: "GASOLINA", salidas: 100000 },
    ]);
  });
});
