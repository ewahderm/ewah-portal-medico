import { describe, expect, it } from "vitest";
import { indicadoresAnuales, indicadoresMensuales, type InsumoMes } from "@/lib/sst/indicadores";

const mes = (m: number, p: Partial<InsumoMes> = {}): InsumoMes => ({
  mes: m,
  trabajadores: 20,
  accidentes: 0,
  dias_incapacidad_at: 0,
  dias_cargados: 0,
  at_mortales: 0,
  el_nuevas: 0,
  el_total: 0,
  dias_ausencia: 0,
  dias_programados: 400,
  ...p,
});

describe("indicadores Res. 0312 Art. 30", () => {
  it("mensuales: frecuencia, severidad y ausentismo", () => {
    const [m] = indicadoresMensuales([mes(3, { accidentes: 2, dias_incapacidad_at: 5, dias_cargados: 0, dias_ausencia: 10 })]);
    expect(m).toEqual({ mes: 3, frecuencia: 10, severidad: 25, ausentismo: 2.5 });
  });
  it("sin trabajadores no se divide por cero", () => {
    expect(indicadoresMensuales([mes(1, { trabajadores: 0, dias_programados: 0 })])[0]).toEqual({ mes: 1, frecuencia: null, severidad: null, ausentismo: null });
  });
  it("anuales: mortalidad e incidencia/prevalencia por 100.000 hasta el mes actual", () => {
    const insumos = [mes(1, { accidentes: 3, at_mortales: 1, el_nuevas: 1, el_total: 1 }), mes(2, { el_total: 2, el_nuevas: 1 }), mes(3, { trabajadores: 80, accidentes: 9 })];
    const a = indicadoresAnuales(insumos, 2);
    expect(a.accidentes).toBe(3);
    expect(a.mortalidad).toBe(33.33);
    expect(a.incidenciaEl).toBe(10000);
    expect(a.prevalenciaEl).toBe(10000);
    expect(indicadoresAnuales(insumos).promedioTrabajadores).toBe(40);
  });
  it("prevalencia: casos distintos (existentes al inicio + nuevos), no el máximo mensual", () => {
    // 1 caso antiguo vigente en enero; febrero y marzo traen un caso nuevo cada
    // uno y el antiguo se cierra en febrero: máximo mensual = 2, distintos = 3.
    const insumos = [
      mes(1, { el_total: 1, el_nuevas: 0 }),
      mes(2, { el_total: 2, el_nuevas: 1 }),
      mes(3, { el_total: 1, el_nuevas: 1 }),
    ];
    const a = indicadoresAnuales(insumos);
    expect(a.incidenciaEl).toBe(10000);
    expect(a.prevalenciaEl).toBe(15000);
  });
  it("prevalencia: un caso nacido en enero no cuenta como antiguo", () => {
    const a = indicadoresAnuales([mes(1, { el_total: 1, el_nuevas: 1 }), mes(2, { el_total: 1, el_nuevas: 0 })]);
    expect(a.prevalenciaEl).toBe(5000);
    expect(a.incidenciaEl).toBe(5000);
  });
  it("prevalencia sin meses o sin casos no divide por cero", () => {
    expect(indicadoresAnuales([], 0).prevalenciaEl).toBeNull();
    expect(indicadoresAnuales([mes(1)]).prevalenciaEl).toBe(0);
  });
  it("ausentismo con base homogénea no supera 100 %", () => {
    // 20 personas × 20 días hábiles = 400; todas incapacitadas todo el mes = 400 días hábiles.
    const [m] = indicadoresMensuales([mes(5, { dias_ausencia: 400, dias_programados: 400 })]);
    expect(m.ausentismo).toBe(100);
  });
});
