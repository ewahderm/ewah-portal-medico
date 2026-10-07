"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { getCurrentUsuario } from "@/lib/auth/session";
import { normalizarBusqueda } from "@/lib/texto";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso(permiso: "EDIT") {
  return requirePermisoBase("parametros", permiso);
}

export type CupsResultado = {
  id: string;
  codigo: string;
  descripcion: string;
  capitulo: string | null;
  activoClinica: boolean;
};

// ~10,000 códigos — nunca se cargan todos de una, se busca por código o
// descripción (ILIKE) y se limita a 50 resultados. Sin texto de búsqueda,
// muestra los ya activados por la clínica (lo que el usuario realmente
// quiere ver primero al entrar a la pestaña).
export async function buscarCups(query: string): Promise<CupsResultado[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return [];

  const supabase = await createClient();
  const texto = query.trim();

  if (!texto) {
    const { data } = await supabase
      .from("clinica_cups")
      .select("cups(id, codigo, descripcion, capitulo)")
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data ?? []) as unknown as { cups: { id: string; codigo: string; descripcion: string; capitulo: string | null } | null }[])
      .map((f) => f.cups)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ ...c, activoClinica: true }));
  }

  const [{ data: resultados }, { data: activos }] = await Promise.all([
    supabase
      .from("cups")
      .select("id, codigo, descripcion, capitulo")
      .ilike("busqueda", `%${normalizarBusqueda(texto)}%`)
      .eq("activo", true)
      .order("codigo")
      .limit(50),
    supabase.from("clinica_cups").select("cups_id"),
  ]);

  const activosSet = new Set((activos ?? []).map((a) => a.cups_id));
  return (resultados ?? []).map((r) => ({ ...r, activoClinica: activosSet.has(r.id) }));
}

export async function activarCups(cupsId: string): Promise<ResultadoAccion> {
  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_cups")
    .insert({ clinica_id: check.usuario.clinica_id, cups_id: cupsId, created_by: check.usuario.id });
  if (error && error.code !== "23505") return { error: "No se pudo activar el CUPS." };

  revalidatePath("/parametros");
  return {};
}

export async function desactivarCups(cupsId: string): Promise<ResultadoAccion> {
  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_cups")
    .delete()
    .eq("clinica_id", check.usuario.clinica_id)
    .eq("cups_id", cupsId);
  if (error) return { error: "No se pudo desactivar el CUPS." };

  revalidatePath("/parametros");
  return {};
}
