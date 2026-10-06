"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import { rangoPagina, esRangoFueraDeLimite } from "@/lib/pagination";
import { salarioVigente, cargoVigente } from "./calculo";
import {
  calcularAuxilioTransporte,
  calcularDeduccionSalud,
  calcularDeduccionPension,
  calcularAportePatronalSalud,
  calcularAportePatronalPension,
  calcularAporteArl,
  calcularAporteParafiscales,
} from "./calculo";

function requirePermisoCrear() {
  return requirePermisoBase("nomina", "CREATE");
}
function requirePermisoAnular() {
  return requirePermisoBase("nomina", "VOID");
}

export async function generarComprobanteNomina(empleadoId: string, formData: FormData) {
  const tipoPeriodo = String(formData.get("tipoPeriodo") ?? "");
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  if (!["quincenal", "mensual"].includes(tipoPeriodo)) throw new Error("Tipo de período inválido.");
  if (!fechaInicio || !fechaFin) throw new Error("Las fechas del período son obligatorias.");
  if (fechaFin < fechaInicio) throw new Error("La fecha de fin no puede ser anterior a la de inicio.");

  const check = await requirePermisoCrear();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();

  const { data: empleado } = await supabase
    .from("empleados")
    .select("categoria_contrato")
    .eq("id", empleadoId)
    .maybeSingle();
  if (empleado?.categoria_contrato !== "laboral") {
    throw new Error("Este empleado no tiene un contrato laboral — genera un comprobante de honorarios.");
  }

  const { data: clinica } = await supabase
    .from("clinicas")
    .select("exoneracion_aportes_salud_parafiscales, pais_operacion_id, paises:pais_operacion_id(codigo)")
    .eq("id", check.usuario.clinica_id)
    .single();
  const esColombia = (clinica?.paises as unknown as { codigo: string } | null)?.codigo === "CO";
  const exonerado = clinica?.exoneracion_aportes_salud_parafiscales ?? false;

  const salario = await salarioVigente(supabase, empleadoId, fechaInicio);
  if (salario === null) throw new Error("El empleado no tiene un salario registrado en su historial.");

  const comisiones = Number(formData.get("comisiones") ?? 0) || 0;
  const comisionesIncluidasIbc = formData.get("comisionesIncluidasIbc") === "on";
  const otrasDeducciones = Number(formData.get("otrasDeducciones") ?? 0) || 0;
  const retencionFuente = Number(formData.get("retencionFuente") ?? 0) || 0;

  let auxilioTransporte = 0;
  let deduccionSalud = 0;
  let deduccionPension = 0;
  let aportePatronalSalud = 0;
  let aportePatronalPension = 0;
  let aporteArl = 0;
  let aporteParafiscales = 0;

  if (esColombia) {
    // `fechaInicio` es un string "yyyy-MM-dd" — pasarlo por `new Date()` lo
    // interpreta como medianoche UTC, y `.getFullYear()` lo vuelve a leer en
    // el huso horario LOCAL del servidor. En Colombia (UTC-5) eso corre el
    // año hacia atrás para cualquier fecha del 1 de enero. Se extrae el año
    // directo del string, sin pasar por Date (mismo criterio ya usado en
    // lib/email/ics.ts y lib/medio-ambiente/fecha-local.ts).
    const anio = Number(fechaInicio.slice(0, 4));
    const { data: valoresLegales } = await supabase
      .from("valores_legales_pais")
      .select("smlv, auxilio_transporte")
      .eq("pais_id", clinica!.pais_operacion_id)
      .eq("anio", anio)
      .maybeSingle();

    if (valoresLegales?.smlv && valoresLegales.auxilio_transporte) {
      auxilioTransporte = calcularAuxilioTransporte(salario, valoresLegales.smlv, valoresLegales.auxilio_transporte);
    }

    const ibc = salario + (comisionesIncluidasIbc ? comisiones : 0);
    deduccionSalud = calcularDeduccionSalud(ibc);
    deduccionPension = calcularDeduccionPension(ibc);
    aportePatronalSalud = calcularAportePatronalSalud(ibc, exonerado);
    aportePatronalPension = calcularAportePatronalPension(ibc);
    aporteParafiscales = calcularAporteParafiscales(ibc, exonerado);

    const cargo = await cargoVigente(supabase, empleadoId, fechaInicio);
    if (cargo?.claseRiesgoId) {
      const { data: clase } = await supabase
        .from("clases_riesgo")
        .select("tarifa_arl")
        .eq("id", cargo.claseRiesgoId)
        .maybeSingle();
      aporteArl = calcularAporteArl(ibc, clase?.tarifa_arl ?? null);
    }
  }

  const netoPagar =
    salario + auxilioTransporte + comisiones - deduccionSalud - deduccionPension - retencionFuente - otrasDeducciones;

  const { error } = await supabase.from("comprobantes_nomina").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    tipo_periodo: tipoPeriodo,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    salario_base: salario,
    auxilio_transporte: auxilioTransporte,
    comisiones,
    comisiones_incluidas_ibc: comisionesIncluidasIbc,
    deduccion_salud: deduccionSalud,
    deduccion_pension: deduccionPension,
    aporte_patronal_salud: aportePatronalSalud,
    aporte_patronal_pension: aportePatronalPension,
    aporte_arl: aporteArl,
    aporte_parafiscales: aporteParafiscales,
    exonerado_aportes: exonerado,
    retencion_fuente: retencionFuente,
    otras_deducciones: otrasDeducciones,
    neto_pagar: Math.round(netoPagar * 100) / 100,
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo generar el comprobante de nómina.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function anularComprobanteNomina(id: string, empleadoId: string, formData: FormData) {
  const motivo = campoOpcional(formData, "motivo");
  if (!motivo) throw new Error("El motivo de anulación es obligatorio.");

  const check = await requirePermisoAnular();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("comprobantes_nomina")
    .update({ anulado: true, anulado_motivo: motivo })
    .eq("id", id);
  if (error) throw new Error("No se pudo anular el comprobante.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function listarComprobantesNomina(filtros: { empleadoId?: string; pagina?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("comprobantes_nomina")
    .select("*, empleados(nombre)", { count: "exact" })
    .order("fecha_inicio", { ascending: false });

  if (filtros.empleadoId) query = query.eq("empleado_id", filtros.empleadoId);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarComprobantesNomina({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}
