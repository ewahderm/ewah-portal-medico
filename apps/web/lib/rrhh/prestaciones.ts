"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import {
  historialSalarioEnRango,
  promedioSalarioPeriodo,
  dias360,
  calcularPrestacion,
  calcularInteresesCesantias,
  calcularAuxilioTransporte,
} from "./calculo";
import type { ResultadoAccion } from "@/lib/forms/resultado";

// Liquidación de prestaciones sociales (migración 0059) — recibo propio,
// separado de la nómina (decisión del usuario). Mismo flujo que
// comprobantes_nomina: Calcular → ajustar → Guardar borrador → Aprobar →
// (Anular). Reglas en lib/rrhh/calculo.ts.

type Tipo = "prima_primer_semestre" | "fin_de_anio";

export type DesglosePrestaciones = {
  tipo: Tipo;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
  basePrima: number;
  diasPrima: number;
  valorPrima: number;
  baseCesantias: number;
  diasCesantias: number;
  valorCesantias: number;
  valorIntereses: number;
  totalPagarTrabajador: number;
  totalConsignarFondo: number;
  notas: string[];
};

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function restarMeses(fecha: string, meses: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

export async function calcularPrestacionesPreview(
  empleadoId: string,
  formData: FormData,
): Promise<DesglosePrestaciones | { error: string }> {
  const tipo = String(formData.get("tipo") ?? "") as Tipo;
  const anio = Number(formData.get("anio"));
  if (!["prima_primer_semestre", "fin_de_anio"].includes(tipo)) return { error: "Tipo de liquidación inválido." };
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return { error: "Año inválido." };

  const check = await requirePermisoBase("nomina", "CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  const { data: empleado } = await supabase
    .from("empleados")
    .select("categoria_contrato, fecha_inicio_contrato, fecha_fin_contrato, tipos_contrato(codigo)")
    .eq("id", empleadoId)
    .maybeSingle();
  if (!empleado) return { error: "Empleado no encontrado." };
  if (empleado.categoria_contrato !== "laboral") {
    return { error: "Las prestaciones sociales solo aplican a contratos laborales." };
  }
  if ((empleado.tipos_contrato as unknown as { codigo: string } | null)?.codigo === "APRENDIZAJE") {
    return { error: "El contrato de aprendizaje no causa prima, cesantías ni intereses." };
  }

  const { data: clinica } = await supabase
    .from("clinicas")
    .select("pais_operacion_id, paises:pais_operacion_id(codigo)")
    .eq("id", check.usuario.clinica_id)
    .single();
  if ((clinica?.paises as unknown as { codigo: string } | null)?.codigo !== "CO") {
    return { error: "La liquidación automática de prestaciones solo está disponible para Colombia." };
  }

  const { data: valores } = await supabase
    .from("valores_legales_pais")
    .select("smlv, auxilio_transporte")
    .eq("pais_id", clinica!.pais_operacion_id)
    .eq("anio", anio)
    .maybeSingle();
  if (!valores?.smlv) return { error: `No hay salario mínimo cargado para ${anio}.` };
  const smlv = Number(valores.smlv);
  const auxilioAnual = Number(valores.auxilio_transporte ?? 0);

  // Recorta el período legal al tiempo que de verdad duró el contrato.
  function recortar(desde: string, hasta: string) {
    const inicio = empleado!.fecha_inicio_contrato && empleado!.fecha_inicio_contrato > desde ? empleado!.fecha_inicio_contrato : desde;
    const fin = empleado!.fecha_fin_contrato && empleado!.fecha_fin_contrato < hasta ? empleado!.fecha_fin_contrato : hasta;
    return { inicio, fin, dias: dias360(inicio, fin) };
  }

  const notas: string[] = [];

  // Base de liquidación (CST art. 253): si el salario no cambió en los
  // últimos 3 meses del período, se toma el último; si cambió, el promedio
  // del período. + auxilio de transporte si el trabajador tiene derecho.
  async function baseDelPeriodo(desde: string, hasta: string): Promise<number | { error: string }> {
    const historial = await historialSalarioEnRango(supabase, empleadoId, desde, hasta);
    const resultado = promedioSalarioPeriodo(historial, desde, hasta);
    if (!resultado) return { error: "El empleado no tiene salario registrado en el período." };
    if (resultado.huboIntegral) {
      return { error: "El empleado tuvo salario integral en el período — el salario integral ya incluye prima, cesantías e intereses." };
    }
    const cambioReciente = historial.some((h) => h.fechaInicio > restarMeses(hasta, 3) && h.fechaInicio <= hasta);
    const ultimo = historial.at(-1)!.salario;
    const salario = cambioReciente ? resultado.promedio : ultimo;
    if (cambioReciente) notas.push(`El salario cambió en los últimos 3 meses del período (${desde} a ${hasta}): se usa el promedio.`);
    const auxilio = calcularAuxilioTransporte(salario, smlv, auxilioAnual);
    if (auxilio) notas.push(`Incluye auxilio de transporte de ${anio} en la base (salario hasta 2 salarios mínimos).`);
    return redondear(salario + auxilio);
  }

  const semestre1 = { desde: `${anio}-01-01`, hasta: `${anio}-06-30` };
  const semestre2 = { desde: `${anio}-07-01`, hasta: `${anio}-12-31` };

  let basePrima = 0;
  let diasPrima = 0;
  let valorPrima = 0;
  let baseCesantias = 0;
  let diasCesantias = 0;
  let valorCesantias = 0;
  let valorIntereses = 0;
  let fechaInicio: string;
  let fechaFin: string;

  const periodoPrima = recortar(...(tipo === "prima_primer_semestre" ? [semestre1.desde, semestre1.hasta] as const : [semestre2.desde, semestre2.hasta] as const));
  if (periodoPrima.dias > 0) {
    const base = await baseDelPeriodo(periodoPrima.inicio, periodoPrima.fin);
    if (typeof base !== "number") return base;
    basePrima = base;
    diasPrima = periodoPrima.dias;
    valorPrima = calcularPrestacion(basePrima, diasPrima);
  }

  if (tipo === "fin_de_anio") {
    const periodoAnual = recortar(`${anio}-01-01`, `${anio}-12-31`);
    if (periodoAnual.dias > 0) {
      const base = await baseDelPeriodo(periodoAnual.inicio, periodoAnual.fin);
      if (typeof base !== "number") return base;
      baseCesantias = base;
      diasCesantias = periodoAnual.dias;
      valorCesantias = calcularPrestacion(baseCesantias, diasCesantias);
      valorIntereses = calcularInteresesCesantias(valorCesantias, diasCesantias);
    }
    fechaInicio = periodoAnual.inicio;
    fechaFin = periodoAnual.fin;
  } else {
    fechaInicio = periodoPrima.inicio;
    fechaFin = periodoPrima.fin;
  }

  if (diasPrima === 0 && diasCesantias === 0) {
    return { error: "El contrato del empleado no cubre ningún día de este período." };
  }

  return {
    tipo,
    anio,
    fechaInicio,
    fechaFin,
    basePrima,
    diasPrima,
    valorPrima,
    baseCesantias,
    diasCesantias,
    valorCesantias,
    valorIntereses,
    totalPagarTrabajador: redondear(valorPrima + valorIntereses),
    totalConsignarFondo: valorCesantias,
    notas: [...new Set(notas)],
  };
}

function numero(formData: FormData, campo: string): number {
  const valor = Number(formData.get(campo));
  return Number.isFinite(valor) ? valor : 0;
}

function datosDesdeForm(formData: FormData) {
  const tipo = String(formData.get("tipo") ?? "");
  const anio = Number(formData.get("anio"));
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  if (!["prima_primer_semestre", "fin_de_anio"].includes(tipo)) return { error: "Tipo de liquidación inválido." };
  if (!Number.isInteger(anio)) return { error: "Año inválido." };
  if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) return { error: "Período inválido." };
  return { datos: {
    tipo,
    anio,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    base_prima: numero(formData, "basePrima"),
    dias_prima: Math.round(numero(formData, "diasPrima")),
    valor_prima: numero(formData, "valorPrima"),
    base_cesantias: numero(formData, "baseCesantias"),
    dias_cesantias: Math.round(numero(formData, "diasCesantias")),
    valor_cesantias: numero(formData, "valorCesantias"),
    valor_intereses_cesantias: numero(formData, "valorIntereses"),
    total_pagar_trabajador: numero(formData, "totalPagarTrabajador"),
    total_consignar_fondo: numero(formData, "totalConsignarFondo"),
  } };
}

export async function generarLiquidacionPrestaciones(empleadoId: string, formData: FormData): Promise<ResultadoAccion> {
  const resultadoDatos = datosDesdeForm(formData);
  if ("error" in resultadoDatos) return { error: resultadoDatos.error };
  const datos = resultadoDatos.datos;
  const check = await requirePermisoBase("nomina", "CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("comprobantes_prestaciones").insert({
    ...datos,
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    created_by: check.usuario.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe una liquidación vigente de este tipo para ese año — anúlala o elimínala primero." };
    }
    return { error: "No se pudo guardar la liquidación." };
  }
  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function aprobarLiquidacionPrestaciones(id: string, empleadoId: string): Promise<ResultadoAccion> {
  const check = await requirePermisoBase("nomina", "EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_prestaciones")
    .update({ aprobado: true, aprobado_en: new Date().toISOString(), aprobado_por: check.usuario.id })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo aprobar la liquidación." };
  if (!data || data.length === 0) return { error: "Esta liquidación ya estaba aprobada." };
  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function eliminarLiquidacionPrestaciones(id: string, empleadoId: string): Promise<ResultadoAccion> {
  const check = await requirePermisoBase("nomina", "EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("comprobantes_prestaciones")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) return { error: "No se pudo eliminar la liquidación." };
  if (!count) return { error: "Esta liquidación ya fue aprobada y no se puede eliminar — solo anular." };
  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function anularLiquidacionPrestaciones(id: string, empleadoId: string, formData: FormData): Promise<ResultadoAccion> {
  const motivo = campoOpcional(formData, "motivo");
  if (!motivo) return { error: "El motivo de anulación es obligatorio." };

  const check = await requirePermisoBase("nomina", "VOID");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_prestaciones")
    .update({ anulado: true, anulado_motivo: motivo })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo anular la liquidación." };
  if (!data || data.length === 0) return { error: "Solo se puede anular una liquidación ya aprobada." };
  revalidatePath(`/rrhh/${empleadoId}`);
  return {};
}

export async function listarLiquidacionesPrestaciones(empleadoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes_prestaciones")
    .select("*")
    .eq("empleado_id", empleadoId)
    .order("anio", { ascending: false })
    .order("tipo", { ascending: true });
  return data ?? [];
}

export async function obtenerLiquidacionPrestaciones(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes_prestaciones")
    .select("*, empleados(nombre, numero_identificacion, tipos_identificacion(nombre), fondos_cesantias(nombre))")
    .eq("id", id)
    .maybeSingle();
  return data;
}
