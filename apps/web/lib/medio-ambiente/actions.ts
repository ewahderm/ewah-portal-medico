"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import { rangoPagina, esRangoFueraDeLimite } from "@/lib/pagination";
import { esTipoResiduoValido, esAreaLimpiezaValida, esJornadaValida } from "./constantes";

export type MedioAmbienteActionState = { error?: string } | null;

function requirePermiso(permiso: "VIEW" | "CREATE" | "EDIT") {
  return requirePermisoBase("medio_ambiente", permiso);
}

function numeroDesdeForm(formData: FormData, campo: string): number | null {
  const texto = String(formData.get(campo) ?? "").trim();
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isNaN(numero) ? null : numero;
}

// ============================================================
// 1. Temperatura y humedad de consultorios
// ============================================================
export async function crearTemperaturaConsultorio(
  _prevState: MedioAmbienteActionState,
  formData: FormData,
): Promise<MedioAmbienteActionState> {
  const consultorioId = String(formData.get("consultorioId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const hora = campoOpcional(formData, "hora");
  const jornada = String(formData.get("jornada") ?? "");
  const temperaturaCelsius = numeroDesdeForm(formData, "temperaturaCelsius");
  const humedadTexto = campoOpcional(formData, "humedadPorcentaje");
  const observaciones = campoOpcional(formData, "observaciones");

  if (!consultorioId || !fecha || !jornada || temperaturaCelsius === null) {
    return { error: "Consultorio, fecha, jornada y temperatura son obligatorios." };
  }
  if (!esJornadaValida(jornada)) {
    return { error: "Elige una jornada válida (AM o PM)." };
  }

  const humedadPorcentaje = humedadTexto ? Number(humedadTexto) : null;
  if (humedadTexto && (Number.isNaN(humedadPorcentaje) || (humedadPorcentaje ?? 0) < 0 || (humedadPorcentaje ?? 0) > 100)) {
    return { error: "La humedad debe ser un número entre 0 y 100." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("registros_temperatura_consultorio").insert({
    clinica_id: check.usuario.clinica_id,
    consultorio_id: consultorioId,
    fecha,
    hora,
    jornada,
    temperatura_celsius: temperaturaCelsius,
    humedad_porcentaje: humedadPorcentaje,
    observaciones,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo guardar el registro." };

  revalidatePath("/medio-ambiente");
  return null;
}

export async function listarTemperaturasConsultorio(filtros: {
  sedeId?: string;
  consultorioId?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}) {
  const supabase = await createClient();
  // El filtro por sede no es una columna propia (la tabla solo guarda
  // consultorio_id) — se filtra a través del join, por eso el embed necesita
  // "!inner" solo cuando ese filtro está activo (igual patrón que
  // listarMovimientos en inventario/actions.ts).
  const embedConsultorio = filtros.sedeId ? "consultorios!inner" : "consultorios";
  let query = supabase
    .from("registros_temperatura_consultorio")
    .select(
      `id, fecha, hora, jornada, temperatura_celsius, humedad_porcentaje, observaciones,
       ${embedConsultorio}(nombre, sede_id), creador:usuarios!registros_temperatura_consultorio_created_by_fkey(nombre)`,
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false, nullsFirst: false });

  if (filtros.sedeId) query = query.eq("consultorios.sede_id", filtros.sedeId);
  if (filtros.consultorioId) query = query.eq("consultorio_id", filtros.consultorioId);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarTemperaturasConsultorio({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}

// ============================================================
// 2. Temperatura de neveras (cadena de frío)
// ============================================================
export async function crearTemperaturaNevera(
  _prevState: MedioAmbienteActionState,
  formData: FormData,
): Promise<MedioAmbienteActionState> {
  const sedeId = String(formData.get("sedeId") ?? "");
  const neveraId = String(formData.get("neveraId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const hora = campoOpcional(formData, "hora");
  const jornada = String(formData.get("jornada") ?? "");
  const temperaturaCelsius = numeroDesdeForm(formData, "temperaturaCelsius");
  const observaciones = campoOpcional(formData, "observaciones");

  if (!sedeId || !neveraId || !fecha || !jornada || temperaturaCelsius === null) {
    return { error: "Sede, nevera, fecha, jornada y temperatura son obligatorios." };
  }
  if (!esJornadaValida(jornada)) {
    return { error: "Elige una jornada válida (AM o PM)." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("registros_temperatura_nevera").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: sedeId,
    nevera_id: neveraId,
    fecha,
    hora,
    jornada,
    temperatura_celsius: temperaturaCelsius,
    observaciones,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo guardar el registro." };

  revalidatePath("/medio-ambiente");
  return null;
}

export async function listarTemperaturasNevera(filtros: {
  sedeId?: string;
  neveraId?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("registros_temperatura_nevera")
    .select(
      `id, fecha, hora, jornada, temperatura_celsius, observaciones,
       sedes(nombre), neveras(nombre), creador:usuarios!registros_temperatura_nevera_created_by_fkey(nombre)`,
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false, nullsFirst: false });

  if (filtros.sedeId) query = query.eq("sede_id", filtros.sedeId);
  if (filtros.neveraId) query = query.eq("nevera_id", filtros.neveraId);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarTemperaturasNevera({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}

// ============================================================
// 3. Peso de residuos por categoría
// ============================================================
export async function crearResiduo(
  _prevState: MedioAmbienteActionState,
  formData: FormData,
): Promise<MedioAmbienteActionState> {
  const sedeId = String(formData.get("sedeId") ?? "");
  const tipoResiduo = String(formData.get("tipoResiduo") ?? "");
  const pesoKg = numeroDesdeForm(formData, "pesoKg");
  const fecha = String(formData.get("fecha") ?? "");
  const hora = campoOpcional(formData, "hora");
  const jornada = String(formData.get("jornada") ?? "");
  const empleadoId = valorOpcionalSelect(formData, "empleadoId");
  const observaciones = campoOpcional(formData, "observaciones");

  if (!sedeId || !tipoResiduo || !fecha || !jornada || pesoKg === null) {
    return { error: "Sede, tipo de residuo, fecha, jornada y peso son obligatorios." };
  }
  if (!esTipoResiduoValido(tipoResiduo)) {
    return { error: "Elige un tipo de residuo válido." };
  }
  if (!esJornadaValida(jornada)) {
    return { error: "Elige una jornada válida (AM o PM)." };
  }
  if (pesoKg <= 0) {
    return { error: "El peso debe ser mayor que cero." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("registros_residuos").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: sedeId,
    tipo_residuo: tipoResiduo,
    peso_kg: pesoKg,
    fecha,
    hora,
    jornada,
    empleado_id: empleadoId,
    observaciones,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo guardar el registro." };

  revalidatePath("/medio-ambiente");
  return null;
}

export async function listarResiduos(filtros: {
  sedeId?: string;
  tipoResiduo?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("registros_residuos")
    .select(
      `id, fecha, hora, jornada, tipo_residuo, peso_kg, observaciones,
       sedes(nombre), empleados(nombre), creador:usuarios!registros_residuos_created_by_fkey(nombre)`,
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false, nullsFirst: false });

  if (filtros.sedeId) query = query.eq("sede_id", filtros.sedeId);
  if (filtros.tipoResiduo) query = query.eq("tipo_residuo", filtros.tipoResiduo);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarResiduos({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}

// ============================================================
// 4. Extintores (catálogo de activos físicos — sí editable)
// ============================================================
function datosExtintorDesdeForm(formData: FormData) {
  return {
    sedeId: String(formData.get("sedeId") ?? ""),
    tipoExtintorId: String(formData.get("tipoExtintorId") ?? ""),
    ubicacion: String(formData.get("ubicacion") ?? "").trim(),
    numeroSerie: campoOpcional(formData, "numeroSerie"),
    capacidad: campoOpcional(formData, "capacidad"),
    fechaAdquisicion: campoOpcional(formData, "fechaAdquisicion"),
    fechaUltimaRecarga: campoOpcional(formData, "fechaUltimaRecarga"),
    fechaVencimiento: campoOpcional(formData, "fechaVencimiento"),
    observaciones: campoOpcional(formData, "observaciones"),
  };
}

function validarDatosExtintor(datos: ReturnType<typeof datosExtintorDesdeForm>) {
  if (!datos.sedeId || !datos.tipoExtintorId || !datos.ubicacion || !datos.fechaVencimiento) {
    return "Sede, tipo, ubicación y fecha de vencimiento son obligatorios.";
  }
  return null;
}

export async function crearExtintor(
  _prevState: MedioAmbienteActionState,
  formData: FormData,
): Promise<MedioAmbienteActionState> {
  const datos = datosExtintorDesdeForm(formData);
  const errorValidacion = validarDatosExtintor(datos);
  if (errorValidacion) return { error: errorValidacion };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("extintores").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: datos.sedeId,
    tipo_extintor_id: datos.tipoExtintorId,
    ubicacion: datos.ubicacion,
    numero_serie: datos.numeroSerie,
    capacidad: datos.capacidad,
    fecha_adquisicion: datos.fechaAdquisicion,
    fecha_ultima_recarga: datos.fechaUltimaRecarga,
    fecha_vencimiento: datos.fechaVencimiento,
    observaciones: datos.observaciones,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo crear el extintor." };

  revalidatePath("/medio-ambiente");
  return null;
}

export async function editarExtintor(
  _prevState: MedioAmbienteActionState,
  formData: FormData,
): Promise<MedioAmbienteActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Extintor inválido." };

  const datos = datosExtintorDesdeForm(formData);
  const errorValidacion = validarDatosExtintor(datos);
  if (errorValidacion) return { error: errorValidacion };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("extintores")
    .update({
      sede_id: datos.sedeId,
      tipo_extintor_id: datos.tipoExtintorId,
      ubicacion: datos.ubicacion,
      numero_serie: datos.numeroSerie,
      capacidad: datos.capacidad,
      fecha_adquisicion: datos.fechaAdquisicion,
      fecha_ultima_recarga: datos.fechaUltimaRecarga,
      fecha_vencimiento: datos.fechaVencimiento,
      observaciones: datos.observaciones,
    })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el extintor." };

  revalidatePath("/medio-ambiente");
  return null;
}

// "Dar de baja" un extintor es desactivarlo (activo=false), no una
// anulación con motivo — es un activo físico que puede volver a ponerse en
// servicio (reactivar) si se recupera. fn_auditoria() registra cada cambio.
export async function toggleExtintor(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("extintores").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el extintor.");

  revalidatePath("/medio-ambiente");
}

export async function listarExtintores(filtros: {
  sedeId?: string;
  tipoExtintorId?: string;
  incluirInactivos?: boolean;
  pagina?: number;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("extintores")
    .select(
      `id, sede_id, tipo_extintor_id, ubicacion, numero_serie, capacidad,
       fecha_adquisicion, fecha_ultima_recarga, fecha_vencimiento, observaciones, activo,
       sedes(nombre), tipos_extintor(nombre)`,
      { count: "exact" },
    )
    .order("fecha_vencimiento", { ascending: true });

  if (filtros.sedeId) query = query.eq("sede_id", filtros.sedeId);
  if (filtros.tipoExtintorId) query = query.eq("tipo_extintor_id", filtros.tipoExtintorId);
  if (!filtros.incluirInactivos) query = query.eq("activo", true);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarExtintores({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}

// ============================================================
// 5. Limpieza de consultorios y baños
// ============================================================
export async function crearLimpieza(
  _prevState: MedioAmbienteActionState,
  formData: FormData,
): Promise<MedioAmbienteActionState> {
  const sedeId = String(formData.get("sedeId") ?? "");
  const areaTipo = String(formData.get("areaTipo") ?? "");
  const consultorioId = campoOpcional(formData, "consultorioId");
  const areaNombre = campoOpcional(formData, "areaNombre");
  const fecha = String(formData.get("fecha") ?? "");
  const hora = campoOpcional(formData, "hora");
  const jornada = String(formData.get("jornada") ?? "");
  const empleadoId = valorOpcionalSelect(formData, "empleadoId");
  const observaciones = campoOpcional(formData, "observaciones");

  if (!sedeId || !areaTipo || !fecha || !jornada) {
    return { error: "Sede, área, fecha y jornada son obligatorios." };
  }
  if (!esAreaLimpiezaValida(areaTipo)) {
    return { error: "Elige un tipo de área válido." };
  }
  if (!esJornadaValida(jornada)) {
    return { error: "Elige una jornada válida (AM o PM)." };
  }
  if (areaTipo === "consultorio" && !consultorioId) {
    return { error: "Elige el consultorio que se limpió." };
  }
  if (areaTipo === "bano" && !areaNombre) {
    return { error: "Describe cuál baño se limpió." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("registros_limpieza").insert({
    clinica_id: check.usuario.clinica_id,
    sede_id: sedeId,
    area_tipo: areaTipo,
    consultorio_id: areaTipo === "consultorio" ? consultorioId : null,
    area_nombre: areaTipo === "bano" ? areaNombre : null,
    fecha,
    hora,
    jornada,
    empleado_id: empleadoId,
    observaciones,
    // El responsable de DIGITALIZAR el registro es siempre quien está en
    // sesión — nunca un valor que venga del formulario. empleado_id (quien
    // limpió físicamente) es un dato aparte, seleccionable, porque esa
    // persona no tiene acceso al sistema.
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo guardar el registro." };

  revalidatePath("/medio-ambiente");
  return null;
}

export async function listarLimpiezas(filtros: {
  sedeId?: string;
  areaTipo?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("registros_limpieza")
    .select(
      `id, fecha, hora, jornada, area_tipo, area_nombre, observaciones,
       sedes(nombre), consultorios(nombre), empleados(nombre),
       creador:usuarios!registros_limpieza_created_by_fkey(nombre)`,
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false, nullsFirst: false });

  if (filtros.sedeId) query = query.eq("sede_id", filtros.sedeId);
  if (filtros.areaTipo) query = query.eq("area_tipo", filtros.areaTipo);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarLimpiezas({ ...filtros, pagina: 1 });
  }

  return { registros: data ?? [], total: count ?? 0, pagina: paginaPedida };
}
