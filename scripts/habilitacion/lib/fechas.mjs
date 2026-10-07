// Fechas puras (sin zona horaria): todo se maneja como "AAAA-MM-DD" y
// aritmética de calendario con Date.UTC, nunca con new Date('aaaa-mm-dd')
// en hora local (riesgo R10 del diseño).

export const pad2 = (n) => String(n).padStart(2, "0");
export const iso = (a, m, d) => `${a}-${pad2(m)}-${pad2(d)}`;

export function ultimoDiaMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function sumarDias(fechaIso, dias) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(fechaIso) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * Fecha límite de UNA regla (`hab_obligacion_vencimientos`) para el corte
 * del año `anioCorte`. "dia_corte null" = último día del mes. Si
 * `dia_limite` no existe en el mes destino se usa su último día.
 */
export function fechaLimiteRegla(regla, anioCorte) {
  const mesesTotales = regla.mes_corte - 1 + regla.meses_despues;
  const anio = anioCorte + Math.floor(mesesTotales / 12);
  const mes = (mesesTotales % 12) + 1;
  const dia = Math.min(regla.dia_limite, ultimoDiaMes(anio, mes));
  const diaCorte = regla.dia_corte ?? ultimoDiaMes(anioCorte, regla.mes_corte);
  return { corte: iso(anioCorte, regla.mes_corte, diaCorte), limite: iso(anio, mes, dia) };
}

/** ¿La regla aplica al prestador? null en la regla = no restringe. */
export function reglaAplica(regla, { grupo = null, tipo = null } = {}) {
  if (regla.aplica_a_grupos && !regla.aplica_a_grupos.includes(grupo)) return false;
  if (regla.aplica_a_tipos && !regla.aplica_a_tipos.includes(tipo)) return false;
  return true;
}

/**
 * Fechas límite (únicas, ordenadas) de un conjunto de reglas para un
 * prestador, con límite dentro de [desde, hasta]. Es el mismo cálculo que
 * hará `fn_hab_generar_ocurrencias` (F8); aquí sirve de prueba cruzada contra
 * `fechas_2026_2027` de reportes.json (validación 8).
 */
export function fechasLimite(reglas, prestador, desde, hasta) {
  const [aDesde] = desde.split("-").map(Number);
  const [aHasta] = hasta.split("-").map(Number);
  const fechas = new Set();
  for (const r of reglas) {
    if (!reglaAplica(r, prestador)) continue;
    for (let anio = aDesde - 1; anio <= aHasta; anio++) {
      const { limite } = fechaLimiteRegla(r, anio);
      if (limite >= desde && limite <= hasta) fechas.add(limite);
    }
  }
  return [...fechas].sort();
}
