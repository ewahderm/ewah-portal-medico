"use server";

// Documentos del SG-SST (F4): versiones en documentos_normativos con tipos
// de la categoría `sgsst`. La BD (0074) asigna la versión, impide editar o
// borrar y exige que el archivo esté en la carpeta documentos/ de la
// clínica; aquí se verifica el archivo subido (tamaño y firma).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { esUuid, firmar, mensajeError, verificarArchivoSubido } from "@/lib/habilitacion/servidor";

type Resultado = { error?: string };

async function requireGestion(permiso: string) {
  const check = await requirePermiso("sst", permiso);
  if (!check.ok) return check;
  const plan = await requireEntitlement("sst", "gestion");
  if (!plan.ok) return { ok: false as const, error: "La gestión documental del SG-SST está disponible en el plan Pro." };
  return check;
}

// El archivo se sube a documentos/<tipoId>/ (subirArchivoSst con el id del tipo).
export async function registrarVersionSst(input: { tipoId: string; path: string; nombre: string }): Promise<Resultado> {
  if (!esUuid(input.tipoId)) return { error: "Documento inválido." };
  const check = await requireGestion("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: tipo } = await supabase.from("tipos_documento_normativo").select("id, categoria").eq("id", input.tipoId).maybeSingle();
  if (!tipo || tipo.categoria !== "sgsst") return { error: "Documento inválido." };

  const v = await verificarArchivoSubido(supabase, check.usuario.clinica_id, "documentos", input.tipoId, input.path, input.nombre, "sst");
  if ("error" in v) return { error: v.error };

  const { error } = await supabase.from("documentos_normativos").insert({
    clinica_id: check.usuario.clinica_id,
    tipo_documento_id: input.tipoId,
    // La versión la asigna la BD (fn_sst_version_siguiente); 0 es solo el marcador.
    version: 0,
    storage_path: v.path,
    nombre_archivo: v.nombre,
  });
  if (error) return { error: mensajeError("registrarVersionSst", error, "No se pudo guardar la versión.") };
  revalidatePath("/sst", "layout");
  return {};
}

// Las versiones cargadas antes desde RRHH están en el bucket de RRHH
// (carpeta normativos/); las de SG-SST, en `sst`.
export async function urlVersionSst(id: string): Promise<{ error?: string; url?: string }> {
  if (!esUuid(id)) return { error: "Documento inválido." };
  const check = await requirePermiso("sst", "VIEW");
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_normativos").select("storage_path, nombre_archivo").eq("id", id).maybeSingle();
  if (!data) return { error: "Documento inválido." };
  const deRrhh = data.storage_path.includes("/normativos/");
  const r = await firmar(supabase, data.storage_path, data.nombre_archivo, deRrhh ? "documentos-rrhh" : "sst");
  if (r.error && deRrhh) return { error: "Esta versión se cargó desde RRHH: ábrela desde RRHH o súbela de nuevo aquí." };
  return r;
}
