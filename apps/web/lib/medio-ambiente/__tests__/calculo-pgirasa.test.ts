import { describe, expect, it } from "vitest";
import {
  calcularPromedioMovilPeligrosos,
  calcularTotalesMensualesResiduos,
  categorizarGenerador,
  construirReportePgirasa,
  ventanaSeisMeses,
  type PesoPeligrosoMensual,
} from "../calculo-pgirasa";

describe("cálculo PGIRASA", () => {
  it("incluye el mes evaluado y los cinco meses calendario anteriores", () => {
    expect(ventanaSeisMeses("2025-02")).toEqual([
      "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02",
    ]);
  });

  it.each([
    [9.999, "micro"],
    [10, "pequeno"],
    [99.999, "pequeno"],
    [100, "mediano"],
    [999.999, "mediano"],
    [1000, "grande"],
  ] as const)("aplica los límites inclusivos: %s kg/mes es %s", (peso, esperado) => {
    expect(categorizarGenerador(peso)).toBe(esperado);
  });

  it("calcula el promedio de seis meses con declaraciones explícitas de cero", () => {
    const meses: Record<string, PesoPeligrosoMensual> = {
      "2024-09": { estado: "medido", kilogramos: 12 },
      "2024-10": { estado: "cero_confirmado", kilogramos: 0 },
      "2024-11": { estado: "medido", kilogramos: 12 },
      "2024-12": { estado: "cero_confirmado", kilogramos: 0 },
      "2025-01": { estado: "medido", kilogramos: 12 },
      "2025-02": { estado: "cero_confirmado", kilogramos: 0 },
    };
    const resultado = calcularPromedioMovilPeligrosos("2025-02", meses);
    expect(resultado.kilogramosMes).toBe(6);
    expect(resultado.categoria).toBe("micro");
    expect(resultado.mesesFaltantes).toEqual([]);
  });

  it("no convierte un mes sin pesaje ni declaración explícita en cero", () => {
    const resultado = calcularPromedioMovilPeligrosos("2025-02", {
      "2024-09": { estado: "medido", kilogramos: 10 },
      "2024-10": { estado: "cero_confirmado", kilogramos: 0 },
      "2024-11": { estado: "medido", kilogramos: 10 },
      "2024-12": { estado: "cero_confirmado", kilogramos: 0 },
      "2025-01": { estado: "medido", kilogramos: 10 },
    });
    expect(resultado.kilogramosMes).toBeNull();
    expect(resultado.categoria).toBeNull();
    expect(resultado.mesesFaltantes).toEqual(["2025-02"]);
  });

  it("mantiene el consolidado mensual de todas las corrientes separado del promedio peligroso", () => {
    const totales = calcularTotalesMensualesResiduos([
      { tipo_residuo: "biosanitario", peso_kg: "2.5" },
      { tipo_residuo: "quimico", peso_kg: "1.25" },
      { tipo_residuo: "aprovechable", peso_kg: "4.0" },
    ]);
    expect(totales.kilogramosTotales).toBe(7.75);
    expect(totales.kilogramosPeligrosos).toBe(3.75);
    expect(totales.porTipo.find((tipo) => tipo.tipo === "quimico")?.etiqueta).toContain("histórico");
    expect(totales.porCorriente).toContainEqual({ corriente: "quimico_historico", kilogramos: 1.25 });
  });

  it("construye el estado mensual desde pesajes y declaraciones auditables por sede", () => {
    const meses = ["2024-09", "2024-11", "2025-01"];
    const filas = [
      ...meses.map((mes) => ({
        mes: `${mes}-01`,
        tipo_residuo: "biosanitario",
        peso_kg: 12,
        confirmacion_id: null,
        confirmado_en: null,
        revocada_en: null,
        motivo_revocacion: null,
      })),
      ...["2024-10", "2024-12", "2025-02"].map((mes) => ({
        mes: `${mes}-01`,
        tipo_residuo: null,
        peso_kg: null,
        confirmacion_id: `id-${mes}`,
        confirmado_en: "2025-03-01T10:00:00Z",
        revocada_en: null,
        motivo_revocacion: null,
      })),
      {
        mes: "2025-02-01",
        tipo_residuo: "aprovechable",
        peso_kg: "2",
        confirmacion_id: null,
        confirmado_en: null,
        revocada_en: null,
        motivo_revocacion: null,
      },
    ];

    const reporte = construirReportePgirasa("2025-02", filas);
    expect(reporte.promedioPeligrosos.kilogramosMes).toBe(6);
    expect(reporte.totalesMensuales.kilogramosTotales).toBe(2);
    expect(reporte.totalesMensuales.kilogramosPeligrosos).toBe(0);
    expect(reporte.confirmaciones).toHaveLength(3);
  });

  it("rechaza datos contradictorios en vez de clasificar pesajes junto a un cero vigente", () => {
    const filas = [
      {
        mes: "2025-02-01",
        tipo_residuo: "biosanitario",
        peso_kg: 1,
        confirmacion_id: null,
        confirmado_en: null,
        revocada_en: null,
        motivo_revocacion: null,
      },
      {
        mes: "2025-02-01",
        tipo_residuo: null,
        peso_kg: null,
        confirmacion_id: "cero-activo",
        confirmado_en: "2025-03-01T10:00:00Z",
        revocada_en: null,
        motivo_revocacion: null,
      },
    ];
    expect(() => construirReportePgirasa("2025-02", filas)).toThrow("pesajes peligrosos y una confirmación de cero");
  });
});
