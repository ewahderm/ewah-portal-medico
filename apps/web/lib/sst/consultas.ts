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
