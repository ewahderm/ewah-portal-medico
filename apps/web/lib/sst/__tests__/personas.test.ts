import { describe, expect, it } from "vitest";
import { estadoExamen } from "@/lib/sst/personas";

const p = (x: Partial<Parameters<typeof estadoExamen>[0]>) => ({ ultimo_examen: "2025-10-01", proximo_examen: "2026-10-01", periodicidad_meses: 12, cargo_id: "c", ...x });

describe("estado del examen periódico", () => {
  it("vencido, próximo y al día", () => {
    expect(estadoExamen(p({}), "2026-10-05")).toEqual({ semaforo: "rojo", texto: "Periódico vencido hace 4 días" });
    expect(estadoExamen(p({}), "2026-09-21").semaforo).toBe("ambar");
    expect(estadoExamen(p({}), "2026-06-01").semaforo).toBe("verde");
  });
  it("faltantes", () => {
    expect(estadoExamen(p({ ultimo_examen: null }), "2026-06-01").semaforo).toBe("rojo");
    expect(estadoExamen(p({ cargo_id: null }), "2026-06-01").semaforo).toBe("por_confirmar");
    expect(estadoExamen(p({ periodicidad_meses: null, proximo_examen: null }), "2026-06-01").texto).toBe("Define la periodicidad del cargo");
  });
});
