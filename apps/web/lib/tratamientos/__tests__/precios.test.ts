import { describe, expect, it } from "vitest";
import { precioVigente, repartirTotal, sumaValores, type PrecioTratamiento } from "../precios";

const precios: PrecioTratamiento[] = [
  { tipo_tratamiento_id: "toxina", valor: 800000, vigente_desde: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
  { tipo_tratamiento_id: "toxina", valor: 900000, vigente_desde: "2026-10-01", created_at: "2026-09-20T10:00:00Z" },
  { tipo_tratamiento_id: "toxina", valor: 920000, vigente_desde: "2026-10-01", created_at: "2026-09-25T10:00:00Z" },
  { tipo_tratamiento_id: "toxina", valor: 990000, vigente_desde: "2027-01-01", created_at: "2026-10-05T10:00:00Z" },
  { tipo_tratamiento_id: "consulta", valor: 200000, vigente_desde: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
];

describe("precioVigente", () => {
  it("toma la vigencia más reciente que ya rige, y con la misma vigencia el último registrado", () => {
    expect(precioVigente(precios, "toxina", "2026-10-10")).toBe(920000);
  });
  it("una fecha pasada toma el precio de entonces", () => {
    expect(precioVigente(precios, "toxina", "2026-05-01")).toBe(800000);
  });
  it("un aumento programado rige desde su fecha", () => {
    expect(precioVigente(precios, "toxina", "2026-12-31")).toBe(920000);
    expect(precioVigente(precios, "toxina", "2027-01-01")).toBe(990000);
  });
  it("sin precio para el tipo o antes del primero: null", () => {
    expect(precioVigente(precios, "otro", "2026-10-10")).toBeNull();
    expect(precioVigente(precios, "consulta", "2025-12-31")).toBeNull();
  });
});

describe("repartirTotal", () => {
  const items = [
    { id: "consulta", base: 200000, aplicaDescuento: true },
    { id: "toxina", base: 900000, aplicaDescuento: true },
    { id: "crema", base: 100000, aplicaDescuento: false },
  ];

  it("reparte el descuento en proporción y deja igual lo que no lleva descuento", () => {
    const r = repartirTotal(items, 1090000);
    expect("valores" in r).toBe(true);
    if (!("valores" in r)) return;
    expect(r.valores.crema).toBe(100000);
    // 990.000 a repartir sobre una base de 1.100.000: el 90 % de cada uno.
    expect(r.valores.consulta).toBe(180000);
    expect(r.valores.toxina).toBe(810000);
    expect(sumaValores(r.valores)).toBe(1090000);
  });

  it("la suma siempre cuadra al peso aunque el redondeo no dé exacto", () => {
    const tres = [
      { id: "a", base: 100000, aplicaDescuento: true },
      { id: "b", base: 100000, aplicaDescuento: true },
      { id: "c", base: 100000, aplicaDescuento: true },
    ];
    const r = repartirTotal(tres, 250000);
    if (!("valores" in r)) throw new Error(r.error);
    expect(sumaValores(r.valores)).toBe(250000);
  });

  it("sin descuento devuelve los mismos valores", () => {
    const r = repartirTotal(items, 1200000);
    if (!("valores" in r)) throw new Error(r.error);
    expect(r.valores).toEqual({ consulta: 200000, toxina: 900000, crema: 100000 });
  });

  it("no deja cobrar menos de lo que no lleva descuento", () => {
    expect(repartirTotal(items, 50000)).toEqual({ error: "El total es menor que lo de los tratamientos sin descuento." });
  });

  it("si ninguno acepta descuento, el total debe ser la suma", () => {
    const fijos = items.map((i) => ({ ...i, aplicaDescuento: false }));
    expect("error" in repartirTotal(fijos, 1000000)).toBe(true);
    expect("valores" in repartirTotal(fijos, 1200000)).toBe(true);
  });

  it("rechaza un total inválido", () => {
    expect("error" in repartirTotal(items, Number.NaN)).toBe(true);
    expect("error" in repartirTotal(items, -1)).toBe(true);
  });
});
