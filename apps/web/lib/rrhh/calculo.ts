import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Salario/cargo vigente a una fecha dada — usado por lib/rrhh/nomina.ts
// para calcular el comprobante sin confiar en un valor que mande el
// cliente. Toma el `supabase` ya creado por el llamador (mismo patrón que
// lib/catalogos.ts) en vez de crear uno propio.
export type TipoSalario = "ordinario" | "integral";

export async function salarioVigente(supabase: Supabase, empleadoId: string, fecha: string) {
  const { data } = await supabase
    .from("historial_salarios_empleado")
    .select("salario, tipo_salario")
    .eq("empleado_id", empleadoId)
    .lte("fecha_inicio", fecha)
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { salario: Number(data.salario), tipoSalario: data.tipo_salario as TipoSalario };
}

// Todo el historial de salario de un empleado que toque [desde, hasta] —
// incluye el registro vigente al inicio del rango (fecha_inicio anterior).
export async function historialSalarioEnRango(
  supabase: Supabase,
  empleadoId: string,
  desde: string,
  hasta: string,
) {
  const { data } = await supabase
    .from("historial_salarios_empleado")
    .select("salario, tipo_salario, fecha_inicio")
    .eq("empleado_id", empleadoId)
    .lte("fecha_inicio", hasta)
    .order("fecha_inicio", { ascending: true });
  const filas = (data ?? []).map((f) => ({
    salario: Number(f.salario),
    tipoSalario: f.tipo_salario as TipoSalario,
    fechaInicio: f.fecha_inicio as string,
  }));
  // Descarta los anteriores al vigente en `desde` (solo cuenta el último de ellos).
  const ultimoAntes = filas.filter((f) => f.fechaInicio <= desde).at(-1);
  return [...(ultimoAntes ? [ultimoAntes] : []), ...filas.filter((f) => f.fechaInicio > desde)];
}

export async function fondoSolidaridadTramos(supabase: Supabase, paisId: string, fecha: string) {
  const { data } = await supabase
    .from("fondo_solidaridad_tramos")
    .select("desde_smlv, hasta_smlv, porcentaje")
    .eq("pais_id", paisId)
    .lte("vigente_desde", fecha)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`);
  return (data ?? []).map((t) => ({
    desdeSmlv: Number(t.desde_smlv),
    hastaSmlv: t.hasta_smlv === null ? null : Number(t.hasta_smlv),
    porcentaje: Number(t.porcentaje),
  }));
}

export async function cargoVigente(supabase: Supabase, empleadoId: string, fecha: string) {
  const { data } = await supabase
    .from("historial_cargos_empleado")
    .select("cargo_id, cargos(clase_riesgo_id)")
    .eq("empleado_id", empleadoId)
    .lte("fecha_inicio", fecha)
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const claseRiesgoId = (data.cargos as unknown as { clase_riesgo_id: string | null } | null)?.clase_riesgo_id ?? null;
  return { cargoId: data.cargo_id as string, claseRiesgoId };
}

// Cálculo legal colombiano de nómina/honorarios — funciones puras, sin
// "use server" (archivo hermano de las acciones, mismo gotcha ya conocido
// del proyecto: un archivo "use server" solo puede exportar funciones
// async, así que esto vive aparte). Nunca se recibe nada de esto desde el
// cliente — lib/rrhh/nomina.ts y lib/rrhh/honorarios.ts las llaman siempre
// contra datos ya resueltos en el servidor (historial_salarios_empleado,
// valores_legales_pais, clases_riesgo).
//
// Fuentes verificadas (ver el plan de requerimiento de esta sesión):
// - Auxilio de transporte: Código Sustantivo del Trabajo, aplica si el
//   salario es <= 2 SMLMV.
// - Deducciones del empleado: salud 4%, pensión 4% sobre el IBC.
// - Aportes patronales: salud 8.5%, pensión 12%, SENA 2%, ICBF 3%, Caja de
//   Compensación 4% sobre el IBC.
// - Exoneración (Ley 1607 de 2012, art. 25): cubre SALUD + SENA + ICBF
//   cuando la clínica es persona jurídica declarante de renta y el
//   empleado gana menos de 10 SMLMV — NUNCA cubre pensión ni la Caja de
//   Compensación Familiar, que siguen siendo obligatorias siempre.
// - Retención en la fuente de honorarios (DIAN, tarifas 2026): 11% si el
//   contratista es declarante de renta, 10% si no — sin base mínima.

export function calcularAuxilioTransporte(
  salarioBase: number,
  smlv: number,
  auxilioTransporte: number,
): number {
  return salarioBase <= smlv * 2 ? auxilioTransporte : 0;
}

export function calcularDeduccionSalud(ibc: number): number {
  return redondear(ibc * 0.04);
}

export function calcularDeduccionPension(ibc: number): number {
  return redondear(ibc * 0.04);
}

export function calcularAportePatronalSalud(ibc: number, exonerado: boolean): number {
  return exonerado ? 0 : redondear(ibc * 0.085);
}

export function calcularAportePatronalPension(ibc: number): number {
  // La pensión nunca se exonera — Ley 1607/2012 solo cubre salud+SENA+ICBF.
  return redondear(ibc * 0.12);
}

export function calcularAporteArl(ibc: number, tarifaArl: number | null): number {
  return redondear(ibc * (tarifaArl ?? 0));
}

// SENA (2%) + ICBF (3%) sí se exoneran; la Caja de Compensación Familiar
// (4%) NUNCA se exonera — se suman en un solo valor porque
// `comprobantes_nomina.aporte_parafiscales` es una sola columna, pero el
// cálculo interno respeta la diferencia legal entre ambos componentes.
export function calcularAporteParafiscales(ibc: number, exonerado: boolean): number {
  const senaIcbf = exonerado ? 0 : ibc * 0.05;
  const cajaCompensacion = ibc * 0.04;
  return redondear(senaIcbf + cajaCompensacion);
}

export function calcularRetencionHonorarios(
  valorBruto: number,
  declaranteRenta: boolean,
): { tarifa: number; retencion: number } {
  const tarifa = declaranteRenta ? 11 : 10;
  return { tarifa, retencion: redondear(valorBruto * (tarifa / 100)) };
}

// Umbral DIAN 2026 de facturación electrónica obligatoria para personas
// naturales prestadoras de servicios: 3.500 UVT/año en ingresos brutos.
export function requiereFacturaElectronica(acumuladoAnualBruto: number, uvt: number): boolean {
  return acumuladoAnualBruto > uvt * 3500;
}

// ── Salario integral, tope del IBC y Fondo de Solidaridad Pensional ──
// Fuentes verificadas en vivo el 2026-10-06 (ver migración 0059):
// CST art. 132 + guía UGPP 2026, Ley 797/2003 arts. 5 y 7.

export const MINIMO_SMLV_SALARIO_INTEGRAL = 13;
export const FACTOR_SALARIAL_INTEGRAL = 0.7;
export const TOPE_IBC_SMLV = 25;

// Base de cotización mensual: 70% si es integral, nunca más de 25 SMLMV.
export function ibcMensual(salarioMensual: number, comisionesIbc: number, tipoSalario: TipoSalario, smlv: number | null): number {
  const base = (tipoSalario === "integral" ? salarioMensual * FACTOR_SALARIAL_INTEGRAL : salarioMensual) + comisionesIbc;
  return smlv ? Math.min(base, smlv * TOPE_IBC_SMLV) : base;
}

// Porcentaje FSP a cargo del trabajador según su IBC MENSUAL en SMLMV (el
// tramo se decide sobre el mes completo aunque el pago sea quincenal).
export function porcentajeFondoSolidaridad(
  ibcMensualValor: number,
  smlv: number,
  tramos: { desdeSmlv: number; hastaSmlv: number | null; porcentaje: number }[],
): number {
  const enSmlv = ibcMensualValor / smlv;
  const tramo = tramos.find((t) => enSmlv >= t.desdeSmlv && (t.hastaSmlv === null || enSmlv < t.hastaSmlv));
  return tramo?.porcentaje ?? 0;
}

// ── Prestaciones sociales ──
// Prima (CST art. 306): 30 días de salario por año, en dos pagos semestrales.
// Cesantías (CST art. 249): un mes de salario por año. Intereses (Ley 52 de
// 1975): 12% anual sobre las cesantías, proporcional al tiempo. Base de
// prima y cesantías = salario + auxilio de transporte (si el trabajador
// tiene derecho a él). Convención comercial de 360 días / meses de 30.

export const TASA_INTERESES_CESANTIAS = 0.12;

function esUltimoDiaDelMes(fecha: string): boolean {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate() === d;
}

// Días entre dos fechas (ambas inclusive) en base 360: cada mes cuenta 30,
// el 31 cuenta como 30 y el último día de febrero también cierra en 30.
export function dias360(desde: string, hasta: string): number {
  if (hasta < desde) return 0;
  const [a1, m1, d1Raw] = desde.split("-").map(Number);
  const [a2, m2, d2Raw] = hasta.split("-").map(Number);
  const d1 = Math.min(d1Raw, 30);
  const d2 = esUltimoDiaDelMes(hasta) ? 30 : Math.min(d2Raw, 30);
  return (a2 - a1) * 360 + (m2 - m1) * 30 + (d2 - d1) + 1;
}

// Promedio del salario mensual en [desde, hasta], ponderado por días
// calendario de cada registro del historial (CST art. 253 — si el salario
// varió, la base es el promedio). Devuelve null si algún tramo es integral.
export function promedioSalarioPeriodo(
  historial: { salario: number; tipoSalario: TipoSalario; fechaInicio: string }[],
  desde: string,
  hasta: string,
): { promedio: number; huboIntegral: boolean } | null {
  if (historial.length === 0) return null;
  const msDia = 86400000;
  const inicio = Date.parse(desde);
  const fin = Date.parse(hasta) + msDia;
  let acumulado = 0;
  let diasTotales = 0;
  let huboIntegral = false;
  historial.forEach((h, i) => {
    const desdeTramo = Math.max(Date.parse(h.fechaInicio), inicio);
    const hastaTramo = Math.min(i + 1 < historial.length ? Date.parse(historial[i + 1].fechaInicio) : fin, fin);
    const dias = Math.max(0, (hastaTramo - desdeTramo) / msDia);
    if (dias > 0 && h.tipoSalario === "integral") huboIntegral = true;
    acumulado += h.salario * dias;
    diasTotales += dias;
  });
  if (diasTotales === 0) return null;
  return { promedio: acumulado / diasTotales, huboIntegral };
}

export function calcularPrestacion(base: number, dias: number): number {
  return redondear((base * dias) / 360);
}

export function calcularInteresesCesantias(cesantias: number, dias: number): number {
  return redondear((cesantias * dias * TASA_INTERESES_CESANTIAS) / 360);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
