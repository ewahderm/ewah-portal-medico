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
