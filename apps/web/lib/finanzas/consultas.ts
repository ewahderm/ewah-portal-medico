// Lecturas del flujo de caja (sin "use server": las importan Server
// Components y otras funciones de servidor).

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { MODULO_FINANZAS, type Actividad, type Moneda, type TipoCuenta } from "@/lib/finanzas/constantes";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AccesoFinanzas = { puedeVer: boolean; puedeEditar: boolean; gestion: boolean };

export const getAccesoFinanzas = cache(async (): Promise<AccesoFinanzas> => {
  const supabase = await createClient();
  const [{ data: puedeVer }, { data: puedeEditar }, { data: gestion }] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: MODULO_FINANZAS, permiso_code: "VIEW" }),
    supabase.rpc("has_permission", { modulo_code: MODULO_FINANZAS, permiso_code: "EDIT" }),
    supabase.rpc("has_entitlement", { modulo_code: MODULO_FINANZAS, feature_code: "gestion" }),
  ]);
  return { puedeVer: !!puedeVer, puedeEditar: !!puedeEditar, gestion: !!gestion };
});

export type ConfigFinanzas = { fecha_inicio: string; updated_at: string };

// null = sin activar; undefined = la migración aún no está aplicada.
export async function getConfigFinanzas(supabase: Supabase): Promise<ConfigFinanzas | null | undefined> {
  const { data, error } = await supabase.from("fin_config").select("fecha_inicio, updated_at").maybeSingle();
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
  ultimos_digitos: string | null;
  saldo_inicial: number;
  activa: boolean;
  orden: number;
  es_disponible: boolean;
};

export async function getCuentas(supabase: Supabase): Promise<Cuenta[]> {
  const { data } = await supabase
    .from("fin_cuentas")
    .select("id, nombre, tipo, moneda, socio_id, sede_id, ultimos_digitos, saldo_inicial, activa, orden, es_disponible")
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
