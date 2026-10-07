import { describe, expect, it } from "vitest";
import { PLANTILLAS_SALUD, nivelProbabilidad, valorar } from "@/lib/sst/gtc45";

describe("valoración GTC 45", () => {
  it("NP = ND × NE y NR = NP × NC", () => {
    expect(valorar(6, 3, 25)).toEqual({ np: 18, nr: 450, nivel: "II" });
  });
  it("cortes de nivel de riesgo", () => {
    expect(valorar(10, 4, 100).nivel).toBe("I"); // 4000
    expect(valorar(10, 3, 25).nivel).toBe("I"); // 750
    expect(valorar(6, 1, 25).nivel).toBe("II"); // 150
    expect(valorar(2, 2, 10).nivel).toBe("III"); // 40
    expect(valorar(2, 1, 10).nivel).toBe("IV"); // 20
    expect(valorar(0, 4, 100).nivel).toBe("IV"); // deficiencia baja
  });
  it("nivel de probabilidad", () => {
    expect(nivelProbabilidad(40)).toBe("Muy alto");
    expect(nivelProbabilidad(24)).toBe("Muy alto");
    expect(nivelProbabilidad(12)).toBe("Alto");
    expect(nivelProbabilidad(6)).toBe("Medio");
    expect(nivelProbabilidad(4)).toBe("Bajo");
  });
  it("plantillas con claves únicas", () => {
    expect(new Set(PLANTILLAS_SALUD.map((p) => p.clave)).size).toBe(PLANTILLAS_SALUD.length);
  });
});
