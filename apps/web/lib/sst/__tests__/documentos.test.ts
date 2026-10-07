import { describe, expect, it } from "vitest";
import { DOCUMENTOS_SST, documentosDelGrupo, resumenDocumentos } from "@/lib/sst/documentos-catalogo";

const codigos = (g: Parameters<typeof documentosDelGrupo>[0]) => documentosDelGrupo(g).filter((d) => d.aplica === "si").map((d) => d.codigo);

describe("documentos del SG-SST por grupo", () => {
  it("cada grupo mayor exige al menos lo del menor", () => {
    const g7 = codigos("7");
    const g21 = codigos("21");
    const g60 = codigos("60");
    expect(g7.every((c) => g21.includes(c))).toBe(true);
    expect(g21.every((c) => g60.includes(c))).toBe(true);
    expect(g60.length).toBe(DOCUMENTOS_SST.filter((d) => d.grupos.includes("60")).length);
  });
  it("el independiente tiene una lista corta y el grupo sin calcular ve la de 7", () => {
    expect(codigos("independiente")).toEqual(["SST_AFILIACIONES", "SST_MATRIZ_PELIGROS", "SST_PLAN_EMERGENCIAS", "SST_PROTOCOLO_BIOLOGICO"]);
    expect(codigos("sin_calcular")).toEqual(codigos("7"));
  });
  it("códigos únicos y resumen de cargados", () => {
    expect(new Set(DOCUMENTOS_SST.map((d) => d.codigo)).size).toBe(DOCUMENTOS_SST.length);
    const r = resumenDocumentos(documentosDelGrupo("7"), new Set(["POLITICA_SST", "SST_OBJETIVOS"]));
    expect(r.listos).toBe(1);
    expect(r.faltan).toBe(r.aplican - 1);
  });
});
