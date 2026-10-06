import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Salario/cargo vigente a una fecha dada — usado por lib/rrhh/nomina.ts
// para calcular el comprobante sin confiar en un valor que mande el
// cliente. Toma el `supabase` ya creado por el llamador (mismo patrón que
// lib/catalogos.ts) en vez de crear uno propio.
export async function salarioVigente(supabase: Supabase, empleadoId: string, fecha: string) {
  const { data } = await supabase
    .from("historial_salarios_empleado")
    .select("salario")
    .eq("empleado_id", empleadoId)
    .lte("fecha_inicio", fecha)
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.salario ?? null;
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

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
