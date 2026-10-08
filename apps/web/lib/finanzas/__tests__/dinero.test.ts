import { describe, expect, it } from "vitest";
import { formatoDinero, leerMonto } from "@/lib/finanzas/dinero";

describe("leerMonto", () => {
  it.each([
    ["12.000.000", 12000000],
    ["12000000", 12000000],
    ["1.250,50", 1250.5],
    ["$ 300", 300],
    ["1,5", 1.5],
    ["12.5", 12.5],
    ["-350.000", -350000],
    ["0", 0],
    [" 200 USD", 200],
  ])("%s → %s", (texto, esperado) => {
    expect(leerMonto(texto)).toBe(esperado);
  });
  it.each(["", "abc", "1,2,3", "12.00.0", "1.234,567", "1,234.5", "--5", null])("rechaza %s", (texto) => {
    expect(leerMonto(texto as string | null)).toBeNull();
  });
});

describe("formatoDinero", () => {
  it("pesos sin decimales y divisas con 2", () => {
    expect(formatoDinero(12000000).replace(/\s/g, " ")).toMatch(/12\.000\.000/);
    expect(formatoDinero(200, "USD")).toMatch(/200,00/);
    expect(formatoDinero(1.5, "EUR")).toMatch(/1,50/);
    expect(formatoDinero(null)).toBe("—");
  });
});
