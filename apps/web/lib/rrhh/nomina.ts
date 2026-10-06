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
function requirePermisoEditar() {
  return requirePermisoBase("nomina", "EDIT");
}
function requirePermisoAnular() {
  return requirePermisoBase("nomina", "VOID");
}

export type DesgloseNomina = {
  esColombia: boolean;
  salarioBase: number;
  auxilioTransporte: number;
  comisiones: number;
  comisionesIncluidasIbc: boolean;
  deduccionSalud: number;
  deduccionPension: number;
  aportePatronalSalud: number;
  aportePatronalPension: number;
  aporteArl: number;
  aporteParafiscales: number;
  exoneradoAportes: boolean;
  retencionFuente: number;
  otrasDeducciones: number;
  netoPagar: number;
};

// Calcula el desglose sin guardar nada — alimenta el formulario para que el
// administrador vea el detalle del pago y pueda ajustarlo antes de generar
// el borrador. Quincenal = la mitad de cada valor mensual (salario, auxilio
// de transporte) ANTES de calcular deducciones/aportes — como todo es
// porcentaje sobre esa base, el resultado ya queda automáticamente en la
// mitad de lo que correspondería a un mes completo.
export async function calcularComprobanteNominaPreview(
  empleadoId: string,
  formData: FormData,
): Promise<DesgloseNomina> {
  const tipoPeriodo = String(formData.get("tipoPeriodo") ?? "");
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  if (!["quincenal", "mensual"].includes(tipoPeriodo)) throw new Error("Tipo de período inválido.");
  if (!fechaInicio) throw new Error("La fecha de inicio es obligatoria.");

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

  const salarioMensual = await salarioVigente(supabase, empleadoId, fechaInicio);
  if (salarioMensual === null) throw new Error("El empleado no tiene un salario registrado en su historial.");

  const comisiones = Number(formData.get("comisiones") ?? 0) || 0;
  const comisionesIncluidasIbc = formData.get("comisionesIncluidasIbc") === "on";

  const divisor = tipoPeriodo === "quincenal" ? 2 : 1;
  const salarioPeriodo = salarioMensual / divisor;

  let auxilioTransporte = 0;
  let deduccionSalud = 0;
  let deduccionPension = 0;
  let aportePatronalSalud = 0;
  let aportePatronalPension = 0;
  let aporteArl = 0;
  let aporteParafiscales = 0;

  if (esColombia) {
    const anio = Number(fechaInicio.slice(0, 4));
    const { data: valoresLegales } = await supabase
      .from("valores_legales_pais")
      .select("smlv, auxilio_transporte")
      .eq("pais_id", clinica!.pais_operacion_id)
      .eq("anio", anio)
      .maybeSingle();

    if (valoresLegales?.smlv && valoresLegales.auxilio_transporte) {
      // La elegibilidad (<= 2 SMLV) se evalúa sobre el salario MENSUAL
      // completo, nunca sobre la mitad — es una condición del salario del
      // trabajador, no del período de pago.
      const auxilioMensual = calcularAuxilioTransporte(salarioMensual, valoresLegales.smlv, valoresLegales.auxilio_transporte);
      auxilioTransporte = auxilioMensual / divisor;
    }

    const ibc = salarioPeriodo + (comisionesIncluidasIbc ? comisiones : 0);
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

  const netoPagar = salarioPeriodo + auxilioTransporte + comisiones - deduccionSalud - deduccionPension;

  return {
    esColombia,
    salarioBase: redondear(salarioPeriodo),
    auxilioTransporte: redondear(auxilioTransporte),
    comisiones,
    comisionesIncluidasIbc,
    deduccionSalud,
    deduccionPension,
    aportePatronalSalud,
    aportePatronalPension,
    aporteArl,
    aporteParafiscales,
    exoneradoAportes: exonerado,
    retencionFuente: 0,
    otrasDeducciones: 0,
    netoPagar: redondear(netoPagar),
  };
}

function numeroFormulario(formData: FormData, campo: string): number {
  const valor = Number(formData.get(campo));
  return Number.isFinite(valor) ? valor : 0;
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// El administrador ya vio y pudo ajustar el desglose completo en el
// formulario (ver calcularComprobanteNominaPreview) — esta acción guarda
// los valores TAL COMO se entregan, no los vuelve a calcular. Queda como
// borrador (aprobado=false): editable/eliminable hasta que se apruebe.
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
  const { error } = await supabase.from("comprobantes_nomina").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    tipo_periodo: tipoPeriodo,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    salario_base: numeroFormulario(formData, "salarioBase"),
    auxilio_transporte: numeroFormulario(formData, "auxilioTransporte"),
    comisiones: numeroFormulario(formData, "comisiones"),
    comisiones_incluidas_ibc: formData.get("comisionesIncluidasIbc") === "on",
    deduccion_salud: numeroFormulario(formData, "deduccionSalud"),
    deduccion_pension: numeroFormulario(formData, "deduccionPension"),
    aporte_patronal_salud: numeroFormulario(formData, "aportePatronalSalud"),
    aporte_patronal_pension: numeroFormulario(formData, "aportePatronalPension"),
    aporte_arl: numeroFormulario(formData, "aporteArl"),
    aporte_parafiscales: numeroFormulario(formData, "aporteParafiscales"),
    exonerado_aportes: formData.get("exoneradoAportes") === "on",
    retencion_fuente: numeroFormulario(formData, "retencionFuente"),
    otras_deducciones: numeroFormulario(formData, "otrasDeducciones"),
    neto_pagar: numeroFormulario(formData, "netoPagar"),
    created_by: check.usuario.id,
  });
  if (error) throw new Error("No se pudo generar el comprobante de nómina.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

// Mismo set de campos que generar, pero sobre un borrador ya existente —
// el RLS (aprobado=false) es quien realmente impide editar uno aprobado;
// esta acción no necesita repetir esa validación para dar un buen mensaje
// porque el UPDATE simplemente no afecta ninguna fila si ya está aprobado.
export async function editarComprobanteNomina(id: string, empleadoId: string, formData: FormData) {
  const tipoPeriodo = String(formData.get("tipoPeriodo") ?? "");
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  if (!["quincenal", "mensual"].includes(tipoPeriodo)) throw new Error("Tipo de período inválido.");
  if (!fechaInicio || !fechaFin) throw new Error("Las fechas del período son obligatorias.");
  if (fechaFin < fechaInicio) throw new Error("La fecha de fin no puede ser anterior a la de inicio.");

  const check = await requirePermisoEditar();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_nomina")
    .update({
      tipo_periodo: tipoPeriodo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      salario_base: numeroFormulario(formData, "salarioBase"),
      auxilio_transporte: numeroFormulario(formData, "auxilioTransporte"),
      comisiones: numeroFormulario(formData, "comisiones"),
      comisiones_incluidas_ibc: formData.get("comisionesIncluidasIbc") === "on",
      deduccion_salud: numeroFormulario(formData, "deduccionSalud"),
      deduccion_pension: numeroFormulario(formData, "deduccionPension"),
      aporte_patronal_salud: numeroFormulario(formData, "aportePatronalSalud"),
      aporte_patronal_pension: numeroFormulario(formData, "aportePatronalPension"),
      aporte_arl: numeroFormulario(formData, "aporteArl"),
      aporte_parafiscales: numeroFormulario(formData, "aporteParafiscales"),
      exonerado_aportes: formData.get("exoneradoAportes") === "on",
      retencion_fuente: numeroFormulario(formData, "retencionFuente"),
      otras_deducciones: numeroFormulario(formData, "otrasDeducciones"),
      neto_pagar: numeroFormulario(formData, "netoPagar"),
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error("No se pudo actualizar el comprobante.");
  if (!data || data.length === 0) {
    throw new Error("Este comprobante ya fue aprobado y no se puede editar.");
  }

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function aprobarComprobanteNomina(id: string, empleadoId: string) {
  const check = await requirePermisoEditar();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_nomina")
    .update({ aprobado: true, aprobado_en: new Date().toISOString(), aprobado_por: check.usuario.id })
    .eq("id", id)
    .select("id");
  if (error) throw new Error("No se pudo aprobar el comprobante.");
  if (!data || data.length === 0) throw new Error("Este comprobante ya estaba aprobado.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function eliminarComprobanteNomina(id: string, empleadoId: string) {
  const check = await requirePermisoEditar();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("comprobantes_nomina")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error("No se pudo eliminar el comprobante.");
  if (!count) throw new Error("Este comprobante ya fue aprobado y no se puede eliminar — solo anular.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function anularComprobanteNomina(id: string, empleadoId: string, formData: FormData) {
  const motivo = campoOpcional(formData, "motivo");
  if (!motivo) throw new Error("El motivo de anulación es obligatorio.");

  const check = await requirePermisoAnular();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_nomina")
    .update({ anulado: true, anulado_motivo: motivo })
    .eq("id", id)
    .select("id");
  if (error) throw new Error("No se pudo anular el comprobante.");
  if (!data || data.length === 0) {
    throw new Error("Solo se puede anular un comprobante ya aprobado.");
  }

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

export async function obtenerComprobanteNomina(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes_nomina")
    .select(
      "*, empleados(nombre, numero_identificacion, tipo_identificacion_id, tipos_identificacion(nombre))",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}
