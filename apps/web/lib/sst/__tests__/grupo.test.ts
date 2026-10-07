import { describe, expect, it } from "vitest";
import { claseDeActividad, comiteSst, diagnosticar, type EntradaGrupo } from "@/lib/sst/grupo";

const base: EntradaGrupo = {
  modo: "empleador",
  dependientes: 0,
  contratistas: 0,
  sinCategoria: 0,
  otros: 0,
  excluyeContratistas: false,
  codigoActividad: "3862101",
  claseClinica: null,
  claseCargosMax: null,
};
const d = (p: Partial<EntradaGrupo>) => diagnosticar({ ...base, ...p });

describe("grupo de estándares SG-SST (Res. 0312)", () => {
  it("clase desde el código del Dec. 768", () => {
    expect(claseDeActividad("3861001")).toBe("III");
    expect(claseDeActividad("1234567")).toBe("I");
    expect(claseDeActividad("8610")).toBeNull();
    expect(claseDeActividad("6861001")).toBeNull();
  });

  it("umbrales 7 / 21 / 60 con riesgo I–III", () => {
    expect(d({ dependientes: 1 }).grupo).toBe("7");
    expect(d({ dependientes: 10 }).grupo).toBe("7");
    expect(d({ dependientes: 11 }).grupo).toBe("21");
    expect(d({ dependientes: 50 }).grupo).toBe("21");
    expect(d({ dependientes: 51 }).grupo).toBe("60");
  });

  it("riesgo IV o V = 60 sin importar el tamaño", () => {
    expect(d({ dependientes: 2, codigoActividad: "4869901" }).grupo).toBe("60");
    expect(d({ dependientes: 2, claseCargosMax: "V" }).estandares).toBe(60);
  });

  it("contratistas cuentan salvo exclusión, y suman los que RRHH no registra", () => {
    expect(d({ dependientes: 8, contratistas: 4 }).trabajadores).toBe(12);
    expect(d({ dependientes: 8, contratistas: 4 }).grupo).toBe("21");
    expect(d({ dependientes: 8, contratistas: 4, excluyeContratistas: true }).grupo).toBe("7");
    expect(d({ dependientes: 8, otros: 3 }).trabajadores).toBe(11);
  });

  it("toma la mayor clase y avisa de las que no coinciden", () => {
    const r = d({ dependientes: 3, codigoActividad: "3862101", claseClinica: "I", claseCargosMax: "III" });
    expect(r.clase).toBe("III");
    expect(r.fuenteClase).toBe("actividad");
    expect(r.clasesDistintas).toEqual([{ fuente: "clinica", clase: "I" }]);
  });

  it("independiente sin trabajadores; sin datos = sin calcular", () => {
    expect(d({ modo: "independiente" }).grupo).toBe("independiente");
    expect(d({ modo: "independiente", dependientes: 1 }).grupo).toBe("7");
    expect(d({}).grupo).toBe("sin_calcular");
    expect(d({ dependientes: 3, codigoActividad: null }).grupo).toBe("sin_calcular");
  });

  it("vigía bajo 10; COPASST con representantes por tamaño", () => {
    expect(comiteSst(9)).toEqual({ tipo: "vigia", representantesPorParte: 1 });
    expect(comiteSst(10)).toEqual({ tipo: "copasst", representantesPorParte: 1 });
    expect(comiteSst(50).representantesPorParte).toBe(2);
    expect(comiteSst(1000).representantesPorParte).toBe(4);
    expect(d({ dependientes: 6 }).convivencia.requerido).toBe(true);
    expect(d({ dependientes: 5 }).convivencia.requerido).toBe(false);
  });
});
