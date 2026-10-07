"use server";

// Sedes y servicios (Etapa 2, HU-2.1 y HU-2.2). Todo exige
// habilitacion/EDIT + sub-feature de gestión (plan Pro); la RLS y las RPC de
// 0061/0062 lo vuelven a exigir. La legalidad de cada combinación
// (numeral ↔ práctica, complejidad, modalidades, telemedicina) vive en el
// trigger fn_servicio_habilitado_validar: aquí solo se valida la forma y se
// traduce su error a un mensaje claro.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";
import { requireHabilitacion } from "@/lib/habilitacion/guard";
import {
  ESTADOS_SERVICIO,
  MODALIDADES,
  TELEMEDICINA_CATEGORIAS,
  TELEMEDICINA_ROLES,
  USOS_EDIFICACION,
} from "@/lib/habilitacion/constantes";
import {
  aContextoServicio,
  contarCriteriosContexto,
  servicioEntraAlMotor,
} from "@/lib/habilitacion/consultas";
import {
  SERVICIO_SEDE_SELECT,
  type DetalleServicioInput,
  type PreviewCriterios,
  type ServicioSede,
} from "@/lib/habilitacion/tipos";
import {
  insertarServicioHabilitado,
  mensajeErrorServicio,
} from "@/lib/clinicas/servicios-habilitados-db";

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function revalidar() {
  revalidatePath("/habilitacion", "layout");
  revalidatePath("/parametros");
}

// ============================================================
// Edificación de la sede (HU-2.1) — RPC fn_hab_actualizar_edificacion_sede
// ============================================================
export async function actualizarEdificacionSede(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const sedeId = String(formData.get("sedeId") ?? "");
  if (!sedeId) return { error: "Sede inválida." };

  const uso = valorOpcionalSelect(formData, "usoEdificacion");
  if (uso && !USOS_EDIFICACION.some((u) => u.value === uso)) return { error: "Tipo de edificación inválido." };

  // "Solo sé el año" → se guarda el 1 de enero con la marca de aproximada
  // (las reglas cortan en 2-dic-1996 y mayo-2005, por eso la columna es date).
  const modo = String(formData.get("modoFecha") ?? "exacta");
  let fecha: string | null = null;
  let aproximada = false;
  if (modo === "anio") {
    const anio = campoOpcional(formData, "anioConstruccion");
    if (anio) {
      const n = Number(anio);
      const actual = new Date().getFullYear();
      if (!/^\d{4}$/.test(anio) || n < 1800 || n > actual) {
        return { error: `Escribe un año entre 1800 y ${actual}.` };
      }
      fecha = `${anio}-01-01`;
      aproximada = true;
    }
  } else {
    fecha = campoOpcional(formData, "fechaConstruccion");
    if (fecha && !FECHA_ISO.test(fecha)) return { error: "La fecha de construcción no es válida." };
  }

  const codigoReps = (campoOpcional(formData, "codigoSedeReps") ?? "").slice(0, 50);

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_hab_actualizar_edificacion_sede", {
    p_sede_id: sedeId,
    p_uso: uso,
    p_fecha: fecha,
    p_aproximada: aproximada,
    p_codigo_reps: codigoReps || null,
  });
  if (error) {
    console.error("[habilitacion] actualizarEdificacionSede", error);
    return { error: error.code === "P0001" ? error.message : "No se pudieron guardar los datos de la edificación." };
  }

  revalidar();
  return null;
}

// ============================================================
// Servicio por sede (HU-2.2)
// ============================================================
type DetalleCompleto = DetalleServicioInput & {
  estado: string;
  fechaHabilitacion: string | null;
  fechaCierreTemporal: string | null;
};

function incluidos(valores: string[], vocabulario: readonly { value: string }[]) {
  return valores.every((v) => vocabulario.some((o) => o.value === v));
}

// Forma del detalle (no su legalidad frente a la norma, que es del trigger).
function validarDetalle(d: DetalleCompleto): string | null {
  if (!Array.isArray(d.modalidades) || !incluidos(d.modalidades, MODALIDADES)) return "Modalidad inválida.";
  if (!incluidos(d.telemedicinaCategorias, TELEMEDICINA_CATEGORIAS)) return "Categoría de telemedicina inválida.";
  if (!incluidos(d.telemedicinaRoles, TELEMEDICINA_ROLES)) return "Rol de telemedicina inválido.";
  if (!ESTADOS_SERVICIO.some((e) => e.value === d.estado)) return "Estado inválido.";
  if (d.servicioNormaId && d.modalidades.length === 0) return "Marca al menos una modalidad en la que prestas el servicio.";
  const conTelemedicina = d.modalidades.includes("telemedicina");
  if (conTelemedicina && (d.telemedicinaCategorias.length === 0 || d.telemedicinaRoles.length === 0)) {
    return "Con telemedicina, marca al menos una categoría y tu rol (remisor o de referencia).";
  }
  if (!conTelemedicina && (d.telemedicinaCategorias.length > 0 || d.telemedicinaRoles.length > 0)) {
    return "Las categorías y roles de telemedicina solo aplican si marcas la modalidad Telemedicina.";
  }
  for (const f of [d.fechaHabilitacion, d.fechaCierreTemporal]) {
    if (f && !FECHA_ISO.test(f)) return "Alguna de las fechas no es válida.";
  }
  if (d.estado === "cierre_temporal" && !d.fechaCierreTemporal) return "Escribe la fecha del cierre temporal.";
  return null;
}

function camposDetalle(d: DetalleCompleto) {
  const conTelemedicina = d.modalidades.includes("telemedicina");
  return {
    servicioNormaId: d.servicioNormaId || null,
    complejidad: d.complejidad || null,
    modalidades: d.modalidades,
    telemedicinaCategorias: conTelemedicina ? d.telemedicinaCategorias : [],
    telemedicinaRoles: conTelemedicina ? d.telemedicinaRoles : [],
    estado: d.estado,
    fechaHabilitacion: d.estado === "habilitado" ? d.fechaHabilitacion : null,
    fechaCierreTemporal: d.estado === "cierre_temporal" ? d.fechaCierreTemporal : null,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Prácticas con varios numerales (Obstetricia, SPA, Quemados, Trasplantes):
// el trigger acepta el numeral en null ("falta elegir"), pero desde
// Habilitación se exige elegirlo al declarar — es el dato que decide qué
// criterios aplican.
async function requiereElegirNumeral(supabase: Supabase, practicaId: string) {
  const { count } = await supabase
    .from("hab_mapeo_practica_servicio")
    .select("servicio_norma_id", { count: "exact", head: true })
    .eq("practica_medica_id", practicaId)
    .eq("requiere_eleccion", true);
  return (count ?? 0) > 1;
}

export async function declararServicioSede(
  input: DetalleCompleto & { sedeId: string; practicaMedicaId: string; codigoHabilitacion: string | null },
): Promise<{ error?: string }> {
  if (!input.sedeId) return { error: "Elige la sede." };
  if (!input.practicaMedicaId) return { error: "Elige el servicio que prestas." };
  const invalido = validarDetalle(input);
  if (invalido) return { error: invalido };

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  if (!input.servicioNormaId && (await requiereElegirNumeral(supabase, input.practicaMedicaId))) {
    return { error: "Este servicio corresponde a varios numerales de la norma: elige cuál o cuáles prestas." };
  }

  const { error } = await insertarServicioHabilitado(
    supabase,
    check.usuario,
    {
      practicaMedicaId: input.practicaMedicaId,
      sedeId: input.sedeId,
      codigoHabilitacion: input.codigoHabilitacion ? input.codigoHabilitacion.slice(0, 50) : null,
      ...camposDetalle(input),
    },
    "id",
  );
  if (error) return { error: mensajeErrorServicio(error, "No se pudo declarar el servicio.") };

  revalidar();
  return {};
}

export async function guardarDetalleServicio(input: DetalleCompleto & { id: string }): Promise<{ error?: string }> {
  if (!input.id) return { error: "Servicio inválido." };
  const invalido = validarDetalle(input);
  if (invalido) return { error: invalido };

  const check = await requireHabilitacion("EDIT", { gestion: true });
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: fila } = await supabase
    .from("clinica_servicios_habilitados")
    .select("id, practica_medica_id")
    .eq("id", input.id)
    .eq("clinica_id", check.usuario.clinica_id)
    .maybeSingle();
  if (!fila) return { error: "El servicio no existe o no pertenece a tu clínica." };
  if (!input.servicioNormaId && (await requiereElegirNumeral(supabase, fila.practica_medica_id))) {
    return { error: "Este servicio corresponde a varios numerales de la norma: elige cuál prestas." };
  }

  const c = camposDetalle(input);
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .update({
      servicio_norma_id: c.servicioNormaId,
      complejidad: c.complejidad,
      modalidades: c.modalidades,
      telemedicina_categorias: c.telemedicinaCategorias,
      telemedicina_roles: c.telemedicinaRoles,
      estado: c.estado,
      fecha_habilitacion: c.fechaHabilitacion,
      fecha_cierre_temporal: c.fechaCierreTemporal,
      updated_by: check.usuario.id,
    })
    .eq("id", input.id)
    .eq("clinica_id", check.usuario.clinica_id);
  if (error) return { error: mensajeErrorServicio(error, "No se pudo guardar el servicio.") };

  revalidar();
  return {};
}

// ============================================================
// Preview "Este servicio te agrega N criterios" (HU-2.2 AC2)
// ============================================================
// Llama el MISMO núcleo del motor (fn_hab_resolver_criterios, 0065) con el
// contexto de la sede sin y con el servicio: la diferencia es lo que agrega.
// El contexto se arma en el servidor desde la BD; del cliente solo llega el
// servicio candidato (y es lectura: no hay nada que falsificar).
export async function previsualizarCriterios(input: {
  sedeId: string;
  servicioId: string | null;
  detalle: DetalleServicioInput;
}): Promise<PreviewCriterios> {
  const vacio: PreviewCriterios = { motorDisponible: true, agrega: null, totalSede: null, totalSedeEvaluables: null };
  if (!input.sedeId) return { ...vacio, error: "Sede inválida." };

  const check = await requireHabilitacion("VIEW", { gestion: true });
  if (!check.ok) return { ...vacio, error: check.error };

  const supabase = await createClient();
  const [{ data: sede }, { data: filas }] = await Promise.all([
    supabase.from("sedes").select("id, uso_edificacion").eq("id", input.sedeId).maybeSingle(),
    supabase.from("clinica_servicios_habilitados").select(SERVICIO_SEDE_SELECT).eq("sede_id", input.sedeId),
  ]);
  if (!sede) return { ...vacio, error: "La sede no existe." };

  const otros = ((filas ?? []) as unknown as ServicioSede[])
    .filter((f) => f.id !== input.servicioId && servicioEntraAlMotor(f))
    .map(aContextoServicio)
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const candidato = aContextoServicio(input.detalle);

  const sin = await contarCriteriosContexto(supabase, { uso_edificacion: sede.uso_edificacion, servicios: otros });
  if (!sin.motorDisponible) return { ...vacio, motorDisponible: false };
  if (!candidato) {
    return { ...vacio, agrega: null, totalSede: sin.total, totalSedeEvaluables: sin.evaluables };
  }
  const con = await contarCriteriosContexto(supabase, {
    uso_edificacion: sede.uso_edificacion,
    servicios: [...otros, candidato],
  });
  if (!con.motorDisponible) return { ...vacio, motorDisponible: false };
  if (con.total === null || sin.total === null) {
    return { ...vacio, error: "No se pudo calcular el número de criterios en este momento." };
  }
  return {
    motorDisponible: true,
    agrega: con.total - sin.total,
    totalSede: con.total,
    totalSedeEvaluables: con.evaluables,
  };
}
