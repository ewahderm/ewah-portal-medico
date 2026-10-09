// Lee de la base lo que el asistente de configuración necesita saber (solo
// conteos y unos pocos campos) y arma la lista por módulo. Usa la sesión
// del usuario: las políticas de cada tabla siguen aplicando.

import { createClient } from "@/lib/supabase/server";
import { armarConfiguracion, type Hechos, type ModuloConfiguracion } from "@/lib/configuracion/lista";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function contar(supabase: Supabase, tabla: string, soloActivos = false): Promise<number> {
  const base = supabase.from(tabla).select("id", { count: "exact", head: true });
  const { count } = await (soloActivos ? base.eq("activo", true) : base);
  return count ?? 0;
}

const activos = (supabase: Supabase, tabla: string) => contar(supabase, tabla, true);

export async function leerConfiguracion(clinicaId: string): Promise<{ modulos: ModuloConfiguracion[]; activos: Set<string> }> {
  const supabase = await createClient();

  // Los módulos que la clínica tiene contratados y activos (igual criterio
  // que Parámetros): un módulo que no tiene no le pide nada.
  const { data: contratados } = await supabase.from("clinica_modulos").select("modulos(codigo)").eq("clinica_id", clinicaId).eq("activo", true);
  const modulosActivos = new Set<string>(
    ((contratados ?? []) as unknown as { modulos: { codigo: string } | null }[]).map((m) => m.modulos?.codigo).filter((c): c is string => Boolean(c)),
  );
  const tiene = (codigo: string) => modulosActivos.has(codigo);

  const anio = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric" }).format(new Date()));

  const [
    { data: clinica },
    sedes,
    consultorios,
    usuariosActivos,
    pacientes,
    tiposTratamiento,
    { count: tiposSinCups },
    { count: tiposSinServicio },
    mediosPago,
    serviciosHabilitados,
  ] = await Promise.all([
    supabase
      .from("clinicas")
      .select("nit, direccion, telefono, email, ciudad_id, nombre_comercial, logo_storage_path, correo_notificaciones, pais_operacion_id")
      .eq("id", clinicaId)
      .maybeSingle(),
    activos(supabase, "sedes"),
    activos(supabase, "consultorios"),
    activos(supabase, "usuarios"),
    contar(supabase, "pacientes"),
    activos(supabase, "tipos_tratamiento"),
    supabase.from("tipos_tratamiento").select("id", { count: "exact", head: true }).eq("activo", true).is("cups_id", null),
    supabase.from("tipos_tratamiento").select("id", { count: "exact", head: true }).eq("activo", true).is("practica_medica_id", null),
    activos(supabase, "medios_pago"),
    contar(supabase, "clinica_servicios_habilitados"),
  ]);

  const [insumos, proveedores, neveras, cargos, empleados, valoresLegales, finanzas, habilitacionPerfil, sstPerfil] = await Promise.all([
    tiene("inventario") ? activos(supabase, "insumos") : Promise.resolve(null),
    tiene("inventario") ? activos(supabase, "proveedores") : Promise.resolve(null),
    tiene("medio_ambiente") ? activos(supabase, "neveras") : Promise.resolve(null),
    tiene("rrhh") ? activos(supabase, "cargos") : Promise.resolve(null),
    tiene("rrhh") || tiene("medio_ambiente") ? activos(supabase, "empleados") : Promise.resolve(null),
    tiene("rrhh") && clinica?.pais_operacion_id
      ? supabase
          .from("valores_legales_pais")
          .select("id", { count: "exact", head: true })
          .eq("pais_id", clinica.pais_operacion_id)
          .eq("anio", anio)
          .then(({ count }) => (count ?? 0) > 0)
      : Promise.resolve(tiene("rrhh") ? false : null),
    tiene("finanzas") ? leerFinanzas(supabase) : Promise.resolve(null),
    tiene("habilitacion")
      ? supabase.from("hab_perfil_prestador").select("id", { count: "exact", head: true }).then(({ count }) => (count ?? 0) > 0)
      : Promise.resolve(null),
    tiene("sst")
      ? supabase
          .from("sst_perfil")
          .select("responsable_nombre")
          .maybeSingle()
          .then(({ data }) => ({ existe: Boolean(data), responsable: Boolean(data?.responsable_nombre?.trim()) }))
      : Promise.resolve(null),
  ]);

  const hechos: Hechos = {
    clinica: {
      nit: clinica?.nit ?? null,
      direccion: clinica?.direccion ?? null,
      telefono: clinica?.telefono ?? null,
      email: clinica?.email ?? null,
      ciudadId: clinica?.ciudad_id ?? null,
      nombreComercial: clinica?.nombre_comercial ?? null,
      logo: clinica?.logo_storage_path ?? null,
      correoNotificaciones: clinica?.correo_notificaciones ?? null,
    },
    sedes,
    consultorios,
    usuariosActivos,
    pacientes,
    tiposTratamiento,
    tiposSinCups: tiposSinCups ?? 0,
    tiposSinServicio: tiposSinServicio ?? 0,
    mediosPago,
    serviciosHabilitados,
    insumos,
    proveedores,
    neveras,
    cargos,
    empleados,
    valoresLegalesAnio: valoresLegales,
    finanzas,
    habilitacionPerfil,
    sstPerfil,
  };
  return { modulos: armarConfiguracion(hechos, modulosActivos), activos: modulosActivos };
}

async function leerFinanzas(supabase: Supabase): Promise<Hechos["finanzas"]> {
  const [{ data: config }, { data: medios }, { data: destinos }, { data: tarifas }] = await Promise.all([
    supabase.from("fin_config").select("fecha_inicio").maybeSingle(),
    supabase.from("medios_pago").select("id").eq("activo", true),
    supabase.from("fin_medios_pago").select("medio_pago_id, cuenta_id, es_credito, fin_cuentas(tipo)"),
    supabase.from("fin_tarifas_medio_pago").select("medio_pago_id"),
  ]);
  const filas = (destinos ?? []) as unknown as { medio_pago_id: string; cuenta_id: string | null; es_credito: boolean; fin_cuentas: { tipo: string } | null }[];
  const conDestino = new Set(filas.filter((d) => d.cuenta_id || d.es_credito).map((d) => d.medio_pago_id));
  const conTarifa = new Set(((tarifas ?? []) as { medio_pago_id: string }[]).map((t) => t.medio_pago_id));
  const activosIds = new Set(((medios ?? []) as { id: string }[]).map((m) => m.id));
  return {
    activado: Boolean(config),
    mediosSinDestino: [...activosIds].filter((id) => !conDestino.has(id)).length,
    pasarelasSinTarifa: filas.filter((d) => activosIds.has(d.medio_pago_id) && d.fin_cuentas?.tipo === "pasarela" && !conTarifa.has(d.medio_pago_id)).length,
  };
}
