"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { verificarAdminExport } from "@/lib/exportar/acceso";
import { leerFilasXlsx } from "@/lib/exportar/xlsx";
import { COLUMNAS_CATALOGO } from "./exportar";
import { getCatalogo } from "./registry";
import type { ActionState } from "@/lib/auth/actions";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso(permiso: "CREATE" | "EDIT" | "DELETE") {
  return requirePermisoBase("parametros", permiso);
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
  const { error } = await supabase
    .from(tabla)
    .insert({ codigo, nombre, clinica_id: check.usuario.clinica_id });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un valor con ese código." };
    return { error: "No se pudo crear el valor." };
  }

  revalidatePath("/parametros");
  return null;
}

export async function toggleValorCatalogo(tabla: string, id: string, activo: boolean): Promise<ResultadoAccion> {
  const catalogo = getCatalogo(tabla);
  if (!catalogo) return { error: "Catálogo inválido." };
  if (catalogo.esGlobal) return { error: "Este catálogo lo administra EWAH Tech." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).update({ activo }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el valor." };

  revalidatePath("/parametros");
  return {};
}

export type ImportarCatalogoResultado =
  | { error: string }
  | { importados: number; errores: { fila: number; motivo: string }[] };

// Exclusivo de Administrador (requireAdminExport, no requirePermiso) —
// mismo criterio que importarPacientes. Un solo importador sirve para los
// 5 catálogos no-globales del motor genérico (los globales los administra
// EWAH Tech, ver registry.ts) porque todos comparten la misma forma
// código+nombre.
export async function importarCatalogo(
  tabla: string,
  formData: FormData,
): Promise<ImportarCatalogoResultado> {
  const acceso = await verificarAdminExport();
  if (!acceso.ok) return { error: acceso.error };
  const usuario = acceso.usuario;

  const catalogo = getCatalogo(tabla);
  if (!catalogo) return { error: "Catálogo inválido." };
  if (catalogo.esGlobal) return { error: "Este catálogo lo administra EWAH Tech." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona un archivo .xlsx." };
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const filas = leerFilasXlsx(buffer, COLUMNAS_CATALOGO);
  if (filas.length === 0) {
    return { error: "El archivo no tiene filas para importar." };
  }

  const supabase = await createClient();
  const errores: { fila: number; motivo: string }[] = [];
  let importados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2;

    if (!fila.nombre) {
      errores.push({ fila: numeroFila, motivo: "El nombre es obligatorio." });
      continue;
    }

    const { error } = await supabase.from(tabla).insert({
      clinica_id: usuario.clinica_id,
      codigo: fila.codigo || null,
      nombre: fila.nombre,
    });

    if (error) {
      const motivo = error.code === "23505" ? "Ya existe un valor con ese código." : "No se pudo guardar esta fila.";
      errores.push({ fila: numeroFila, motivo });
      continue;
    }

    importados++;
  }

  revalidatePath("/parametros");
  return { importados, errores };
}
