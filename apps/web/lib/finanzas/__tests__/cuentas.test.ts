import { describe, expect, it } from "vitest";
import { resumirCuentas, saldoParaGuardar, saldoParaMostrar, validarAsistente, validarCuenta, type CuentaConSaldo } from "@/lib/finanzas/cuentas";

const base = { fechaInicio: "2026-01-01", hoy: "2026-10-08", cuentas: [{ nombre: "Caja", tipo: "efectivo", moneda: "COP", saldo: 0 }], socios: [] };

describe("asistente de arranque", () => {
  it("acepta lo mínimo", () => {
    expect(validarAsistente(base, false)).toBeNull();
  });
  it("fecha futura, sin cuentas o nombres repetidos", () => {
    expect(validarAsistente({ ...base, fechaInicio: "2026-10-09" }, true)).toMatch(/futura/);
    expect(validarAsistente({ ...base, cuentas: [] }, true)).toMatch(/al menos una/);
    expect(validarAsistente({ ...base, cuentas: [...base.cuentas, { nombre: " caja ", tipo: "banco", moneda: "COP", saldo: 0 }] }, true)).toMatch(/mismo nombre/);
  });
  it("socios: plan Pro, identificación única y participación ≤ 100 %", () => {
    const socios = [
      { nombre: "Ana Socia", numeroIdentificacion: "52123456", porcentaje: 60 },
      { nombre: "Luis Socio", numeroIdentificacion: "79123456", porcentaje: 50 },
    ];
    expect(validarAsistente({ ...base, socios }, false)).toMatch(/plan Pro/);
    expect(validarAsistente({ ...base, socios }, true)).toMatch(/100/);
    expect(validarAsistente({ ...base, socios: [socios[0], { ...socios[1], numeroIdentificacion: "52123456", porcentaje: 10 }] }, true)).toMatch(/misma identificación/);
  });
  it("la tarjeta del socio exige un socio existente", () => {
    const socios = [{ nombre: "Ana Socia", numeroIdentificacion: "52123456", porcentaje: null }];
    const tarjeta = { nombre: "Tarjeta de Ana", tipo: "tarjeta_socio", moneda: "COP", saldo: 350000 };
    expect(validarAsistente({ ...base, socios, cuentas: [tarjeta] }, true)).toMatch(/de qué socio/);
    expect(validarAsistente({ ...base, socios, cuentas: [{ ...tarjeta, socioIndice: 0 }] }, true)).toBeNull();
  });
});

describe("cuentas", () => {
  const o = { gestion: true, socios: 1 };
  it("divisas solo en efectivo; pasarela solo Pro; sin saldos negativos salvo banco", () => {
    expect(validarCuenta({ nombre: "Banco USD", tipo: "banco", moneda: "USD", saldo: 0 }, o)).toMatch(/efectivo/);
    expect(validarCuenta({ nombre: "Bold", tipo: "pasarela", moneda: "COP", saldo: 0 }, { gestion: false, socios: 0 })).toMatch(/Pro/);
    expect(validarCuenta({ nombre: "Nequi", tipo: "nequi", moneda: "COP", saldo: -1 }, o)).toMatch(/negativo/);
    expect(validarCuenta({ nombre: "Banco", tipo: "banco", moneda: "COP", saldo: -1000 }, o)).toBeNull();
  });
  it("la deuda con el socio se digita positiva y se guarda negativa", () => {
    expect(saldoParaGuardar("tarjeta_socio", 350000)).toBe(-350000);
    expect(saldoParaMostrar("tarjeta_socio", -350000)).toBe(350000);
    expect(saldoParaGuardar("banco", -5)).toBe(-5);
  });
  it("resumen: disponible por moneda, por abonar y deuda por socio", () => {
    const c = (p: Partial<CuentaConSaldo>): CuentaConSaldo => ({ id: "x", nombre: "x", tipo: "efectivo", moneda: "COP", saldo: 0, activa: true, socio_id: null, ...p });
    const r = resumirCuentas([
      c({ saldo: 500000 }),
      c({ tipo: "banco", saldo: 12000000 }),
      c({ moneda: "USD", saldo: 200 }),
      c({ tipo: "pasarela", saldo: 93996 }),
      c({ tipo: "tarjeta_socio", saldo: -350000, socio_id: "s1" }),
      c({ tipo: "tarjeta_socio", saldo: -50000, socio_id: "s1" }),
    ]);
    expect(r.disponible).toEqual({ COP: 12500000, USD: 200, EUR: 0 });
    expect(r.porAbonar).toBe(93996);
    expect(r.deudaSocios).toBe(400000);
    expect(r.deudaPorSocio.get("s1")).toBe(400000);
  });
});
