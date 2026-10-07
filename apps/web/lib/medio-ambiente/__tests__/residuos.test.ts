// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TIPOS_RESIDUO,
  TIPOS_RESIDUO_NUEVOS,
  TIPOS_RESIDUO_PELIGROSOS,
  TIPO_RESIDUO_LEGADO,
  esResiduoPeligroso,
  esTipoResiduoNuevoValido,
  esTipoResiduoValido,
  estiloBadgeCaneca,
} from "../constantes";

const MIGRACION_0082 = fileURLToPath(
  new URL("../../../../../supabase/migrations/0082_pgirasa_declaraciones.sql", import.meta.url),
);
const sql = readFileSync(MIGRACION_0082, "utf8");

function literalesSql(fragmento: string): string[] {
  return [...fragmento.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

// La lista de tipos vive en TS (UI, cálculo del promedio) y en SQL (check
// de la tabla, fn_residuo_es_peligroso para el trigger y la confirmación de
// cero). Si divergen, la app y la BD clasificarían distinto el mismo pesaje.
describe("TS y la migración 0082 tienen la misma clasificación", () => {
  it("la lista de peligrosos de fn_residuo_es_peligroso coincide con TIPOS_RESIDUO_PELIGROSOS", () => {
    const cuerpo = /function fn_residuo_es_peligroso[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1];
    expect(cuerpo, "fn_residuo_es_peligroso no está en 0082").toBeDefined();
    expect(literalesSql(cuerpo!)).toEqual([...TIPOS_RESIDUO_PELIGROSOS].sort());
  });

  it("el check de registros_residuos admite exactamente los tipos de TIPOS_RESIDUO", () => {
    const check = /registros_residuos_tipo_residuo_check\s+check\s*\(([\s\S]*?)\);/.exec(sql)?.[1];
    expect(check, "check de tipo_residuo no está en 0082").toBeDefined();
    expect(literalesSql(check!)).toEqual(TIPOS_RESIDUO.map((t) => t.value).sort());
  });
});

describe("tipos de residuo para registros nuevos", () => {
  it("no ofrece ni acepta el químico histórico en un pesaje nuevo", () => {
    expect(TIPOS_RESIDUO_NUEVOS.map((t): string => t.value)).not.toContain(TIPO_RESIDUO_LEGADO);
    expect(esTipoResiduoNuevoValido(TIPO_RESIDUO_LEGADO)).toBe(false);
  });

  it("pero lo sigue reconociendo (y contando como peligroso) en registros viejos", () => {
    expect(esTipoResiduoValido(TIPO_RESIDUO_LEGADO)).toBe(true);
    expect(esResiduoPeligroso(TIPO_RESIDUO_LEGADO)).toBe(true);
  });

  it("acepta cada característica química concreta y rechaza valores inventados", () => {
    expect(esTipoResiduoNuevoValido("quimico_toxico")).toBe(true);
    expect(esTipoResiduoNuevoValido("aprovechable")).toBe(true);
    expect(esTipoResiduoNuevoValido("radiactivo_mal_escrito")).toBe(false);
    expect(esResiduoPeligroso("no_existe")).toBe(false);
  });
});

describe("insignia de caneca", () => {
  it("cada color de caneca tiene un estilo distinto (la verde no se ve como la negra)", () => {
    const canecas = [...new Set(TIPOS_RESIDUO.map((t) => t.caneca).filter((c) => c !== null))];
    const estilos = canecas.map((c) => JSON.stringify(estiloBadgeCaneca(c)));
    expect(new Set(estilos).size).toBe(canecas.length);
  });
});
