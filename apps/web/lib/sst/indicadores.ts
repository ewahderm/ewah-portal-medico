// Indicadores mínimos del SG-SST (Res. 0312 de 2019, Art. 30). Puro: los
// insumos por mes los entrega fn_sst_indicadores (0077).
//   Frecuencia de AT        = AT del mes / trabajadores del mes × 100
//   Severidad de AT         = (días de incapacidad por AT + días cargados) / trabajadores × 100
//   Proporción de AT mortales = AT mortales del año / AT del año × 100
//   Prevalencia de EL       = casos de EL (nuevos y antiguos) / promedio de trabajadores × 100.000
//   Incidencia de EL        = casos nuevos de EL / promedio de trabajadores × 100.000
//   Ausentismo              = días de ausencia por incapacidad / días programados × 100
//
// Bases (0086): el ausentismo usa la MISMA base en numerador y denominador:
// días HÁBILES (lunes a viernes sin festivos). dias_ausencia cuenta solo los
// días hábiles cubiertos por cada incapacidad dentro del mes y
// dias_programados = trabajadores × días hábiles del mes, así que no pasa de
// 100 %. Los días de incapacidad por AT de la severidad son días de
// calendario del mes en que ocurren (Art. 30 pide los del mes).

export type InsumoMes = {
  mes: number;
  trabajadores: number;
  accidentes: number;
  dias_incapacidad_at: number;
  dias_cargados: number;
  at_mortales: number;
  el_nuevas: number;
  el_total: number;
  dias_ausencia: number;
  dias_programados: number;
};

export type IndicadorMes = {
  mes: number;
  frecuencia: number | null;
  severidad: number | null;
  ausentismo: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number, k: number) => (b > 0 ? r2((a / b) * k) : null);

export function indicadoresMensuales(insumos: InsumoMes[]): IndicadorMes[] {
  return insumos.map((m) => ({
    mes: m.mes,
    frecuencia: div(m.accidentes, m.trabajadores, 100),
    severidad: div(m.dias_incapacidad_at + m.dias_cargados, m.trabajadores, 100),
    ausentismo: div(m.dias_ausencia, m.dias_programados, 100),
  }));
}

// Anuales, hasta el mes indicado (para no promediar meses que no han
// pasado).
export function indicadoresAnuales(insumos: InsumoMes[], hastaMes = 12) {
  const meses = insumos.filter((m) => m.mes <= hastaMes);
  const at = meses.reduce((n, m) => n + m.accidentes, 0);
  const mortales = meses.reduce((n, m) => n + m.at_mortales, 0);
  const promedio = meses.length ? meses.reduce((n, m) => n + m.trabajadores, 0) / meses.length : 0;
  const elNuevas = meses.reduce((n, m) => n + m.el_nuevas, 0);
  // Prevalencia = casos DISTINTOS del periodo: los que ya existían al
  // iniciar el año + los nuevos del año. el_total de cada mes cuenta los casos
  // vigentes en ese mes, así que tomar el máximo mensual subestima cuando un
  // caso se cierra antes de que otro empiece. Los existentes al inicio salen
  // del primer mes: vigentes ese mes menos los que nacieron ese mes.
  const primero = meses.reduce<InsumoMes | null>((p, m) => (!p || m.mes < p.mes ? m : p), null);
  const existentesAlInicio = primero ? Math.max(0, primero.el_total - primero.el_nuevas) : 0;
  const elTotal = meses.length ? existentesAlInicio + elNuevas : 0;
  return {
    accidentes: at,
    mortalidad: at > 0 ? r2((mortales / at) * 100) : null,
    prevalenciaEl: div(elTotal, promedio, 100000),
    incidenciaEl: div(elNuevas, promedio, 100000),
    promedioTrabajadores: r2(promedio),
  };
}
