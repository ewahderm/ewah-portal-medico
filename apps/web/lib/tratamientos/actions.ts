"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/actions";

const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const TIPOS_FOTO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];

async function requirePermiso(permiso: "CREATE" | "VOID") {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tienePermiso } = await supabase.rpc("has_permission", {
    modulo_code: "tratamientos",
    permiso_code: permiso,
  });

  if (!tienePermiso) {
    return { ok: false as const, error: "No tienes permiso para esta acción." };
  }
  return { ok: true as const, usuario };
}

function campoOpcional(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor || null;
}

export async function crearTratamiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pacienteId = String(formData.get("pacienteId") ?? "");
  const tipoTratamientoId = String(formData.get("tipoTratamientoId") ?? "");
  const profesionalId = String(formData.get("profesionalId") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const costoTexto = campoOpcional(formData, "costo");
  const notas = campoOpcional(formData, "notas");
  const corrigeA = campoOpcional(formData, "corrigeA");

  if (!pacienteId || !tipoTratamientoId || !profesionalId || !fecha) {
    return { error: "Paciente, tipo de tratamiento, profesional y fecha son obligatorios." };
  }

  const costo = costoTexto ? Number(costoTexto) : null;
  if (costoTexto && (Number.isNaN(costo) || (costo ?? 0) < 0)) {
    return { error: "El costo debe ser un número válido." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("tratamientos").insert({
    clinica_id: check.usuario.clinica_id,
    paciente_id: pacienteId,
    tipo_tratamiento_id: tipoTratamientoId,
    profesional_id: profesionalId,
    fecha,
    costo,
    notas,
    corrige_a: corrigeA,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar el tratamiento." };

  revalidatePath("/tratamientos");
  return null;
}

export async function anularTratamiento(id: string, motivo: string) {
  if (!motivo.trim()) throw new Error("El motivo de anulación es obligatorio.");

  const check = await requirePermiso("VOID");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tratamientos")
    .update({
      anulado: true,
      anulado_motivo: motivo.trim(),
      anulado_por: check.usuario.id,
      anulado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error("No se pudo anular el tratamiento.");

  revalidatePath("/tratamientos");
}

export async function subirFotoTratamiento(
  tratamientoId: string,
  etiqueta: "antes" | "despues",
  formData: FormData,
) {
  const check = await requirePermiso("CREATE");
  if (!check.ok) throw new Error(check.error);

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    throw new Error("Selecciona una foto.");
  }
  if (foto.size > MAX_FOTO_BYTES) {
    throw new Error("La foto no puede pesar más de 8 MB.");
  }
  if (!TIPOS_FOTO_PERMITIDOS.includes(foto.type)) {
    throw new Error("Formato no soportado. Usa JPG, PNG o WEBP.");
  }

  const supabase = await createClient();
  const extension = foto.name.split(".").pop() ?? "jpg";
  const path = `${check.usuario.clinica_id}/${tratamientoId}/${etiqueta}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("tratamiento-fotos")
    .upload(path, foto, { contentType: foto.type });
  if (uploadError) throw new Error("No se pudo subir la foto.");

  const { error: insertError } = await supabase.from("tratamiento_fotos").insert({
    clinica_id: check.usuario.clinica_id,
    tratamiento_id: tratamientoId,
    storage_path: path,
    etiqueta,
    created_by: check.usuario.id,
  });
  if (insertError) throw new Error("No se pudo registrar la foto.");

  revalidatePath("/tratamientos");
}

export async function eliminarFotoTratamiento(id: string, storagePath: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");

  const supabase = await createClient();
  const { error: storageError } = await supabase.storage
    .from("tratamiento-fotos")
    .remove([storagePath]);
  if (storageError) throw new Error("No se pudo eliminar el archivo.");

  const { error } = await supabase.from("tratamiento_fotos").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la foto.");

  revalidatePath("/tratamientos");
}

export async function urlFirmadaFoto(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("tratamiento-fotos")
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function listarFotosTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamiento_fotos")
    .select("id, storage_path, etiqueta, created_at")
    .eq("tratamiento_id", tratamientoId)
    .order("created_at");

  return Promise.all(
    (data ?? []).map(async (foto) => ({
      ...foto,
      url: await urlFirmadaFoto(foto.storage_path),
    })),
  );
}
