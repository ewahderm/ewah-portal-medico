// Indicadores de suficiencia patrimonial y financiera (Manual de
// inscripción 8.2.1–8.2.3, Res. 3100). Puro. No se guardan: se calculan
// sobre las cifras registradas. División por cero = "no calculable".
//   1. Patrimonio total / capital × 100 > 50 %
//   2. Obligaciones mercantiles vencidas > 360 días / pasivo corriente ≤ 50 %
//   3. Obligaciones laborales vencidas > 360 días / pasivo corriente ≤ 50 %

export type CifrasSuficiencia = {
  patrimonio_total: number;
  capital: number;
  obligaciones_mercantiles_360: number;
  obligaciones_laborales_360: number;
  pasivo_corriente: number;
};

export type Indicador = {
  nombre: string;
  regla: string;
  valor: number | null; // porcentaje con 1 decimal; null = no calculable
  cumple: boolean | null;
};

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);

export function indicadoresSuficiencia(c: CifrasSuficiencia): { indicadores: Indicador[]; cumpleTodos: boolean | null } {
  const patrimonio = pct(c.patrimonio_total, c.capital);
  // Sin pasivo corriente no hay obligaciones que superen el 50 %: si las
  // obligaciones vencidas también son 0, cumple; si no, no es calculable.
  const sobrePasivo = (oblig: number) => (c.pasivo_corriente === 0 ? (oblig === 0 ? 0 : null) : pct(oblig, c.pasivo_corriente));
  const mercantiles = sobrePasivo(c.obligaciones_mercantiles_360);
  const laborales = sobrePasivo(c.obligaciones_laborales_360);
  const indicadores: Indicador[] = [
    { nombre: "Patrimonio total / capital", regla: "mayor que 50 %", valor: patrimonio, cumple: patrimonio === null ? null : patrimonio > 50 },
    { nombre: "Obligaciones mercantiles vencidas a más de 360 días / pasivo corriente", regla: "máximo 50 %", valor: mercantiles, cumple: mercantiles === null ? null : mercantiles <= 50 },
    { nombre: "Obligaciones laborales vencidas a más de 360 días / pasivo corriente", regla: "máximo 50 %", valor: laborales, cumple: laborales === null ? null : laborales <= 50 },
  ];
  const cumpleTodos = indicadores.some((i) => i.cumple === false) ? false : indicadores.some((i) => i.cumple === null) ? null : true;
  return { indicadores, cumpleTodos };
}

// "1.234.567,89" / "-1.234.567" / "$ 1.234.567" → número con signo y 2
// decimales (a diferencia de parsePesos de grupo-supersalud.ts, que los
// descarta: un patrimonio puede ser negativo). Formato
// es-CO: punto de miles, coma decimal). Sin parseFloat sobre el texto
// crudo: el punto de miles ya causó errores en la importación del legado.
export function parsePesosCO(texto: string): number | null {
  const limpio = texto.replace(/[\s$]/g, "");
  if (!limpio) return null;
  if (!/^-?[\d.,]+$/.test(limpio)) return null;
  let normal: string;
  if (limpio.includes(",")) {
    normal = limpio.replace(/\./g, "").replace(",", ".");
  } else {
    // Solo puntos: si todos los grupos tras el primero tienen 3 dígitos, son de miles.
    const partes = limpio.replace("-", "").split(".");
    normal = partes.length > 1 && partes.slice(1).every((p) => p.length === 3) ? limpio.replace(/\./g, "") : limpio;
  }
  if ((normal.match(/\./g) ?? []).length > 1) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
