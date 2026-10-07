import { describe, expect, it } from "vitest";
import { construirReporteInvima } from "../invima";
import { agruparComisionesNomina, type ComisionFuente } from "../nomina";

describe("reporte regulatorio de inventario", () => {
  it("incluye solo insumos marcados para reporte, también si están inactivos", () => {
    const resultado = construirReporteInvima([
      {
        codigo: "B",
        nombre: "Insumo inactivo",
        unidad_medida: "ml",
        registro_sanitario: "RS-2",
        unidad_medida_registro_sanitario: "ml",
        fecha_vencimiento_registro_sanitario: "2028-01-01",
        referencia_reportada: "Ref-2",
        presentacion_comercial_reportada: "Caja",
        reporte_regulatorio: true,
        activo: false,
      },
      {
        codigo: "X",
        nombre: "No reportable",
        unidad_medida: "g",
        registro_sanitario: null,
        unidad_medida_registro_sanitario: null,
        fecha_vencimiento_registro_sanitario: null,
        referencia_reportada: null,
        presentacion_comercial_reportada: null,
        reporte_regulatorio: false,
        activo: true,
      },
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ codigo: "B", nombre: "Insumo inactivo", registroSanitario: "RS-2" });
  });
});

describe("comisiones de nómina", () => {
  const recibo = (overrides: Partial<ComisionFuente>): ComisionFuente => ({
    empleadoId: "emp-1",
    empleadoNombre: "Ana",
    tipoPeriodo: "quincenal",
    fechaInicio: "2025-01-01",
    fechaFin: "2025-01-15",
    comisiones: 100,
    anulado: false,
    ...overrides,
  });

  it("agrupa valores almacenados por empleado y periodo y excluye recibos anulados", () => {
    const resultado = agruparComisionesNomina([
      recibo({ comisiones: "100.50" }),
      recibo({ comisiones: 25 }),
      recibo({ empleadoId: "emp-2", empleadoNombre: "Bea", comisiones: 80 }),
      recibo({ comisiones: 900, anulado: true }),
      recibo({ fechaInicio: "2025-01-16", fechaFin: "2025-01-31", comisiones: 40 }),
    ]);
    expect(resultado).toEqual([
      expect.objectContaining({ empleadoNombre: "Ana", fechaInicio: "2025-01-01", comisiones: 125.5 }),
      expect.objectContaining({ empleadoNombre: "Bea", fechaInicio: "2025-01-01", comisiones: 80 }),
      expect.objectContaining({ empleadoNombre: "Ana", fechaInicio: "2025-01-16", comisiones: 40 }),
    ]);
  });

  it("rechaza importes ausentes en vez de sustituirlos por cero", () => {
    expect(() => agruparComisionesNomina([recibo({ comisiones: null })])).toThrow("sin valor numérico");
  });
});
