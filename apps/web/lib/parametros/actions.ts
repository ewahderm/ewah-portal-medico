"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import { getCatalogo } from "./registry";
import type { ActionState } from "@/lib/auth/actions";

async function requirePermiso(permiso: "CREATE" | "EDIT" | "DELETE") {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tienePermiso } = await supabase.rpc("has_permission", {
    modulo_code: "parametros",
    permiso_code: permiso,
  });

  if (!tienePermiso) {
    return { ok: false as const, error: "No tienes permiso para esta acción." };
  }
  return { ok: true as const };
}

export async function crearValorCatalogo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tabla = String(formData.get("tabla") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim() || null;
  const nombre = String(formData.get("nombre") ?? "").trim();

  const catalogo = getCatalogo(tabla);
  if (!catalogo) return { error: "Catálogo inválido." };
  if (catalogo.esGlobal) return { error: "Este catálogo lo administra EWAH Tech." };
  if (!nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).insert({ codigo, nombre });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un valor con ese código." };
    return { error: "No se pudo crear el valor." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleValorCatalogo(tabla: string, id: string, activo: boolean) {
  const catalogo = getCatalogo(tabla);
  if (!catalogo) throw new Error("Catálogo inválido.");
  if (catalogo.esGlobal) throw new Error("Este catálogo lo administra EWAH Tech.");

  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el valor.");

  revalidatePath("/parametros");
}
