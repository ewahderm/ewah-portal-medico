import { describe, expect, it } from "vitest";
import { detectarTipoArchivo, sha256Hex, tamanoLegible } from "@/lib/habilitacion/archivos";
import {
  agregarEstados,
  agruparPorServicio,
  derivarEstados,
  FILTROS_VACIOS,
  filtrarCriterios,
  indicadoresDeFilas,
  indicadoresDeProgreso,
} from "@/lib/habilitacion/estado-criterio";
import type { EstadoEvaluacion } from "@/lib/habilitacion/constantes";
import type { FilaCriterio } from "@/lib/habilitacion/tipos";

let n = 0;
function fila(p: Partial<FilaCriterio> & { criterio_id: string }): FilaCriterio {
  n++;
  return {
    codigo: p.criterio_id,
    numero: String(n),
    nivel: 1,
    padre_id: null,
    texto_literal: `Texto ${p.criterio_id}`,
    pagina: 1,
    confianza: "alta",
    nota_vigencia: null,
    vigente_hasta: null,
    es_encabezado: false,
    autorresuelto: false,
    origen: "transversal",
    remitido_desde_codigo: null,
    en_cierre_temporal: false,
    servicio_clave: "11.1",
    servicio_nombre: "Todos los servicios",
    servicio_orden: 1,
    estandar_codigo: "talento_humano",
    bloque_id: "b1",
    bloque_encabezado: null,
    evaluacion_id: null,
    estado: null,
    justificacion: null,
    observacion: null,
    fecha_verificacion: null,
    evaluado_por: null,
    responsable_id: null,
    fecha_objetivo: null,
    evidencias_activas: 0,
    reverificar: false,
    planes_abiertos: 0,
    ...p,
  };
}

describe("agregarEstados", () => {
  const casos: [EstadoEvaluacion[], EstadoEvaluacion][] = [
    [[], "pendiente"],
    [["cumple", "cumple"], "cumple"],
    [["cumple", "no_aplica"], "cumple"],
    [["no_aplica", "no_aplica"], "no_aplica"],
    [["cumple", "pendiente"], "pendiente"],
    [["pendiente", "no_cumple", "cumple"], "no_cumple"],
  ];
  it.each(casos)("%j → %s", (entrada, esperado) => {
    expect(agregarEstados(entrada)).toBe(esperado);
  });
});

describe("derivarEstados", () => {
  it("un encabezado toma el estado de sus hijos, también anidados", () => {
    const filas = [
      fila({ criterio_id: "P", es_encabezado: true }),
      fila({ criterio_id: "H1", padre_id: "P", estado: "cumple" }),
      fila({ criterio_id: "H2", padre_id: "P", es_encabezado: true }),
      fila({ criterio_id: "N1", padre_id: "H2", estado: "cumple" }),
      fila({ criterio_id: "N2", padre_id: "H2", estado: "no_aplica" }),
    ];
    const e = derivarEstados(filas);
    expect(e.get("H2")).toMatchObject({ estado: "cumple", fuente: "hijos", cumplen: 1, total: 2 });
    expect(e.get("P")).toMatchObject({ estado: "cumple", cumplen: 2, total: 2 });
  });

  it("un No cumple en un nieto hace No cumple al encabezado", () => {
    const filas = [
      fila({ criterio_id: "P", es_encabezado: true }),
      fila({ criterio_id: "H", padre_id: "P", es_encabezado: true }),
      fila({ criterio_id: "N", padre_id: "H", estado: "no_cumple" }),
    ];
    expect(derivarEstados(filas).get("P")?.estado).toBe("no_cumple");
  });

  it("un autorresuelto toma el agregado de 11.1 del mismo estándar, también como hijo de un encabezado", () => {
    const filas = [
      fila({ criterio_id: "T1", estado: "cumple" }),
      fila({ criterio_id: "T2", estado: "cumple" }),
      fila({ criterio_id: "I1", estandar_codigo: "infraestructura", estado: "no_cumple" }),
      fila({ criterio_id: "P", servicio_clave: "11.2.1", es_encabezado: true }),
      fila({ criterio_id: "A", servicio_clave: "11.2.1", padre_id: "P", autorresuelto: true }),
    ];
    const e = derivarEstados(filas);
    expect(e.get("A")).toMatchObject({ estado: "cumple", fuente: "11.1", cumplen: 2, total: 2 });
    expect(e.get("P")?.estado).toBe("cumple");
  });

  it("un ciclo de padres mal sembrado no cuelga", () => {
    const filas = [
      fila({ criterio_id: "X", padre_id: "Y", es_encabezado: true }),
      fila({ criterio_id: "Y", padre_id: "X", es_encabezado: true }),
    ];
    expect(() => derivarEstados(filas)).not.toThrow();
  });
});

describe("indicadores", () => {
  it("No aplica sale del denominador; encabezados y autorresueltos no cuentan", () => {
    const filas = [
      fila({ criterio_id: "a", estado: "cumple" }),
      fila({ criterio_id: "b", estado: "cumple" }),
      fila({ criterio_id: "c", estado: "no_cumple" }),
      fila({ criterio_id: "d", estado: null }),
      fila({ criterio_id: "e", estado: "no_aplica" }),
      fila({ criterio_id: "f", es_encabezado: true }),
      fila({ criterio_id: "g", autorresuelto: true }),
    ];
    expect(indicadoresDeFilas(filas)).toEqual({
      evaluables: 5,
      cumple: 2,
      noCumple: 1,
      noAplica: 1,
      pendientes: 1,
      evaluados: 4,
      porcentajeCumplimiento: 50,
      porcentajeAvance: 80,
    });
  });

  it("todo No aplica = no calculable", () => {
    const r = indicadoresDeProgreso([{ cumple: 0, no_cumple: 0, no_aplica: 3, sin_evaluar: 0 }]);
    expect(r.porcentajeCumplimiento).toBeNull();
    expect(r.porcentajeAvance).toBe(100);
  });

  it("suma filas de progreso", () => {
    const r = indicadoresDeProgreso([
      { cumple: 3, no_cumple: 1, no_aplica: 0, sin_evaluar: 0 },
      { cumple: 1, no_cumple: 0, no_aplica: 2, sin_evaluar: 4 },
    ]);
    expect(r).toMatchObject({ evaluables: 11, evaluados: 7, porcentajeCumplimiento: 44, porcentajeAvance: 64 });
  });
});

describe("filtrarCriterios", () => {
  const filas = [
    fila({ criterio_id: "P", es_encabezado: true, texto_literal: "Cuenta con:" }),
    fila({ criterio_id: "H1", padre_id: "P", estado: "cumple", texto_literal: "Título de médico" }),
    fila({ criterio_id: "H2", padre_id: "P", estado: null, texto_literal: "Tarjeta profesional", responsable_id: "u1" }),
    fila({ criterio_id: "S", servicio_clave: "11.2.2", estado: "no_cumple", reverificar: true, texto_literal: "Atención especializada" }),
    fila({ criterio_id: "A", servicio_clave: "11.2.1", autorresuelto: true }),
  ];
  const estados = derivarEstados(filas);
  const ver = (f: Partial<typeof FILTROS_VACIOS>) => [...filtrarCriterios(filas, { ...FILTROS_VACIOS, ...f }, estados)].sort();

  it("sin filtros se ve todo", () => {
    expect(ver({})).toEqual(["A", "H1", "H2", "P", "S"]);
  });
  it("el encabezado aparece como contexto de un hijo que pasa el filtro", () => {
    expect(ver({ estado: "pendiente" })).toEqual(["A", "H2", "P"]);
  });
  it("texto sin tildes ni mayúsculas", () => {
    expect(ver({ texto: "TITULO" })).toEqual(["H1", "P"]);
  });
  it("asignados a mí y re-verificar excluyen autorresueltos", () => {
    expect(ver({ asignadosA: "u1" })).toEqual(["H2", "P"]);
    expect(ver({ reverificar: true })).toEqual(["S"]);
  });
  it("por servicio", () => {
    expect(ver({ servicio: "11.2.2" })).toEqual(["S"]);
  });
});

describe("agruparPorServicio", () => {
  it("ordena por el orden de la norma", () => {
    const g = agruparPorServicio([
      fila({ criterio_id: "x", servicio_clave: "11.2.2", servicio_nombre: "Especializada", servicio_orden: 5 }),
      fila({ criterio_id: "y", servicio_clave: "11.1", servicio_orden: 1 }),
      fila({ criterio_id: "z", servicio_clave: "11.2.2", servicio_nombre: "Especializada", servicio_orden: 5 }),
    ]);
    expect(g.map((x) => [x.clave, x.filas.length])).toEqual([["11.1", 1], ["11.2.2", 2]]);
  });
});

describe("detectarTipoArchivo", () => {
  const bytes = (...partes: (number[] | string)[]) =>
    new Uint8Array(partes.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

  it("reconoce PDF, JPG, PNG y WEBP por la firma", () => {
    expect(detectarTipoArchivo(bytes("%PDF-1.7\n"))?.extension).toBe("pdf");
    expect(detectarTipoArchivo(bytes([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detectarTipoArchivo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.extension).toBe("png");
    expect(detectarTipoArchivo(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))?.extension).toBe("webp");
  });
  it("distingue Word y Excel dentro del zip", () => {
    const zip = (parte: string) => bytes([0x50, 0x4b, 0x03, 0x04], "....[Content_Types].xml....", parte);
    expect(detectarTipoArchivo(zip("word/document.xml"))?.extension).toBe("docx");
    expect(detectarTipoArchivo(zip("xl/workbook.xml"))?.extension).toBe("xlsx");
    expect(detectarTipoArchivo(zip("cualquier/otra.xml"))).toBeNull();
  });
  it("rechaza un ejecutable con extensión .pdf (la extensión no importa)", () => {
    expect(detectarTipoArchivo(bytes("MZ", [0x90, 0]))).toBeNull();
    expect(detectarTipoArchivo(bytes("<html>%PDF-"))).toBeNull();
    expect(detectarTipoArchivo(new Uint8Array())).toBeNull();
  });
});

describe("utilidades de archivo", () => {
  it("sha256 en hex", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("tamaño legible en es-CO", () => {
    expect(tamanoLegible(500)).toBe("500 B");
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});
