import { describe, expect, it } from "vitest";
import { avance, nivelDe, porCiclo } from "@/lib/sst/estandares";

describe("calificación de estándares mínimos", () => {
  it("niveles: < 60 crítico, 60–85 moderado, > 85 aceptable", () => {
    expect(nivelDe(59.99)).toBe("critico");
    expect(nivelDe(60)).toBe("moderado");
    expect(nivelDe(85)).toBe("moderado");
    expect(nivelDe(85.01)).toBe("aceptable");
  });
  it("cumple y no aplica suman; lo pendiente cuenta como no cumplido", () => {
    const a = avance([
      { estado: "cumple", peso: 4 },
      { estado: "no_aplica", peso: 2 },
      { estado: "no_cumple", peso: 2 },
      { estado: "pendiente", peso: 2 },
    ]);
    expect(a).toEqual({ total: 4, calificados: 3, pendientes: 1, puntaje: 60, nivel: "moderado" });
  });
  it("sobre el peso del grupo, no sobre 100", () => {
    expect(avance([{ estado: "cumple", peso: 0.5 }, { estado: "cumple", peso: 1 }]).puntaje).toBe(100);
    expect(avance([]).puntaje).toBe(0);
  });
  it("por ciclo PHVA", () => {
    const r = porCiclo([
      { ciclo: "planear", estado: "cumple", peso: 1.5 },
      { ciclo: "planear", estado: "no_cumple", peso: 1 },
      { ciclo: "actuar", estado: "no_aplica", peso: 2.5 },
    ]);
    expect(r.planear).toEqual({ logrado: 1.5, posible: 2.5 });
    expect(r.actuar).toEqual({ logrado: 2.5, posible: 2.5 });
    expect(r.hacer).toEqual({ logrado: 0, posible: 0 });
  });
});
