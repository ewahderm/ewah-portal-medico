import { describe, expect, it } from "vitest";
import { configDeDestino, destinoDeConfig, resumirPendientes, validarCobro, type IngresoPendiente } from "../tratamientos";

const fila = (p: Partial<IngresoPendiente>): IngresoPendiente => ({
  tratamiento_id: crypto.randomUUID(),
  fecha: "2026-03-02",
  valor: 100000,
  situacion: "por_generar",
  movimiento_id: null,
  medio_pago_id: "m1",
  medio_pago: "Efectivo",
  tratamiento: "Consulta",
  paciente: "Ana Pérez",
  sede_id: "s1",
  ...p,
});

describe("destino de un medio de pago", () => {
  it("ida y vuelta entre la configuración y el selector", () => {
    expect(destinoDeConfig(undefined)).toBe("sin");
    expect(destinoDeConfig({ cuenta_id: null, es_credito: false })).toBe("sin");
    expect(destinoDeConfig({ cuenta_id: null, es_credito: true })).toBe("credito");
    expect(destinoDeConfig({ cuenta_id: "c1", es_credito: false })).toBe("c1");
    expect(configDeDestino("sin")).toEqual({ cuenta_id: null, es_credito: false });
    expect(configDeDestino("credito")).toEqual({ cuenta_id: null, es_credito: true });
    expect(configDeDestino("c1")).toEqual({ cuenta_id: "c1", es_credito: false });
  });
});

describe("resumirPendientes", () => {
  it("separa lo que se pone al día solo, lo por cobrar y lo por revisar", () => {
    const r = resumirPendientes([
      fila({ situacion: "por_generar", valor: 80000 }),
      fila({ situacion: "por_generar", valor: 20000 }),
      fila({ situacion: "anulado_con_ingreso", movimiento_id: "x" }),
      fila({ situacion: "por_cobrar", valor: 300000 }),
      fila({ situacion: "sin_valor", valor: null }),
      fila({ situacion: "fecha_futura" }),
      fila({ situacion: "corregido_sin_anular", movimiento_id: "y" }),
      fila({ situacion: "anulado_liquidado", movimiento_id: "z" }),
      fila({ situacion: "medio_sin_cuenta", medio_pago_id: "m2", medio_pago: "Nequi", valor: 50000 }),
      fila({ situacion: "medio_sin_cuenta", medio_pago_id: "m2", medio_pago: "Nequi", valor: 70000 }),
      fila({ situacion: "medio_sin_cuenta", medio_pago_id: "m3", medio_pago: "PSE", valor: 10000 }),
    ]);
    expect(r.porGenerar).toEqual({ cantidad: 2, valor: 100000 });
    expect(r.anuladosConIngreso).toBe(1);
    expect(r.porCobrar).toEqual({ cantidad: 1, valor: 300000 });
    expect(r.porRevisar).toBe(6);
    expect(r.fechaFutura).toBe(1);
    expect(r.mediosSinCuenta).toEqual([
      { medioPagoId: "m2", nombre: "Nequi", cantidad: 2, valor: 120000 },
      { medioPagoId: "m3", nombre: "PSE", cantidad: 1, valor: 10000 },
    ]);
  });

  it("sin pendientes todo queda en cero", () => {
    const r = resumirPendientes([]);
    expect(r.porGenerar.cantidad + r.porCobrar.cantidad + r.porRevisar + r.anuladosConIngreso).toBe(0);
  });
});

describe("validarCobro", () => {
  const base = { monto: 100000, fecha: "2026-03-02", cuentaId: "c1", hoy: "2026-03-10", fechaInicio: "2026-01-01" };
  it("acepta un cobro completo", () => expect(validarCobro(base)).toBeNull());
  it("pide la cuenta", () => expect(validarCobro({ ...base, cuentaId: null })).toMatch(/cuenta/));
  it("no deja fechas futuras ni anteriores al inicio", () => {
    expect(validarCobro({ ...base, fecha: "2026-03-11" })).toMatch(/futura/);
    expect(validarCobro({ ...base, fecha: "2025-12-31" })).toMatch(/inicio/);
    expect(validarCobro({ ...base, fecha: "" })).toMatch(/fecha/);
  });
  it("pide un valor positivo", () => {
    expect(validarCobro({ ...base, monto: null })).toMatch(/valor/);
    expect(validarCobro({ ...base, monto: 0 })).toMatch(/valor/);
    expect(validarCobro({ ...base, monto: Number.NaN })).toMatch(/valor/);
  });
});
