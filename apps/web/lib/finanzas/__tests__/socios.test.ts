import { describe, expect, it } from "vitest";
import { topeOperacion, validarOperacionSocio } from "../socios";

const s = { deuda_tarjeta: 500000, prestado_a_socio: 1000000, prestado_por_socio: 0 };

describe("operaciones con socios", () => {
  it("los reembolsos y devoluciones tienen tope; los préstamos no", () => {
    expect(topeOperacion("reembolso", s)).toBe(500000);
    expect(topeOperacion("reembolso", s, 200000)).toBe(200000);
    expect(topeOperacion("socio_devuelve", s)).toBe(1000000);
    expect(topeOperacion("clinica_devuelve", s)).toBe(0);
    expect(topeOperacion("prestamo_a_socio", s)).toBeNull();
    expect(topeOperacion("reembolso", { ...s, deuda_tarjeta: -5 })).toBe(0);
  });
  it("valida cuenta, fecha, valor y tope", () => {
    const base = { monto: 100, fecha: "2026-03-02", cuentaId: "c", hoy: "2026-03-05", fechaInicio: "2026-01-01", tope: 500 };
    expect(validarOperacionSocio(base)).toBeNull();
    expect(validarOperacionSocio({ ...base, cuentaId: null })).toMatch(/cuenta/);
    expect(validarOperacionSocio({ ...base, fecha: "2026-03-06" })).toMatch(/futura/);
    expect(validarOperacionSocio({ ...base, fecha: "2025-12-31" })).toMatch(/inicio/);
    expect(validarOperacionSocio({ ...base, monto: 0 })).toMatch(/valor/);
    expect(validarOperacionSocio({ ...base, monto: 501 })).toMatch(/pendiente/);
    expect(validarOperacionSocio({ ...base, monto: 501, tope: null })).toBeNull();
  });
});
