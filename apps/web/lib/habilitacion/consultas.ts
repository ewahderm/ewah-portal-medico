// Lecturas del módulo de Habilitación con el cliente de SESIÓN (RLS de la
// clínica aplica). Sin "use server": solo las usan Server Components y las
// actions del propio módulo. Patrón de lib/catalogos.ts.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_GESTION, MODULO_HABILITACION } from "@/lib/habilitacion/constantes";
import {
  FILA_CRITERIO_SELECT,
  PERFIL_SELECT,
  SERVICIO_SEDE_SELECT,
  type AccesoHabilitacion,
  type ClinicaRegulatoria,
  type ConteoCriterios,
  type DetalleServicioInput,
  type FilaCriterio,
  type FilaProgreso,
  type PerfilPrestador,
  type PracticaConNumerales,
  type SedeConServicios,
  type SedeHabilitacion,
  type ServicioNormaOpcion,
  type ServicioSede,
  type TipoPrestadorCatalogo,
  type UsuarioClinica,
} from "@/lib/habilitacion/tipos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// cache(): el layout y la página de cada sección piden lo mismo en el
// mismo request; así son 3 RPC por request, no 6.
export const getAccesoHabilitacion = cache(async (): Promise<AccesoHabilitacion> => {
  const supabase = await createClient();
  const [{ data: puedeVer }, { data: puedeEditar }, { data: gestion }] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: MODULO_HABILITACION, permiso_code: "VIEW" }),
    supabase.rpc("has_permission", { modulo_code: MODULO_HABILITACION, permiso_code: "EDIT" }),
    supabase.rpc("has_entitlement", { modulo_code: MODULO_HABILITACION, feature_code: FEATURE_GESTION }),
  ]);
  return { puedeVer: !!puedeVer, puedeEditar: !!puedeEditar, gestion: !!gestion };
});

export async function getPerfilPrestador(supabase: Supabase): Promise<PerfilPrestador | null> {
  const { data } = await supabase.from("hab_perfil_prestador").select(PERFIL_SELECT).maybeSingle();
  return (data as unknown as PerfilPrestador | null) ?? null;
}

export async function getClinicaRegulatoria(supabase: Supabase): Promise<ClinicaRegulatoria | null> {
  const { data } = await supabase
    .from("clinicas")
    .select(
      "nombre, nit, codigo_habilitacion, departamento_id, tipo_persona:tipos_persona(codigo, nombre), departamento:departamentos(nombre)",
    )
    .maybeSingle();
  return (data as unknown as ClinicaRegulatoria | null) ?? null;
}

export async function getTiposPrestador(supabase: Supabase): Promise<TipoPrestadorCatalogo[]> {
  const { data } = await supabase.from("hab_tipos_prestador").select("codigo, nombre, definicion").order("orden");
  return (data ?? []) as TipoPrestadorCatalogo[];
}

export async function getSedesConServicios(
  supabase: Supabase,
): Promise<{ sedes: SedeConServicios[]; serviciosSinSede: ServicioSede[] }> {
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase
      .from("sedes")
      .select("id, nombre, uso_edificacion, fecha_construccion_intervencion, fecha_construccion_es_aproximada, codigo_sede_reps")
      .eq("activo", true)
      .order("orden"),
    supabase.from("clinica_servicios_habilitados").select(SERVICIO_SEDE_SELECT).order("created_at"),
  ]);
  const filas = (servicios ?? []) as unknown as ServicioSede[];
  return {
    sedes: ((sedes ?? []) as SedeHabilitacion[]).map((s) => ({
      ...s,
      servicios: filas.filter((f) => f.sede_id === s.id),
    })),
    // Sin sede (filas anteriores a 0061) o en una sede inactiva: no entran
    // al motor; la UI las señala para que se corrijan en Datos básicos.
    serviciosSinSede: filas.filter((f) => !f.sede_id || !(sedes ?? []).some((s) => s.id === f.sede_id)),
  };
}

type FilaMapeo = {
  practica_medica_id: string;
  requiere_eleccion: boolean;
  nota: string | null;
  confianza: "alta" | "inferida";
  hab_servicios_norma: {
    id: string;
    clave: string;
    nombre: string;
    complejidades: string[];
    modalidades: string[];
    telemedicina_categorias: string[];
    seleccionable: boolean;
    orden: number;
    hab_normas: { vigente_hasta: string | null } | null;
  } | null;
};

// Catálogo de prácticas con sus numerales posibles de la norma VIGENTE.
export async function getPracticasConNumerales(supabase: Supabase): Promise<PracticaConNumerales[]> {
  const [{ data: practicas }, { data: mapeo }] = await Promise.all([
    supabase.from("practicas_medicas").select("id, codigo, nombre").eq("activo", true).order("orden"),
    supabase
      .from("hab_mapeo_practica_servicio")
      .select(
        "practica_medica_id, requiere_eleccion, nota, confianza, hab_servicios_norma(id, clave, nombre, complejidades, modalidades, telemedicina_categorias, seleccionable, orden, hab_normas(vigente_hasta))",
      ),
  ]);

  const porPractica = new Map<string, ServicioNormaOpcion[]>();
  for (const m of (mapeo ?? []) as unknown as FilaMapeo[]) {
    const s = m.hab_servicios_norma;
    if (!s || !s.seleccionable || s.hab_normas?.vigente_hasta) continue;
    const lista = porPractica.get(m.practica_medica_id) ?? [];
    lista.push({
      id: s.id,
      clave: s.clave,
      nombre: s.nombre,
      complejidades: s.complejidades,
      modalidades: s.modalidades,
      telemedicina_categorias: s.telemedicina_categorias,
      requiere_eleccion: m.requiere_eleccion,
      nota: m.nota,
      confianza: m.confianza,
    });
    porPractica.set(m.practica_medica_id, lista);
  }

  return (practicas ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    grupo: p.codigo,
    opciones: (porPractica.get(p.id) ?? []).sort((a, b) => a.clave.localeCompare(b.clave, "es", { numeric: true })),
  }));
}

// ============================================================
// Motor de criterios (0065, fase F3). Una sola implementación en SQL; aquí
// solo se CUENTA lo que devuelve. Si la migración del motor todavía no está
// aplicada, la UI muestra "cálculo disponible pronto" en vez de fallar.
// ============================================================

// Fecha de hoy en Colombia (la vigencia de los criterios corta por día).
export function hoyColombia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

const SIN_MOTOR: ConteoCriterios = { total: null, evaluables: null, motorDisponible: false };

function motorNoExiste(error: { code?: string; message?: string }) {
  // PGRST202 = PostgREST no encuentra la función; 42883 = no existe en PG.
  return error.code === "PGRST202" || error.code === "42883";
}

async function contarFilasRpc(
  supabase: Supabase,
  funcion: string,
  args: Record<string, unknown>,
): Promise<ConteoCriterios> {
  // count=exact devuelve el total aunque se pida 1 fila: no viajan los ~465
  // criterios solo para contarlos (y no choca con el máximo de filas de
  // PostgREST si una sede declara muchos servicios).
  const total = await supabase.rpc(funcion, args, { count: "exact" }).limit(1);
  if (total.error) {
    if (motorNoExiste(total.error)) return SIN_MOTOR;
    console.error(`[habilitacion] ${funcion}`, total.error);
    return { total: null, evaluables: null, motorDisponible: true };
  }
  // Evaluables = sin encabezados "Cuenta con:" ni autorresueltos por
  // remisión a 11.1 (no se marcan a mano, §1.6 pasos 5 y 6).
  const evaluables = await supabase
    .rpc(funcion, args, { count: "exact" })
    .eq("es_encabezado", false)
    .eq("autorresuelto", false)
    .limit(1);
  return {
    total: total.count ?? 0,
    evaluables: evaluables.error ? null : (evaluables.count ?? 0),
    motorDisponible: true,
  };
}

export async function contarCriteriosSede(supabase: Supabase, sedeId: string): Promise<ConteoCriterios> {
  return contarFilasRpc(supabase, "fn_hab_criterios_aplicables", { p_sede_id: sedeId, p_fecha: hoyColombia() });
}

export type ContextoMotor = {
  uso_edificacion: string | null;
  servicios: {
    servicio_norma_id: string;
    complejidad: string;
    modalidades: string[];
    telemedicina_categorias: string[];
    telemedicina_roles: string[];
  }[];
};

export async function contarCriteriosContexto(supabase: Supabase, contexto: ContextoMotor): Promise<ConteoCriterios> {
  // Sin servicios el motor no agrega ni 11.1: 0 sin ir a la BD.
  if (contexto.servicios.length === 0) return { total: 0, evaluables: 0, motorDisponible: true };
  return contarFilasRpc(supabase, "fn_hab_resolver_criterios", { p_contexto: contexto, p_fecha: hoyColombia() });
}

// Mismo filtro que el envoltorio de clínica del motor (§1.6): filas con
// numeral y complejidad, y que no estén cerradas.
export function servicioEntraAlMotor(
  s: Pick<ServicioSede, "servicio_norma_id" | "complejidad" | "estado">,
): boolean {
  return !!s.servicio_norma_id && !!s.complejidad && s.estado !== "cerrado";
}

export function aContextoServicio(s: DetalleServicioInput | ServicioSede): ContextoMotor["servicios"][number] | null {
  const servicioNormaId = "servicioNormaId" in s ? s.servicioNormaId : s.servicio_norma_id;
  const complejidad = s.complejidad;
  if (!servicioNormaId || !complejidad) return null;
  return {
    servicio_norma_id: servicioNormaId,
    complejidad,
    modalidades: s.modalidades,
    telemedicina_categorias: "telemedicinaCategorias" in s ? s.telemedicinaCategorias : s.telemedicina_categorias,
    telemedicina_roles: "telemedicinaRoles" in s ? s.telemedicinaRoles : s.telemedicina_roles,
  };
}

// ============================================================
// Autoevaluación (0066, fase F5). `null` = la migración todavía no está
// aplicada: la pantalla lo dice en vez de fallar.
// ============================================================

// Contadores por sede × servicio × estándar, sin textos (pestañas,
// cabecera, selector de sede y paso 4 de la ruta). Sin sede = todas.
export async function getProgresoAutoevaluacion(supabase: Supabase, sedeId?: string): Promise<FilaProgreso[] | null> {
  const { data, error } = await supabase.rpc("fn_hab_progreso_autoevaluacion", sedeId ? { p_sede_id: sedeId } : {});
  if (error) {
    if (!motorNoExiste(error)) console.error("[habilitacion] fn_hab_progreso_autoevaluacion", error);
    return null;
  }
  return (data ?? []) as FilaProgreso[];
}

// Un estándar a la vez (≤ ~250 filas en 11.1 IN + servicios), solo las
// columnas que pinta la tarjeta.
export async function getCriteriosEstandar(
  supabase: Supabase,
  sedeId: string,
  estandar: string,
): Promise<FilaCriterio[] | null> {
  const { data, error } = await supabase
    .rpc("fn_hab_tablero_criterios", { p_sede_id: sedeId, p_estandar: estandar })
    .select(FILA_CRITERIO_SELECT);
  if (error) {
    if (!motorNoExiste(error)) console.error("[habilitacion] fn_hab_tablero_criterios", error);
    return null;
  }
  return (data ?? []) as unknown as FilaCriterio[];
}

// Responsables posibles (HU-4.4 AC1): usuarios activos de la clínica.
export async function getUsuariosClinica(supabase: Supabase): Promise<UsuarioClinica[]> {
  const { data } = await supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre");
  return (data ?? []) as UsuarioClinica[];
}
