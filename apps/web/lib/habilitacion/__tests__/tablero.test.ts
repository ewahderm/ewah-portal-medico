import { describe, expect, it } from "vitest";
import { contarPorConfirmar, disciplinaReporte, estandaresDeProgreso, sumarProgreso } from "@/lib/habilitacion/tablero";
import type { FilaProgreso, ObligacionClinica } from "@/lib/habilitacion/tipos";

const fila = (p: Partial<FilaProgreso>): FilaProgreso => ({
  sede_id: "s1",
  servicio_norma_id: "x",
  servicio_clave: "11.1",
  estandar_codigo: "talento_humano",
  total: 0,
  encabezados: 0,
  autorresueltos: 0,
  evaluables: 0,
  cumple: 0,
  no_cumple: 0,
  no_aplica: 0,
  sin_evaluar: 0,
  reverificar: 0,
  asignados_a_mi: 0,
  planes_abiertos: 0,
  ...p,
});

const cfg = (obligacion_id: string, p: Partial<ObligacionClinica> = {}) =>
  ({
    obligacion_id,
    activa: true,
    confirmada: false,
    hab_obligaciones_catalogo: { activacion_default: "auto", requiere_confirmacion_asesor: false },
    ...p,
  }) as unknown as ObligacionClinica;

describe("tablero (F10)", () => {
  it("suma por estándar todas las sedes y servicios", () => {
    const r = estandaresDeProgreso([
      fila({ cumple: 3, sin_evaluar: 1 }),
      fila({ sede_id: "s2", cumple: 2, no_cumple: 1 }),
      fila({ estandar_codigo: "dotacion", no_aplica: 4 }),
    ]);
    expect(r).toEqual([
      { estandar_codigo: "talento_humano", cumple: 5, no_cumple: 1, no_aplica: 0, pendientes: 1 },
      { estandar_codigo: "dotacion", cumple: 0, no_cumple: 0, no_aplica: 4, pendientes: 0 },
    ]);
    expect(sumarProgreso([fila({ reverificar: 2, planes_abiertos: 1 }), fila({ reverificar: 1 })])).toEqual({ reverificar: 3, planesAbiertos: 1 });
  });

  it("disciplina de reporte: a tiempo / vencidas del último año", () => {
    const config = [cfg("a"), cfg("b", { activa: false }), cfg("c", { hab_obligaciones_catalogo: { activacion_default: "por_confirmar", requiere_confirmacion_asesor: false } as never })];
    const r = disciplinaReporte(
      config,
      [
        { obligacion_id: "a", estado: "presentado", fecha_limite: "2026-03-31", fecha_presentacion: "2026-03-30" },
        { obligacion_id: "a", estado: "presentado", fecha_limite: "2026-06-30", fecha_presentacion: "2026-07-02" },
        { obligacion_id: "a", estado: "pendiente", fecha_limite: "2026-09-30", fecha_presentacion: null },
        { obligacion_id: "a", estado: "no_aplica_periodo", fecha_limite: "2026-01-31", fecha_presentacion: null },
        { obligacion_id: "a", estado: "pendiente", fecha_limite: "2026-12-31", fecha_presentacion: null },
        { obligacion_id: "b", estado: "pendiente", fecha_limite: "2026-05-31", fecha_presentacion: null },
        { obligacion_id: "c", estado: "pendiente", fecha_limite: "2026-05-31", fecha_presentacion: null },
      ],
      "2026-10-07",
    );
    expect(r).toEqual({ aTiempo: 1, total: 3, porcentaje: 33 });
    expect(disciplinaReporte(config, [], "2026-10-07").porcentaje).toBeNull();
    expect(contarPorConfirmar(config)).toBe(1);
  });
});
