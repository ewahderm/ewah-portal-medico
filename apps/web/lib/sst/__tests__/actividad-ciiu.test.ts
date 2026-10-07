import { describe, expect, it } from "vitest";
import { claseDeActividad, diagnosticar, type EntradaGrupo } from "@/lib/sst/grupo";

// La actividad económica de la clínica es el CIIU del RUT (4 dígitos). Ese
// código no trae la clase de riesgo: SG-SST la toma del nivel de riesgo ARL
// por defecto (clinicas.clase_riesgo_id) o de los cargos.
const base: EntradaGrupo = {
  modo: "empleador",
  dependientes: 5,
  contratistas: 0,
  sinCategoria: 0,
  otros: 0,
  excluyeContratistas: false,
  codigoActividad: "8621",
  claseClinica: null,
  claseCargosMax: null,
};

describe("actividad económica con el CIIU del RUT (4 dígitos)", () => {
  it("el CIIU no aporta clase de riesgo", () => {
    expect(claseDeActividad("8621")).toBeNull();
  });

  it("sin nivel de riesgo ARL el diagnóstico no se calcula y dice dónde elegirlo", () => {
    const r = diagnosticar(base);
    expect(r.grupo).toBe("sin_calcular");
    expect(r.motivo).toContain("Parámetros > Datos básicos");
  });

  it("con el nivel de riesgo ARL de la clínica se calcula con la clase de la clínica", () => {
    const r = diagnosticar({ ...base, claseClinica: "II" });
    expect(r.clase).toBe("II");
    expect(r.fuenteClase).toBe("clinica");
    expect(r.grupo).toBe("7");
  });

  it("riesgo IV desde el nivel ARL de la clínica sigue exigiendo 60 estándares", () => {
    expect(diagnosticar({ ...base, claseClinica: "IV" }).grupo).toBe("60");
  });

  it("un código ARL de 7 dígitos ya guardado sigue aportando su clase", () => {
    const r = diagnosticar({ ...base, codigoActividad: "3862101" });
    expect(r.clase).toBe("III");
    expect(r.fuenteClase).toBe("actividad");
  });
});
