import { describe, expect, it } from "vitest";
import { CLAVE_SIN_PAIS, construirAnaliticaClinica, esRangoFechaValido, type FilaAnalitica } from "../analitica";
import { etiquetaMes, etiquetaTipoPeriodo } from "../formato";

const fila = (overrides: Partial<FilaAnalitica>): FilaAnalitica => ({
  dimension: "resumen",
  periodo: null,
  clave: null,
  nombre: "Periodo",
  pais_iso: null,
  cantidad: 0,
  cantidad_con_valor: 0,
  valor_registrado: 0,
  ...overrides,
});

describe("agregados de analítica clínica", () => {
  it("valida rangos ISO inclusivos de hasta 10 años (3.653 días)", () => {
    expect(esRangoFechaValido("2024-02-29", "2025-02-28")).toBe(true);
    expect(esRangoFechaValido("2024-02-30", "2025-02-28")).toBe(false);
    expect(esRangoFechaValido("2025-02-02", "2025-02-01")).toBe(false);
    // Varios años seguidos ya no se rechazan (antes el tope era 366 días).
    expect(esRangoFechaValido("2024-01-01", "2025-01-02")).toBe(true);
    expect(esRangoFechaValido("2022-01-01", "2026-10-07")).toBe(true);
    // El límite exacto: 3.653 días contando el primero y el último.
    expect(esRangoFechaValido("2015-01-02", "2025-01-01")).toBe(true);
    expect(esRangoFechaValido("2015-01-01", "2025-01-01")).toBe(false);
  });

  it("ordena tendencias y grupos, conserva el país desconocido y entrega los mismos totales para mapa y lista", () => {
    const analitica = construirAnaliticaClinica([
      fila({ cantidad: 4, cantidad_con_valor: 3, valor_registrado: "1250.50" }),
      fila({ dimension: "mes", periodo: "2025-02-01", clave: "2025-02", cantidad: 3, valor_registrado: 900 }),
      fila({ dimension: "mes", periodo: "2025-01-01", clave: "2025-01", cantidad: 1, cantidad_con_valor: 1, valor_registrado: 350.5 }),
      fila({ dimension: "pais", clave: "CO", pais_iso: "CO", nombre: "Colombia", cantidad: 3, valor_registrado: 900 }),
      // Mismo contrato que la SQL: el grupo sin país llega con la clave
      // centinela y sin código ISO.
      fila({ dimension: "pais", clave: CLAVE_SIN_PAIS, pais_iso: null, nombre: "Sin país informado", cantidad: 1, valor_registrado: 350.5 }),
      fila({ dimension: "tratamiento", clave: "00000000-0000-0000-0000-000000000301", nombre: "Facial", cantidad: 4, valor_registrado: 1250.5 }),
    ]);

    expect(analitica.resumen).toEqual({ cantidad: 4, cantidadConValor: 3, valorRegistrado: 1250.5 });
    expect(analitica.tendencia.map((mes) => mes.mes)).toEqual(["2025-01", "2025-02"]);
    expect(analitica.paises[0]).toMatchObject({ codigoIso: "CO", cantidad: 3, valorRegistrado: 900 });
    expect(analitica.paises[1]).toMatchObject({ clave: CLAVE_SIN_PAIS, codigoIso: null, nombre: "Sin país informado", cantidad: 1 });
    expect(analitica.tratamientos[0]).toMatchObject({ clave: "00000000-0000-0000-0000-000000000301", nombre: "Facial" });
  });

  it("rechaza agregados incompletos e inválidos en vez de dibujar cifras ficticias", () => {
    expect(() => construirAnaliticaClinica([])).toThrow("exactamente un resumen");
    expect(() => construirAnaliticaClinica([
      fila({ cantidad: "NaN" }),
    ])).toThrow("cantidad");
  });

  it("conserva valores monetarios negativos sin aceptar cantidades negativas", () => {
    const analitica = construirAnaliticaClinica([
      fila({ cantidad: 1, cantidad_con_valor: 1, valor_registrado: -25 }),
    ]);
    expect(analitica.resumen.valorRegistrado).toBe(-25);
    expect(() => construirAnaliticaClinica([
      fila({ cantidad: -1 }),
    ])).toThrow("cantidad");
  });
});

describe("formatos de presentación", () => {
  it("muestra el mes como texto corto en español, sin pasar por Date", () => {
    expect(etiquetaMes("2026-03")).toBe("mar 2026");
    expect(etiquetaMes("2025-12")).toBe("dic 2025");
    expect(etiquetaMes("2025-13")).toBe("2025-13");
  });

  it("traduce el tipo de periodo de nómina", () => {
    expect(etiquetaTipoPeriodo("quincenal")).toBe("Quincenal");
    expect(etiquetaTipoPeriodo("mensual")).toBe("Mensual");
  });
});
