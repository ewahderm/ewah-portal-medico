"use server";

// Incidentes, accidentes y enfermedad laboral (SG-SST F3). La BD (0073)
// fija los plazos con festivos, exige fecha a cada reporte marcado, protege
// la investigación cerrada y las acciones cerradas, y verifica que persona,
// sede y responsable sean de la clínica. Aquí: forma de los datos, permisos
// y mensajes. EWAH no reporta ante la ARL ni MinTrabajo: guarda la fecha,
// el FURAT o radicado y el soporte.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import {
  FECHA_ISO,
  esUuid,
  firmar,
  hoyBogota,
  mensajeError,
  textoOpcional,
  verificarArchivoSubido,
} from "@/lib/habilitacion/servidor";
import { GRAVEDADES, METODOLOGIAS, ROLES_EQUIPO, TIPOS_ACCION, TIPOS_EVENTO } from "@/lib/sst/constantes";

type Resultado = { error?: string };

function revalidar() {
  revalidatePath("/sst", "layout");
  revalidatePath("/rrhh", "layout");
}

const corto = (v: string | null | undefined, max = 200) => textoOpcional(v)?.slice(0, max) ?? null;

export async function registrarEvento(input: {
  tipo: string;
  empleadoId: string;
  fecha: string;
  hora: string | null;
  sedeId: string | null;
  lugar: string | null;
  resumen: string;
  gravedad: string | null;
  tipoLesion: string | null;
  parteCuerpo: string | null;
  agente: string | null;
  riesgoBiologico: boolean;
}): Promise<Resultado & { id?: string }> {
  if (!TIPOS_EVENTO.some((t) => t.value === input.tipo)) return { error: "Elige qué pasó." };
  if (!esUuid(input.empleadoId)) return { error: "Elige la persona." };
  if (!FECHA_ISO.test(input.fecha)) return { error: "Escribe la fecha." };
  if (input.fecha > hoyBogota()) return { error: "La fecha no puede ser futura." };
  if (input.hora && !/^\d{2}:\d{2}$/.test(input.hora)) return { error: "Hora inválida." };
  if (input.sedeId && !esUuid(input.sedeId)) return { error: "Sede inválida." };
  const resumen = input.resumen.trim();
  if (resumen.length < 10 || resumen.length > 4000) return { error: "Cuenta qué pasó (al menos 10 caracteres)." };
  const incidente = input.tipo === "incidente";
  if (!incidente && !GRAVEDADES.some((g) => g.value === input.gravedad)) return { error: "Indica la gravedad." };

  const check = await requirePermiso("sst", "CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accidentes_trabajo")
    .insert({
      clinica_id: check.usuario.clinica_id,
      tipo_evento: input.tipo,
      empleado_id: input.empleadoId,
      fecha: input.fecha,
      hora: input.hora,
      sede_id: input.sedeId,
      lugar: corto(input.lugar),
      resumen,
      gravedad: incidente ? null : input.gravedad,
      tipo_lesion: incidente ? null : corto(input.tipoLesion),
      parte_cuerpo: incidente ? null : corto(input.parteCuerpo),
      agente: corto(input.agente),
      riesgo_biologico: input.riesgoBiologico,
    })
    .select("id")
    .single();
  if (error || !data) return { error: mensajeError("registrarEvento", error!, "No se pudo registrar el evento.") };
  revalidar();
  return { id: data.id };
}

// Reportes ante ARL, EPS y MinTrabajo + días de incapacidad y cierre.
export async function actualizarSeguimiento(
  id: string,
  input: {
    reportadoArl: boolean;
    fechaReporteArl: string | null;
    furat: string | null;
    reportadoEps: boolean;
    fechaReporteEps: string | null;
    reportadoMintrabajo: boolean;
    fechaReporteMintrabajo: string | null;
    radicadoMintrabajo: string | null;
    diasIncapacidad: number;
    diasCargados: number;
    seguimientoBiologico: string | null;
    causa: string | null;
    cerrado: boolean;
    fechaCierre: string | null;
    resumenCierre: string | null;
  },
): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Evento inválido." };
  const hoy = hoyBogota();
  const fechas = [
    [input.reportadoArl, input.fechaReporteArl, "ARL"],
    [input.reportadoEps, input.fechaReporteEps, "EPS"],
    [input.reportadoMintrabajo, input.fechaReporteMintrabajo, "MinTrabajo"],
  ] as const;
  for (const [marcado, fecha, quien] of fechas) {
    if (marcado && (!fecha || !FECHA_ISO.test(fecha))) return { error: `Escribe la fecha del reporte a ${quien}.` };
    if (marcado && fecha! > hoy) return { error: `La fecha del reporte a ${quien} no puede ser futura.` };
  }
  for (const n of [input.diasIncapacidad, input.diasCargados]) {
    if (!Number.isInteger(n) || n < 0 || n > 6000) return { error: "Los días deben ser números enteros." };
  }
  if (input.cerrado) {
    if (!input.fechaCierre || !FECHA_ISO.test(input.fechaCierre) || input.fechaCierre > hoy) return { error: "Escribe la fecha de cierre." };
    if ((input.resumenCierre ?? "").trim().length < 10) return { error: "Resume el cierre (al menos 10 caracteres)." };
  }

  const check = await requirePermiso("sst", "EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accidentes_trabajo")
    .update({
      reportado_arl: input.reportadoArl,
      fecha_reporte_arl: input.reportadoArl ? input.fechaReporteArl : null,
      furat_numero: corto(input.furat, 100),
      reportado_eps: input.reportadoEps,
      fecha_reporte_eps: input.reportadoEps ? input.fechaReporteEps : null,
      reportado_mintrabajo: input.reportadoMintrabajo,
      fecha_reporte_mintrabajo: input.reportadoMintrabajo ? input.fechaReporteMintrabajo : null,
      radicado_mintrabajo: input.reportadoMintrabajo ? corto(input.radicadoMintrabajo, 100) : null,
      dias_incapacidad: input.diasIncapacidad,
      dias_cargados: input.diasCargados,
      seguimiento_biologico: corto(input.seguimientoBiologico, 2000),
      causa: corto(input.causa, 4000),
      cerrado: input.cerrado,
      fecha_cierre: input.cerrado ? input.fechaCierre : null,
      resumen_cierre: input.cerrado ? corto(input.resumenCierre, 4000) : null,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError("actualizarSeguimiento", error, "No se pudo guardar.") };
  if (!data?.length) return { error: "No tienes permiso para editar este evento." };
  revalidar();
  return {};
}

export async function guardarInvestigacion(
  accidenteId: string,
  input: {
    fechaInicio: string;
    equipo: { nombre: string; rol: string }[];
    descripcion: string | null;
    metodologia: string | null;
    causasInmediatas: string | null;
    causasBasicas: string | null;
    conclusiones: string | null;
    cerrar: boolean;
    fechaCierre: string | null;
    informePath: string | null;
    informeNombre: string | null;
  },
): Promise<Resultado> {
  if (!esUuid(accidenteId)) return { error: "Evento inválido." };
  const hoy = hoyBogota();
  if (!FECHA_ISO.test(input.fechaInicio) || input.fechaInicio > hoy) return { error: "Escribe la fecha de inicio (no futura)." };
  const equipo = input.equipo
    .map((m) => ({ nombre: m.nombre.trim().slice(0, 200), rol: m.rol }))
    .filter((m) => m.nombre.length > 0);
  if (equipo.length > 20 || equipo.some((m) => !ROLES_EQUIPO.some((r) => r.value === m.rol))) return { error: "Revisa el equipo investigador." };
  if (input.metodologia && !METODOLOGIAS.some((m) => m.value === input.metodologia)) return { error: "Metodología inválida." };
  if (input.cerrar) {
    if (equipo.length === 0) return { error: "Para cerrar, registra quién investigó." };
    if ((input.causasInmediatas ?? "").trim().length < 10 || (input.causasBasicas ?? "").trim().length < 10) {
      return { error: "Para cerrar, escribe las causas inmediatas y las básicas (al menos 10 caracteres cada una)." };
    }
    if (!input.fechaCierre || !FECHA_ISO.test(input.fechaCierre) || input.fechaCierre > hoy || input.fechaCierre < input.fechaInicio) {
      return { error: "La fecha de cierre debe estar entre el inicio y hoy." };
    }
  }

  const check = await requirePermiso("sst", "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();

  const { data: existente } = await supabase.from("sst_investigaciones").select("id, estado").eq("accidente_id", accidenteId).maybeSingle();
  if (existente?.estado === "cerrada") return { error: "La investigación ya está cerrada." };
  if (existente) {
    const editar = await requirePermiso("sst", "EDIT");
    if (!editar.ok) return { error: editar.error };
  }

  let informe: { storage_path: string; nombre: string } | null = null;
  const investigacionId = existente?.id ?? crypto.randomUUID();
  if (input.informePath) {
    const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "investigaciones", accidenteId, input.informePath, input.informeNombre ?? "informe", "sst");
    if ("error" in v) return { error: v.error };
    informe = { storage_path: v.path, nombre: v.nombre };
  }

  const datos = {
    fecha_inicio: input.fechaInicio,
    equipo,
    descripcion: corto(input.descripcion, 8000),
    metodologia: input.metodologia,
    causas_inmediatas: corto(input.causasInmediatas, 4000),
    causas_basicas: corto(input.causasBasicas, 4000),
    conclusiones: corto(input.conclusiones, 4000),
    estado: input.cerrar ? "cerrada" : "en_curso",
    fecha_cierre: input.cerrar ? input.fechaCierre : null,
    ...(informe ? { informe_storage_path: informe.storage_path, informe_nombre_archivo: informe.nombre } : {}),
  };
  const { error } = existente
    ? await supabase.from("sst_investigaciones").update(datos).eq("id", existente.id)
    : await supabase.from("sst_investigaciones").insert({ ...datos, id: investigacionId, clinica_id: check.usuario.clinica_id, accidente_id: accidenteId });
  if (error) return { error: mensajeError("guardarInvestigacion", error, "No se pudo guardar la investigación.") };
  revalidar();
  return {};
}

export async function urlInforme(accidenteId: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(accidenteId)) return { error: "Evento inválido." };
  const check = await requirePermiso("sst", "VIEW");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase
    .from("sst_investigaciones")
    .select("informe_storage_path, informe_nombre_archivo")
    .eq("accidente_id", accidenteId)
    .maybeSingle();
  if (!data?.informe_storage_path) return { error: "No hay informe cargado." };
  return firmar(supabase, data.informe_storage_path, data.informe_nombre_archivo, "sst");
}

// Plan de acción (genérico; hoy desde investigaciones).
export async function crearAccion(input: {
  origen: "investigacion";
  origenId: string;
  tipo: string;
  descripcion: string;
  responsableId: string;
  fechaCompromiso: string;
}): Promise<Resultado> {
  if (!esUuid(input.origenId) || !esUuid(input.responsableId)) return { error: "Datos inválidos." };
  if (!TIPOS_ACCION.some((t) => t.value === input.tipo)) return { error: "Tipo de acción inválido." };
  const descripcion = input.descripcion.trim();
  if (descripcion.length < 10 || descripcion.length > 2000) return { error: "Describe la acción (al menos 10 caracteres)." };
  if (!FECHA_ISO.test(input.fechaCompromiso)) return { error: "Escribe la fecha compromiso." };

  const check = await requirePermiso("sst", "CREATE");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase.from("sst_acciones").insert({
    clinica_id: check.usuario.clinica_id,
    origen: input.origen,
    origen_id: input.origenId,
    tipo: input.tipo,
    descripcion,
    responsable_id: input.responsableId,
    fecha_compromiso: input.fechaCompromiso,
  });
  if (error) return { error: mensajeError("crearAccion", error, "No se pudo crear la acción.") };
  revalidar();
  return {};
}

export async function avanzarAccion(id: string, estado: "en_curso" | "cerrada", observacion: string | null, fechaCierre: string | null): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Acción inválida." };
  if (estado === "cerrada") {
    if ((observacion ?? "").trim().length < 10) return { error: "Cuenta cómo se cerró (al menos 10 caracteres)." };
    if (!fechaCierre || !FECHA_ISO.test(fechaCierre) || fechaCierre > hoyBogota()) return { error: "Escribe la fecha de cierre (no futura)." };
  }
  const check = await requirePermiso("sst", "EDIT");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sst_acciones")
    .update(estado === "cerrada" ? { estado, fecha_cierre: fechaCierre, cierre_observacion: observacion!.trim().slice(0, 4000) } : { estado })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError("avanzarAccion", error, "No se pudo actualizar la acción.") };
  if (!data?.length) return { error: "No tienes permiso para editar esta acción." };
  revalidar();
  return {};
}
