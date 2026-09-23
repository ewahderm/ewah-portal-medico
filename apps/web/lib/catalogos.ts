import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getSedesActivas(supabase: Supabase) {
  const { data } = await supabase
    .from("sedes")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getMediosPagoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("medios_pago")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposTratamientoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_tratamiento")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposIdentificacionActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_identificacion")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getGenerosActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("generos")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getPaisesActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("paises")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getCanalesCaptacionActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("canales_captacion")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getCampanasActivas(supabase: Supabase) {
  const { data } = await supabase
    .from("campanas")
    .select("id, nombre")
    .eq("activo", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getEpsActivos(supabase: Supabase) {
  const { data } = await supabase.from("eps").select("id, nombre").eq("activo", true).order("orden");
  return data ?? [];
}
