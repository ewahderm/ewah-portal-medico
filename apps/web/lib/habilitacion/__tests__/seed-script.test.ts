// @vitest-environment node
//
// Pruebas del generador de siembra del módulo de Habilitación (F0).
// La lógica vive en scripts/habilitacion/lib/*.mjs (Node puro, sin
// dependencias); aquí solo se importa y se prueba.
import { describe, expect, it } from "vitest";
import { uuidv5, idPracticaMedica, NAMESPACE_PROYECTO } from "../../../../../scripts/habilitacion/lib/uuid.mjs";
import { texto, arreglo, insertarPorLotes, crudo } from "../../../../../scripts/habilitacion/lib/sql.mjs";
import { fechaLimiteRegla, fechasLimite, ultimoDiaMes } from "../../../../../scripts/habilitacion/lib/fechas.mjs";
import { festivosColombia, domingoDePascua, alLunesSiguiente } from "../../../../../scripts/habilitacion/lib/festivos.mjs";
import { expandirModalidades, expandirVencimientos } from "../../../../../scripts/habilitacion/lib/modelo.mjs";
import { bloqueCoincide, resolverCriterios } from "../../../../../scripts/habilitacion/lib/motor.mjs";
import { auditarBloque, validarTodo, SEDE_EWAH } from "../../../../../scripts/habilitacion/lib/validaciones.mjs";
import { cargarTodo, sha256 } from "../../../../../scripts/habilitacion/lib/cargar.mjs";
import { construirModelo } from "../../../../../scripts/habilitacion/lib/modelo.mjs";
import { generarSeed } from "../../../../../scripts/habilitacion/generar-seed.mjs";

const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("uuid v5", () => {
  it("cumple el vector conocido del RFC (www.example.com en el namespace DNS)", () => {
    expect(uuidv5("www.example.com", DNS)).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("produce los mismos uuid que la migración 0061 para las prácticas nuevas de D2", () => {
    expect(NAMESPACE_PROYECTO).toBe("05a6798d-3cc3-5f50-b6af-a9d34aa0ca60");
    expect(idPracticaMedica("Cuidado Intermedio Pediátrico")).toBe("3673c387-2801-50f0-8a00-927c8981a1a9");
    expect(idPracticaMedica("Cuidado Intermedio Neonatal")).toBe("289d037a-58b5-5064-b9b2-edb4b3d87107");
    expect(idPracticaMedica("Cuidado Intensivo Pediátrico")).toBe("9de2eef7-0330-5f70-b491-6e6e7b502a57");
    expect(idPracticaMedica("Cuidado Intensivo Neonatal")).toBe("9067fd2f-72ac-5e98-a8ac-1f93007a9581");
  });
});

describe("literales SQL", () => {
  it("duplica la comilla simple y no usa dollar-quoting", () => {
    expect(texto("Res. 'x' $1 $$")).toBe("'Res. ''x'' $1 $$'");
  });

  it("distingue null de arreglo vacío", () => {
    expect(arreglo(null)).toBe("null");
    expect(arreglo([])).toBe("'{}'::text[]");
    expect(arreglo(["a", "b'c"])).toBe("array['a', 'b''c']::text[]");
  });

  it("parte en lotes de 500 y valida el número de columnas", () => {
    const filas = Array.from({ length: 1001 }, (_, i) => [i, crudo("now()")]);
    const sql = insertarPorLotes({ tabla: "t", columnas: ["a", "b"], filas, conflicto: "(a)" });
    expect(sql.match(/insert into t/g)).toHaveLength(3);
    expect(sql).toContain("(1000, now())");
    expect(() => insertarPorLotes({ tabla: "t", columnas: ["a"], filas: [[1, 2]], conflicto: "(a)" })).toThrow();
  });
});

describe("reglas de fecha", () => {
  it("corte de diciembre con meses_despues = 2 vence el 20 de febrero del año siguiente", () => {
    expect(fechaLimiteRegla({ mes_corte: 12, dia_corte: null, meses_despues: 2, dia_limite: 20 }, 2026)).toEqual({
      corte: "2026-12-31",
      limite: "2027-02-20",
    });
  });

  it("un día límite que no existe en el mes usa el último día (29-feb en bisiesto)", () => {
    expect(fechaLimiteRegla({ mes_corte: 1, dia_corte: null, meses_despues: 1, dia_limite: 31 }, 2028).limite).toBe("2028-02-29");
    expect(ultimoDiaMes(2027, 2)).toBe(28);
  });

  it("deduplica fechas iguales (corte dic y corte ene vencen ambos el 20-feb)", () => {
    const reglas = expandirVencimientos([{ plantilla: "mensual", meses_despues: 1, dia_limite: 20, excepcion_diciembre: { meses_despues: 2, dia_limite: 20 } }]);
    expect(reglas).toHaveLength(12);
    const fechas = fechasLimite(reglas, { grupo: "D1", tipo: "ips" }, "2027-01-01", "2027-03-31");
    expect(fechas).toEqual(["2027-02-20", "2027-03-20"]);
  });

  it("respeta grupos y tipos de la regla", () => {
    const reglas = [{ aplica_a_grupos: ["C2"], aplica_a_tipos: null, mes_corte: 6, dia_corte: null, meses_despues: 1, dia_limite: 20 }];
    expect(fechasLimite(reglas, { grupo: "D3", tipo: "ips" }, "2027-01-01", "2027-12-31")).toEqual([]);
    expect(fechasLimite(reglas, { grupo: "C2", tipo: "ips" }, "2027-01-01", "2027-12-31")).toEqual(["2027-07-20"]);
  });
});

describe("festivos de Colombia", () => {
  it("calcula Pascua y los 18 festivos de 2026", () => {
    expect(domingoDePascua(2026)).toBe("2026-04-05");
    const f2026 = festivosColombia(2026).map((f) => f.fecha);
    expect(f2026).toHaveLength(18);
    expect(f2026).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15",
      "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("20-jul-2027 es festivo (caso citado en reportes.json) y el traslado de Ley Emiliani cae en lunes", () => {
    expect(festivosColombia(2027).map((f) => f.fecha)).toContain("2027-07-20");
    expect(alLunesSiguiente("2027-06-29")).toBe("2027-07-05");
    expect(alLunesSiguiente("2026-06-29")).toBe("2026-06-29");
  });
});

describe("bloques y motor de referencia", () => {
  const base = {
    aplica_complejidad: null,
    aplica_modalidad: null,
    aplica_telemedicina_categoria: null,
    aplica_telemedicina_rol: null,
    aplica_tipo_edificacion: null,
  };
  const ctx = { complejidades: ["mediana"], modalidades: ["intramural"], telemedicina_categorias: [], telemedicina_roles: [] };

  it("expande 'extramural' a sus tres sub-modalidades en orden canónico", () => {
    expect(expandirModalidades(["telemedicina", "extramural"])).toEqual([
      "extramural",
      "extramural_unidad_movil",
      "extramural_jornada_salud",
      "extramural_domiciliaria",
      "telemedicina",
    ]);
    expect(expandirModalidades(null)).toBeNull();
  });

  it("un bloque 'intramural, telemedicina – remisor' aplica a una sede solo intramural", () => {
    expect(bloqueCoincide({ ...base, aplica_modalidad: ["intramural", "telemedicina"], aplica_telemedicina_rol: ["prestador_remisor"] }, ctx, null)).toBe(true);
  });

  it("el rol de telemedicina filtra aunque el bloque no restrinja categoría", () => {
    const b = { ...base, aplica_modalidad: ["telemedicina"], aplica_telemedicina_rol: ["prestador_referencia"] };
    const remisor = { ...ctx, modalidades: ["telemedicina"], telemedicina_roles: ["prestador_remisor"] };
    expect(bloqueCoincide(b, remisor, null)).toBe(false);
    expect(bloqueCoincide(b, { ...remisor, telemedicina_roles: ["prestador_referencia"] }, null)).toBe(true);
  });

  it("edificación desconocida en la sede incluye ambos bloques (conservador)", () => {
    const mixto = { ...base, aplica_tipo_edificacion: "mixto" };
    expect(bloqueCoincide(mixto, ctx, null)).toBe(true);
    expect(bloqueCoincide(mixto, ctx, "exclusivo_salud")).toBe(false);
  });

  it("la auditoría detecta un encabezado con 'intramural' que el arreglo omite", () => {
    const b = {
      ...base,
      encabezado_literal: "Complejidad mediana / Modalidades intramural, extramural unidad móvil, jornada de salud y domiciliaria",
      aplica_complejidad: ["mediana"],
      aplica_modalidad: ["extramural_unidad_movil", "extramural_jornada_salud", "extramural_domiciliaria"],
    };
    expect(auditarBloque(b)).toEqual(["falta modalidad intramural"]);
  });
});

describe("generación completa (fuentes congeladas + curaduría)", () => {
  const entrada = cargarTodo();
  const modelo = construirModelo(entrada);

  it("las 9 validaciones de §2.3 están en verde", () => {
    const fallas = validarTodo(entrada, modelo).filter((r) => !r.ok);
    expect(fallas.map((f) => `${f.n}. ${f.nombre}: ${f.detalle.join(" | ")}`)).toEqual([]);
  });

  it("es determinista: dos generaciones producen el mismo SHA-256", () => {
    const a = generarSeed();
    const b = generarSeed();
    expect(a.archivos).not.toBeNull();
    expect(a.archivos!.map((f) => sha256(f.sql))).toEqual(b.archivos!.map((f) => sha256(f.sql)));
    expect(a.archivos!.map((f) => f.nombre)).toEqual(["0063_habilitacion_seed_norma.sql", "0064_habilitacion_seed_catalogos.sql"]);
  });

  it("siembra los conteos esperados", () => {
    expect(modelo.criterios).toHaveLength(3976);
    expect(modelo.bloques).toHaveLength(708);
    expect(modelo.servicios).toHaveLength(42);
    expect(modelo.criterios.filter((c) => c.remite_a_11_1)).toHaveLength(481);
    expect(modelo.criterios.filter((c) => c.vigente_hasta === "2027-01-03")).toHaveLength(45);
    expect(modelo.remisiones).toHaveLength(68);
    expect(new Set(modelo.mapeo.map((f) => f.practica_medica_id)).size).toBe(56);
    expect(modelo.documentos).toHaveLength(37);
    expect(modelo.obligaciones).toHaveLength(22);
    expect(modelo.novedades).toHaveLength(40);
    expect(modelo.festivos).toHaveLength(54);
  });

  it("EWAH (11.2.2 mediana intramural, edificación exclusiva) ve 465 criterios hoy y 423 desde el 3-ene-2027", () => {
    const hoy = resolverCriterios(modelo, SEDE_EWAH, "2026-10-06");
    expect(hoy).toHaveLength(465);
    expect(hoy.some((c) => c.codigo === "11.2.2.HC.26")).toBe(true);
    const en2027 = resolverCriterios(modelo, SEDE_EWAH, "2027-01-03");
    expect(en2027).toHaveLength(423);
    expect(en2027.some((c) => c.codigo === "11.1.IN.25")).toBe(false);
  });

  it("la validación 5 falla si un candidato a remisión a 11.1 queda sin clasificar", () => {
    const r11 = entrada.curaduria["remite-11-1"];
    const alterada = {
      ...entrada,
      curaduria: { ...entrada.curaduria, "remite-11-1": { ...r11, autorresueltos: r11.autorresueltos.filter((id: string) => id !== "11.2.1.TH.1") } },
    };
    const v5 = validarTodo(alterada, construirModelo(alterada)).find((r) => r.n === 5)!;
    expect(v5.ok).toBe(false);
    expect(v5.detalle.join("\n")).toContain("11.2.1.TH.1");
  });
});
