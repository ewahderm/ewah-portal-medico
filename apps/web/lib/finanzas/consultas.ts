// Lecturas del flujo de caja (sin "use server": las importan Server
// Components y otras funciones de servidor).

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { MODULO_FINANZAS, type Actividad, type Moneda, type TipoCuenta } from "@/lib/finanzas/constantes";
import type { IngresoPendiente } from "@/lib/finanzas/tratamientos";
import type { PendientePasarela, Tarifa } from "@/lib/finanzas/tarifas";
import type { SaldoSocio } from "@/lib/finanzas/socios";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccesoFinanzas = { puedeVer: boolean; puedeEditar: boolean; puedeCrear: boolean; puedeAnular: boolean; gestion: boolean };

export const getAccesoFinanzas = cache(async (): Promise<AccesoFinanzas> => {
  const supabase = await createClient();
  const permiso = (permiso_code: string) => supabase.rpc("has_permission", { modulo_code: MODULO_FINANZAS, permiso_code });
  const [{ data: puedeVer }, { data: puedeEditar }, { data: puedeCrear }, { data: puedeAnular }, { data: gestion }] = await Promise.all([
    permiso("VIEW"),
    permiso("EDIT"),
    permiso("CREATE"),
    permiso("VOID"),
    supabase.rpc("has_entitlement", { modulo_code: MODULO_FINANZAS, feature_code: "gestion" }),
  ]);
  return { puedeVer: !!puedeVer, puedeEditar: !!puedeEditar, puedeCrear: !!puedeCrear, puedeAnular: !!puedeAnular, gestion: !!gestion };
});

export type CambioFechaInicio = { anterior: string; nueva: string; motivo: string; en: string };
export type ConfigFinanzas = { fecha_inicio: string; updated_at: string; historial: CambioFechaInicio[] };

// null = sin activar; undefined = la migración aún no está aplicada.
export async function getConfigFinanzas(supabase: Supabase): Promise<ConfigFinanzas | null | undefined> {
  const { data, error } = await supabase.from("fin_config").select("fecha_inicio, updated_at, historial").maybeSingle();
  if (error) {
    console.error("[finanzas] getConfigFinanzas", error);
    return undefined;
  }
  return data as ConfigFinanzas | null;
}

export type Cuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  socio_id: string | null;
  sede_id: string | null;
  banco_id: string | null;
  ultimos_digitos: string | null;
  saldo_inicial: number;
  activa: boolean;
  orden: number;
  es_disponible: boolean;
};

export async function getCuentas(supabase: Supabase): Promise<Cuenta[]> {
  const { data } = await supabase
    .from("fin_cuentas")
    .select("id, nombre, tipo, moneda, socio_id, sede_id, banco_id, ultimos_digitos, saldo_inicial, activa, orden, es_disponible")
    .order("activa", { ascending: false })
    .order("orden")
    .order("nombre");
  return ((data ?? []) as Cuenta[]).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) }));
}

export type Socio = {
  id: string;
  nombre: string;
  numero_identificacion: string;
  tipo_identificacion_id: string | null;
  porcentaje_participacion: number | null;
  empleado_id: string | null;
  activo: boolean;
};

export async function getSocios(supabase: Supabase): Promise<Socio[]> {
  const { data } = await supabase
    .from("fin_socios")
    .select("id, nombre, numero_identificacion, tipo_identificacion_id, porcentaje_participacion, empleado_id, activo")
    .order("activo", { ascending: false })
    .order("nombre");
  return ((data ?? []) as Socio[]).map((s) => ({
    ...s,
    porcentaje_participacion: s.porcentaje_participacion === null ? null : Number(s.porcentaje_participacion),
  }));
}

export type Categoria = {
  codigo: string;
  personalizacion_id: string | null;
  nombre: string;
  nombre_original: string | null;
  tipo: "ingreso" | "egreso" | "transferencia" | "ambos";
  actividad: Actividad;
  comportamiento: string;
  automatica: boolean;
  activa: boolean;
  icono: string;
  ayuda: string;
  orden: number;
  propia: boolean;
};

export async function getCategorias(supabase: Supabase): Promise<Categoria[]> {
  const { data } = await supabase
    .from("v_fin_categorias")
    .select("codigo, personalizacion_id, nombre, nombre_original, tipo, actividad, comportamiento, automatica, activa, icono, ayuda, orden, propia")
    .order("orden")
    .order("nombre");
  return (data ?? []) as Categoria[];
}

export async function getTiposIdentificacion(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.from("tipos_identificacion").select("id, nombre").eq("activo", true).order("orden");
  return data ?? [];
}

// Empleados activos (id y nombre) sin exigir permiso de RRHH, para enlazar
// un socio con su ficha.
export async function getEmpleadosPicker(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.rpc("fn_empleados_picker");
  return (data ?? []) as { id: string; nombre: string }[];
}

export async function getSedesFinanzas(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden");
  return (data ?? []) as { id: string; nombre: string }[];
}

// Bancos del país de operación de la clínica (catálogo de RRHH).
export async function getBancos(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data: clinica } = await supabase.from("clinicas").select("pais_operacion_id").maybeSingle();
  if (!clinica?.pais_operacion_id) return [];
  const { data } = await supabase.from("bancos").select("id, nombre").eq("pais_id", clinica.pais_operacion_id).eq("activo", true).order("orden").order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

// ---------- FC2: movimientos y saldos ----------

export async function getSaldos(supabase: Supabase, fecha?: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("fn_fin_saldos", fecha ? { p_fecha: fecha } : {});
  if (error) console.error("[finanzas] fn_fin_saldos", error);
  return new Map(((data ?? []) as { cuenta_id: string; saldo: number }[]).map((s) => [s.cuenta_id, Number(s.saldo)]));
}

export type Movimiento = {
  id: string;
  fecha: string;
  tipo: "ingreso" | "egreso" | "transferencia";
  categoria_codigo: string | null;
  categoria_propia_id: string | null;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  sede_id: string | null;
  tercero_tipo: string | null;
  proveedor_id: string | null;
  socio_id: string | null;
  tercero_nombre: string | null;
  moneda: Moneda;
  monto_original: number;
  tasa_cop: number;
  valor_cop: number;
  monto_destino: number | null;
  descripcion: string | null;
  estado: "registrado" | "pendiente_abono" | "por_cobrar" | "anulado";
  origen: string;
  anula_a: string | null;
  anulado_motivo: string | null;
  soporte_nombre_archivo: string | null;
  created_at: string;
};

const MOV_SELECT =
  "id, fecha, tipo, categoria_codigo, categoria_propia_id, cuenta_id, cuenta_destino_id, sede_id, tercero_tipo, proveedor_id, socio_id, tercero_nombre, moneda, monto_original, tasa_cop, valor_cop, monto_destino, descripcion, estado, origen, anula_a, anulado_motivo, soporte_nombre_archivo, created_at";

const numeros = (m: Movimiento): Movimiento => ({
  ...m,
  monto_original: Number(m.monto_original),
  tasa_cop: Number(m.tasa_cop),
  valor_cop: Number(m.valor_cop),
  monto_destino: m.monto_destino === null ? null : Number(m.monto_destino),
});

export type FiltrosMovimientos = { desde: string; hasta: string; tipo?: string; cuentaId?: string; categoria?: string };

export async function getMovimientos(supabase: Supabase, f: FiltrosMovimientos, limite = 500): Promise<Movimiento[]> {
  let q = supabase.from("fin_movimientos").select(MOV_SELECT).gte("fecha", f.desde).lte("fecha", f.hasta);
  if (f.tipo === "ingreso" || f.tipo === "egreso" || f.tipo === "transferencia") q = q.eq("tipo", f.tipo);
  // Los filtros vienen de la URL: solo uuids y códigos válidos llegan al
  // filtro `or` de PostgREST (que se arma como texto).
  if (f.cuentaId && UUID.test(f.cuentaId)) q = q.or(`cuenta_id.eq.${f.cuentaId},cuenta_destino_id.eq.${f.cuentaId}`);
  if (f.categoria?.startsWith("PROPIA_") && UUID.test(f.categoria.slice(7))) q = q.eq("categoria_propia_id", f.categoria.slice(7));
  else if (f.categoria && /^[A-Z][A-Z0-9_]{2,40}$/.test(f.categoria)) q = q.eq("categoria_codigo", f.categoria);
  const { data } = await q.order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(limite);
  return ((data ?? []) as Movimiento[]).map(numeros);
}


export async function getProveedores(supabase: Supabase): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

// Todo lo que necesita el formulario de registrar un movimiento.
export async function getDatosRegistro(supabase: Supabase, acceso: AccesoFinanzas, config: ConfigFinanzas, hoy: string) {
  const [cuentas, saldos, categorias, socios, proveedores, sedes] = await Promise.all([
    getCuentas(supabase),
    getSaldos(supabase),
    getCategorias(supabase),
    getSocios(supabase),
    getProveedores(supabase),
    getSedesFinanzas(supabase),
  ]);
  return {
    hoy,
    fechaInicio: config.fecha_inicio,
    // Todas (las inactivas siguen nombrando su historia y contando su
    // saldo); los selectores muestran solo las activas.
    cuentas: cuentas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      moneda: c.moneda,
      saldo: saldos.get(c.id) ?? c.saldo_inicial,
      socio_id: c.socio_id,
      activa: c.activa,
    })),
    categorias,
    socios: socios.map((s) => ({ id: s.id, nombre: s.nombre, activo: s.activo })),
    proveedores,
    sedes,
    gestion: acceso.gestion,
  };
}

// ---------- FC3: ingresos desde tratamientos ----------

export type MedioPagoFinanzas = { id: string; nombre: string; activo: boolean; cuenta_id: string | null; es_credito: boolean };

// Medios de pago de la clínica (catálogo de Parámetros) con su destino en
// el flujo de caja. Los inactivos solo si ya tenían destino.
export async function getMediosPagoFinanzas(supabase: Supabase): Promise<MedioPagoFinanzas[]> {
  const [{ data: medios }, { data: config }] = await Promise.all([
    supabase.from("medios_pago").select("id, nombre, activo").order("orden").order("nombre"),
    supabase.from("fin_medios_pago").select("medio_pago_id, cuenta_id, es_credito"),
  ]);
  const porMedio = new Map(((config ?? []) as { medio_pago_id: string; cuenta_id: string | null; es_credito: boolean }[]).map((c) => [c.medio_pago_id, c]));
  return ((medios ?? []) as { id: string; nombre: string; activo: boolean }[])
    .map((m) => ({ ...m, cuenta_id: porMedio.get(m.id)?.cuenta_id ?? null, es_credito: porMedio.get(m.id)?.es_credito ?? false }))
    .filter((m) => m.activo || m.cuenta_id || m.es_credito);
}

// null si no se pudo consultar (no es lo mismo que "nada pendiente").
export async function getIngresosPendientes(supabase: Supabase): Promise<IngresoPendiente[] | null> {
  const { data, error } = await supabase.rpc("fn_fin_ingresos_pendientes");
  if (error) {
    console.error("[finanzas] fn_fin_ingresos_pendientes", error);
    return null;
  }
  return ((data ?? []) as IngresoPendiente[]).map((p) => ({ ...p, valor: p.valor === null ? null : Number(p.valor) }));
}

// ---------- FC4: tarifas y pasarela ----------

const aNumero = <T extends Record<string, unknown>>(fila: T, campos: (keyof T)[]): T => {
  const r = { ...fila };
  for (const c of campos) if (r[c] !== null && r[c] !== undefined) (r as Record<keyof T, unknown>)[c] = Number(r[c]);
  return r;
};

export async function getTarifas(supabase: Supabase): Promise<Tarifa[]> {
  const { data } = await supabase
    .from("fin_tarifas_medio_pago")
    .select("id, medio_pago_id, vigente_desde, porcentaje_comision, comision_incluye_iva, valor_fijo_comision, porcentaje_retefuente, porcentaje_reteica, porcentaje_reteiva, recargo_internacional, dias_habiles_abono")
    .order("vigente_desde", { ascending: false });
  return ((data ?? []) as Tarifa[]).map((t) =>
    aNumero(t, ["porcentaje_comision", "valor_fijo_comision", "porcentaje_retefuente", "porcentaje_reteica", "porcentaje_reteiva", "recargo_internacional"]),
  );
}

export async function getPendientesPasarela(supabase: Supabase): Promise<PendientePasarela[] | null> {
  const { data, error } = await supabase.rpc("fn_fin_pendientes_pasarela");
  if (error) {
    console.error("[finanzas] fn_fin_pendientes_pasarela", error);
    return null;
  }
  return ((data ?? []) as PendientePasarela[]).map((p) => aNumero(p, ["bruto", "comision", "retefuente", "reteica", "reteiva", "neto"]));
}

export type Liquidacion = {
  id: string;
  fecha: string;
  cuenta_pasarela_id: string;
  cuenta_banco_id: string;
  cobros: number;
  bruto: number;
  comision: number;
  retefuente: number;
  reteica: number;
  reteiva: number;
  neto_esperado: number;
  neto_real: number;
  diferencia: number;
  soporte_nombre_archivo: string | null;
  anulada: boolean;
  anulada_motivo: string | null;
};

export async function getLiquidaciones(supabase: Supabase, limite = 30): Promise<Liquidacion[]> {
  const { data } = await supabase
    .from("fin_liquidaciones_pasarela")
    .select("id, fecha, cuenta_pasarela_id, cuenta_banco_id, cobros, bruto, comision, retefuente, reteica, reteiva, neto_esperado, neto_real, diferencia, soporte_nombre_archivo, anulada, anulada_motivo")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  return ((data ?? []) as Liquidacion[]).map((l) =>
    aNumero(l, ["bruto", "comision", "retefuente", "reteica", "reteiva", "neto_esperado", "neto_real", "diferencia"]),
  );
}

// ---------- FC5: socios ----------

export async function getSaldosSocios(supabase: Supabase): Promise<Map<string, SaldoSocio>> {
  const { data, error } = await supabase.rpc("fn_fin_socios_saldos");
  if (error) console.error("[finanzas] fn_fin_socios_saldos", error);
  return new Map(
    ((data ?? []) as SaldoSocio[]).map((s) => [
      s.socio_id,
      {
        socio_id: s.socio_id,
        deuda_tarjeta: Number(s.deuda_tarjeta),
        prestado_por_socio: Number(s.prestado_por_socio),
        prestado_a_socio: Number(s.prestado_a_socio),
        aportes: Number(s.aportes),
        le_debemos: Number(s.le_debemos),
        nos_debe: Number(s.nos_debe),
      },
    ]),
  );
}

// Historial de un socio: sus movimientos y los de sus tarjetas.
export async function getMovimientosSocio(supabase: Supabase, socioId: string, tarjetas: string[], limite = 20): Promise<Movimiento[]> {
  if (!UUID.test(socioId) || tarjetas.some((t) => !UUID.test(t))) return [];
  const filtros = [`socio_id.eq.${socioId}`, ...tarjetas.flatMap((t) => [`cuenta_id.eq.${t}`, `cuenta_destino_id.eq.${t}`])];
  const { data } = await supabase
    .from("fin_movimientos")
    .select(MOV_SELECT)
    .or(filtros.join(","))
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  return ((data ?? []) as Movimiento[]).map(numeros);
}
