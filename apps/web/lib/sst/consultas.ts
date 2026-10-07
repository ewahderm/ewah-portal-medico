// Lecturas del módulo SG-SST (sin "use server": solo las importan Server
// Components y otras funciones de servidor).

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const MODULO_SST = "sst";

export type AccesoSst = { puedeVer: boolean; puedeEditar: boolean; gestion: boolean };

export const getAccesoSst = cache(async (): Promise<AccesoSst> => {
  const supabase = await createClient();
  const permiso = (permiso_code: string) => supabase.rpc("has_permission", { modulo_code: MODULO_SST, permiso_code });
  const [{ data: puedeVer }, { data: puedeEditar }, { data: gestion }] = await Promise.all([
    permiso("VIEW"),
    permiso("EDIT"),
    supabase.rpc("has_entitlement", { modulo_code: MODULO_SST, feature_code: "gestion" }),
  ]);
  return { puedeVer: !!puedeVer, puedeEditar: !!puedeEditar, gestion: !!gestion };
});

export type PerfilSst = {
  modo: "empleador" | "independiente";
  codigo_actividad: string | null;
  otros_trabajadores: number;
  otros_trabajadores_detalle: string | null;
  excluye_contratistas: boolean;
  justificacion_exclusion: string | null;
  responsable_nombre: string | null;
  responsable_formacion: string | null;
  responsable_licencia: string | null;
  responsable_licencia_vence: string | null;
  responsable_curso_50h: string | null;
  updated_at: string;
};

export const PERFIL_SST_SELECT =
  "modo, codigo_actividad, otros_trabajadores, otros_trabajadores_detalle, excluye_contratistas, justificacion_exclusion, responsable_nombre, responsable_formacion, responsable_licencia, responsable_licencia_vence, responsable_curso_50h, updated_at";

export async function getPerfilSst(supabase: Supabase): Promise<PerfilSst | null> {
  const { data } = await supabase.from("sst_perfil").select(PERFIL_SST_SELECT).maybeSingle();
  return (data as PerfilSst | null) ?? null;
}

export type ConteoTrabajadores = {
  dependientes: number;
  contratistas: number;
  sin_categoria: number;
  clase_clinica: string | null;
  clase_cargos_max: string | null;
  con_cargo: number;
  cargos_sin_clase: number;
};

// null = la función no existe todavía (0072 sin aplicar) o falló.
export async function getConteoTrabajadores(supabase: Supabase): Promise<ConteoTrabajadores | null> {
  const { data, error } = await supabase.rpc("fn_sst_conteo_trabajadores");
  if (error) {
    console.error("[sst] fn_sst_conteo_trabajadores", error);
    return null;
  }
  const fila = (Array.isArray(data) ? data[0] : data) as ConteoTrabajadores | undefined;
  return fila ?? null;
}

// ============================================================
// F3 · Eventos (incidentes, accidentes, enfermedad laboral)
// ============================================================
export type EventoSst = {
  id: string;
  empleado_id: string;
  fecha: string;
  hora: string | null;
  tipo_evento: "incidente" | "accidente" | "enfermedad_laboral";
  gravedad: "leve" | "grave" | "mortal" | null;
  sede_id: string | null;
  lugar: string | null;
  resumen: string;
  causa: string | null;
  tipo_lesion: string | null;
  parte_cuerpo: string | null;
  agente: string | null;
  riesgo_biologico: boolean;
  seguimiento_biologico: string | null;
  dias_incapacidad: number;
  dias_cargados: number;
  furat_numero: string | null;
  reportado_arl: boolean;
  fecha_reporte_arl: string | null;
  reportado_eps: boolean;
  fecha_reporte_eps: string | null;
  reportado_mintrabajo: boolean;
  fecha_reporte_mintrabajo: string | null;
  radicado_mintrabajo: string | null;
  fecha_limite_reporte: string | null;
  fecha_limite_investigacion: string | null;
  cerrado: boolean;
  fecha_cierre: string | null;
  resumen_cierre: string | null;
  created_at: string;
  sst_investigaciones: { id: string; estado: "en_curso" | "cerrada" } | null;
};

export const EVENTO_SELECT =
  "id, empleado_id, fecha, hora, tipo_evento, gravedad, sede_id, lugar, resumen, causa, tipo_lesion, parte_cuerpo, agente, riesgo_biologico, seguimiento_biologico, dias_incapacidad, dias_cargados, furat_numero, reportado_arl, fecha_reporte_arl, reportado_eps, fecha_reporte_eps, reportado_mintrabajo, fecha_reporte_mintrabajo, radicado_mintrabajo, fecha_limite_reporte, fecha_limite_investigacion, cerrado, fecha_cierre, resumen_cierre, created_at, sst_investigaciones(id, estado)";

export async function getEventos(supabase: Supabase, filtros: { tipo?: string; estado?: string }): Promise<EventoSst[]> {
  let q = supabase.from("accidentes_trabajo").select(EVENTO_SELECT).order("fecha", { ascending: false }).limit(500);
  if (filtros.tipo) q = q.eq("tipo_evento", filtros.tipo);
  if (filtros.estado === "abiertos") q = q.eq("cerrado", false);
  if (filtros.estado === "cerrados") q = q.eq("cerrado", true);
  const { data, error } = await q;
  if (error) console.error("[sst] getEventos", error);
  return (data ?? []) as unknown as EventoSst[];
}

export async function getEvento(supabase: Supabase, id: string): Promise<EventoSst | null> {
  const { data } = await supabase.from("accidentes_trabajo").select(EVENTO_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as EventoSst | null) ?? null;
}

export type Investigacion = {
  id: string;
  fecha_inicio: string;
  equipo: { nombre: string; rol: string }[];
  descripcion: string | null;
  metodologia: string | null;
  causas_inmediatas: string | null;
  causas_basicas: string | null;
  conclusiones: string | null;
  estado: "en_curso" | "cerrada";
  fecha_cierre: string | null;
  informe_nombre_archivo: string | null;
};

export async function getInvestigacion(supabase: Supabase, accidenteId: string): Promise<Investigacion | null> {
  const { data } = await supabase
    .from("sst_investigaciones")
    .select("id, fecha_inicio, equipo, descripcion, metodologia, causas_inmediatas, causas_basicas, conclusiones, estado, fecha_cierre, informe_nombre_archivo")
    .eq("accidente_id", accidenteId)
    .maybeSingle();
  return (data as Investigacion | null) ?? null;
}

export type AccionSst = {
  id: string;
  jerarquia: string | null;
  origen: string;
  origen_id: string | null;
  tipo: string;
  descripcion: string;
  responsable_id: string;
  fecha_compromiso: string;
  estado: "abierta" | "en_curso" | "cerrada";
  fecha_cierre: string | null;
  cierre_observacion: string | null;
};

const ACCION_SELECT = "id, jerarquia, origen, origen_id, tipo, descripcion, responsable_id, fecha_compromiso, estado, fecha_cierre, cierre_observacion";

export async function getAccionesDeOrigen(supabase: Supabase, origen: string): Promise<AccionSst[]> {
  const { data } = await supabase.from("sst_acciones").select(ACCION_SELECT).eq("origen", origen).order("created_at");
  return (data ?? []) as AccionSst[];
}

export async function getAcciones(supabase: Supabase, origen: string, origenId: string): Promise<AccionSst[]> {
  const { data } = await supabase
    .from("sst_acciones")
    .select(ACCION_SELECT)
    .eq("origen", origen)
    .eq("origen_id", origenId)
    .order("created_at");
  return (data ?? []) as AccionSst[];
}

// Personas (de RRHH) sin exigir permiso de RRHH: fn_empleados_picker solo
// devuelve id y nombre de los activos. Los inactivos de eventos viejos se
// muestran como "persona retirada".
export async function getPersonas(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.rpc("fn_empleados_picker");
  return (data ?? []) as { id: string; nombre: string }[];
}

export async function getSedes(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden");
  return (data ?? []) as { id: string; nombre: string }[];
}

// ============================================================
// F4 · Documentos del sistema
// ============================================================
export type VersionDocumentoSst = {
  id: string;
  tipo_documento_id: string;
  version: number;
  nombre_archivo: string;
  vigente_desde: string;
  created_by: string | null;
  created_at: string;
};

export type DocumentosSst = {
  tipos: { id: string; codigo: string; nombre: string }[];
  versiones: VersionDocumentoSst[];
};

export async function getDocumentosSst(supabase: Supabase): Promise<DocumentosSst> {
  const [tipos, versiones] = await Promise.all([
    supabase.from("tipos_documento_normativo").select("id, codigo, nombre").eq("categoria", "sgsst").eq("activo", true).order("orden"),
    supabase
      .from("documentos_normativos")
      .select("id, tipo_documento_id, version, nombre_archivo, vigente_desde, created_by, created_at, tipos_documento_normativo!inner(categoria)")
      .eq("tipos_documento_normativo.categoria", "sgsst")
      .order("version", { ascending: false }),
  ]);
  return {
    tipos: (tipos.data ?? []) as DocumentosSst["tipos"],
    versiones: (versiones.data ?? []) as unknown as VersionDocumentoSst[],
  };
}

// ============================================================
// F5 · Matriz de peligros
// ============================================================
export type PeligroSst = {
  id: string;
  sede_id: string | null;
  proceso: string;
  actividad: string;
  cargos: string | null;
  rutinaria: boolean;
  clasificacion: string;
  descripcion: string;
  efectos: string | null;
  expuestos: number;
  control_fuente: string | null;
  control_medio: string | null;
  control_individuo: string | null;
  nd: number;
  ne: number;
  nc: number;
  np: number;
  nr: number;
  nivel_riesgo: "I" | "II" | "III" | "IV";
  peor_consecuencia: string | null;
  requisito_legal: string | null;
  updated_at: string;
};

export async function getPeligros(supabase: Supabase): Promise<PeligroSst[]> {
  const { data, error } = await supabase
    .from("sst_peligros")
    .select(
      "id, sede_id, proceso, actividad, cargos, rutinaria, clasificacion, descripcion, efectos, expuestos, control_fuente, control_medio, control_individuo, nd, ne, nc, np, nr, nivel_riesgo, peor_consecuencia, requisito_legal, updated_at",
    )
    .eq("activo", true)
    .order("nr", { ascending: false });
  if (error) console.error("[sst] getPeligros", error);
  return (data ?? []) as PeligroSst[];
}

// ============================================================
// F6 · Capacitación, EPP y evaluaciones médicas
// ============================================================
export type EstadoPersona = {
  empleado_id: string;
  nombre: string;
  cargo_id: string | null;
  cargo_nombre: string | null;
  periodicidad_meses: number | null;
  ultimo_examen: string | null;
  ultimo_examen_tipo: string | null;
  proximo_examen: string | null;
  vacunas_vencidas: number;
  vacunas_por_vencer: number;
  ultima_entrega_epp: string | null;
  capacitaciones_anio: number;
};

export async function getEstadoPersonas(supabase: Supabase): Promise<EstadoPersona[] | null> {
  const { data, error } = await supabase.rpc("fn_sst_estado_personas");
  if (error) {
    console.error("[sst] fn_sst_estado_personas", error);
    return null;
  }
  return (data ?? []) as EstadoPersona[];
}

export type CapacitacionSst = {
  id: string;
  tema: string;
  tipo: string;
  fecha: string;
  duracion_horas: number | null;
  facilitador: string | null;
  modalidad: string;
  estado: "programada" | "realizada" | "cancelada";
  motivo_cancelacion: string | null;
  soporte_nombre_archivo: string | null;
  sst_capacitacion_asistentes: { empleado_id: string }[];
};

export async function getCapacitaciones(supabase: Supabase, anio: number): Promise<CapacitacionSst[]> {
  const { data, error } = await supabase
    .from("sst_capacitaciones")
    .select("id, tema, tipo, fecha, duracion_horas, facilitador, modalidad, estado, motivo_cancelacion, soporte_nombre_archivo, sst_capacitacion_asistentes(empleado_id)")
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`)
    .order("fecha");
  if (error) console.error("[sst] getCapacitaciones", error);
  return (data ?? []) as CapacitacionSst[];
}

export type EntregaEpp = {
  id: string;
  empleado_id: string;
  fecha: string;
  elementos: { elemento: string; cantidad: number }[];
  capacitado_uso: boolean;
  observacion: string | null;
  soporte_nombre_archivo: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
};

export async function getEntregasEpp(supabase: Supabase): Promise<EntregaEpp[]> {
  const { data, error } = await supabase
    .from("sst_epp_entregas")
    .select("id, empleado_id, fecha, elementos, capacitado_uso, observacion, soporte_nombre_archivo, anulado, anulado_motivo")
    .order("fecha", { ascending: false })
    .limit(200);
  if (error) console.error("[sst] getEntregasEpp", error);
  return (data ?? []) as EntregaEpp[];
}

export async function getProfesiograma(supabase: Supabase): Promise<{ cargos: { id: string; nombre: string }[]; periodicidad: Record<string, number> }> {
  const [cargos, filas] = await Promise.all([
    supabase.from("cargos").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("sst_examenes_cargo").select("cargo_id, periodicidad_meses"),
  ]);
  return {
    cargos: (cargos.data ?? []) as { id: string; nombre: string }[],
    periodicidad: Object.fromEntries(((filas.data ?? []) as { cargo_id: string; periodicidad_meses: number }[]).map((f) => [f.cargo_id, f.periodicidad_meses])),
  };
}

// ============================================================
// F7 · Plan anual, comités e indicadores
// ============================================================
export type ActividadPlan = {
  id: string;
  anio: number;
  mes: number;
  ciclo: "planear" | "hacer" | "verificar" | "actuar";
  actividad: string;
  meta: string | null;
  recursos: string | null;
  responsable_id: string | null;
  estado: "pendiente" | "ejecutada" | "cancelada";
  fecha_ejecucion: string | null;
  observacion: string | null;
};

export async function getPlan(supabase: Supabase, anio: number): Promise<ActividadPlan[]> {
  const { data, error } = await supabase
    .from("sst_plan_actividades")
    .select("id, anio, mes, ciclo, actividad, meta, recursos, responsable_id, estado, fecha_ejecucion, observacion")
    .eq("anio", anio)
    .order("mes")
    .order("created_at");
  if (error) console.error("[sst] getPlan", error);
  return (data ?? []) as ActividadPlan[];
}

export type ComiteSst = {
  id: string;
  tipo: "vigia" | "copasst" | "convivencia";
  fecha_inicio: string;
  fecha_fin: string;
  integrantes: { nombre: string; representa: string; rol: string }[];
  acta_nombre_archivo: string | null;
  sst_comite_reuniones: { id: string; fecha: string; temas: string; compromisos: string | null; acta_nombre_archivo: string | null }[];
};

export async function getComites(supabase: Supabase): Promise<ComiteSst[]> {
  const { data, error } = await supabase
    .from("sst_comites")
    .select("id, tipo, fecha_inicio, fecha_fin, integrantes, acta_nombre_archivo, sst_comite_reuniones(id, fecha, temas, compromisos, acta_nombre_archivo)")
    .order("fecha_inicio", { ascending: false });
  if (error) console.error("[sst] getComites", error);
  return ((data ?? []) as ComiteSst[]).map((c) => ({
    ...c,
    sst_comite_reuniones: [...c.sst_comite_reuniones].sort((a, b) => b.fecha.localeCompare(a.fecha)),
  }));
}

export async function getInsumosIndicadores(supabase: Supabase, anio: number) {
  const { data, error } = await supabase.rpc("fn_sst_indicadores", { p_anio: anio });
  if (error) {
    console.error("[sst] fn_sst_indicadores", error);
    return null;
  }
  return (data ?? []) as import("@/lib/sst/indicadores").InsumoMes[];
}
