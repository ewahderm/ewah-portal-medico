"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import { CATEGORIAS_ANEXO } from "./anexos";
import type { ActionState } from "@/lib/auth/actions";

const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const TIPOS_FOTO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];

const MAX_ANEXO_BYTES = 15 * 1024 * 1024;
const TIPOS_ANEXO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function requirePermiso(permiso: "CREATE" | "VOID") {
  return requirePermisoBase("tratamientos", permiso);
}

function datosTratamientoDesdeForm(formData: FormData) {
  return {
    pacienteId: String(formData.get("pacienteId") ?? ""),
    tipoTratamientoId: String(formData.get("tipoTratamientoId") ?? ""),
    profesionalId: String(formData.get("profesionalId") ?? ""),
    sedeId: String(formData.get("sedeId") ?? ""),
    medioPagoId: String(formData.get("medioPagoId") ?? ""),
    fecha: String(formData.get("fecha") ?? "").trim(),
    costoTexto: String(formData.get("costo") ?? "").trim(),
    notas: campoOpcional(formData, "notas"),
    cufe: campoOpcional(formData, "cufe"),
  };
}

function validarDatosTratamiento(datos: ReturnType<typeof datosTratamientoDesdeForm>) {
  if (
    !datos.pacienteId ||
    !datos.tipoTratamientoId ||
    !datos.profesionalId ||
    !datos.sedeId ||
    !datos.medioPagoId ||
    !datos.fecha ||
    !datos.costoTexto
  ) {
    return "Paciente, tratamiento, profesional, sede, medio de pago, fecha y valor son obligatorios.";
  }
  const costo = Number(datos.costoTexto);
  if (Number.isNaN(costo) || costo < 0) {
    return "El valor debe ser un número válido.";
  }
  return null;
}

export async function crearTratamiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosTratamientoDesdeForm(formData);
  const corrigeA = campoOpcional(formData, "corrigeA");
  const citaId = campoOpcional(formData, "citaId");

  const errorValidacion = validarDatosTratamiento(datos);
  if (errorValidacion) return { error: errorValidacion };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: tratamiento, error } = await supabase
    .from("tratamientos")
    .insert({
      clinica_id: check.usuario.clinica_id,
      paciente_id: datos.pacienteId,
      tipo_tratamiento_id: datos.tipoTratamientoId,
      profesional_id: datos.profesionalId,
      sede_id: datos.sedeId,
      medio_pago_id: datos.medioPagoId,
      fecha: datos.fecha,
      costo: Number(datos.costoTexto),
      notas: datos.notas,
      cufe: datos.cufe,
      corrige_a: corrigeA,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (error || !tratamiento) return { error: "No se pudo registrar el tratamiento." };

  if (citaId) {
    await supabase
      .from("citas")
      .update({ estado: "atendida", tratamiento_id: tratamiento.id })
      .eq("id", citaId);
    revalidatePath("/citas");
  }

  revalidatePath("/tratamientos");
  return null;
}

// "Editar" = atajo de un clic para lo que antes eran dos pasos manuales
// (Anular + Corregir): crea el tratamiento corregido y anula el original
// en la misma acción. Un tratamiento nunca se edita in-place — esto sigue
// respetando esa regla, solo empaqueta las dos operaciones ya existentes.
export async function editarTratamiento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const editaId = String(formData.get("editaId") ?? "");
  if (!editaId) return { error: "Tratamiento inválido." };

  const datos = datosTratamientoDesdeForm(formData);
  const errorValidacion = validarDatosTratamiento(datos);
  if (errorValidacion) return { error: errorValidacion };

  const checkCrear = await requirePermiso("CREATE");
  if (!checkCrear.ok) return { error: checkCrear.error };
  const checkAnular = await requirePermiso("VOID");
  if (!checkAnular.ok) return { error: checkAnular.error };

  const supabase = await createClient();
  const { data: tratamiento, error: insertError } = await supabase
    .from("tratamientos")
    .insert({
      clinica_id: checkCrear.usuario.clinica_id,
      paciente_id: datos.pacienteId,
      tipo_tratamiento_id: datos.tipoTratamientoId,
      profesional_id: datos.profesionalId,
      sede_id: datos.sedeId,
      medio_pago_id: datos.medioPagoId,
      fecha: datos.fecha,
      costo: Number(datos.costoTexto),
      notas: datos.notas,
      cufe: datos.cufe,
      corrige_a: editaId,
      created_by: checkCrear.usuario.id,
    })
    .select("id")
    .single();

  if (insertError || !tratamiento) return { error: "No se pudo guardar el tratamiento editado." };

  const { error: anularError } = await supabase
    .from("tratamientos")
    .update({
      anulado: true,
      anulado_motivo: "Editado — reemplazado por un registro corregido.",
      anulado_por: checkAnular.usuario.id,
      anulado_en: new Date().toISOString(),
    })
    .eq("id", editaId);

  if (anularError) {
    return {
      error:
        "Se guardó el tratamiento corregido, pero no se pudo anular el original — anúlalo manualmente.",
    };
  }

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

// Revertir una anulación queda restringido a un administrador — la base de
// datos ya lo exige (fn_tratamientos_solo_anular), esto solo da un mensaje
// claro en vez del error crudo de la policy.
export async function revertirAnulacionTratamiento(id: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede revertir la anulación de un tratamiento.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tratamientos")
    .update({
      anulado: false,
      anulado_motivo: null,
      anulado_por: null,
      anulado_en: null,
    })
    .eq("id", id);

  if (error) throw new Error("No se pudo revertir la anulación.");

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
  // La política de RLS ya solo permite este DELETE a un administrador
  // (es_admin()) — se repite aquí para dar un mensaje claro en vez de
  // dejar que falle con el error crudo de la base de datos.
  if (!esAdministrador(usuario)) throw new Error("Solo un administrador puede eliminar fotos.");

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

export async function subirAnexoTratamiento(
  tratamientoId: string,
  categoria: string,
  formData: FormData,
) {
  if (!(CATEGORIAS_ANEXO as readonly string[]).includes(categoria)) {
    throw new Error("Categoría inválida.");
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) throw new Error(check.error);

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new Error("Selecciona un archivo.");
  }
  if (archivo.size > MAX_ANEXO_BYTES) {
    throw new Error("El archivo no puede pesar más de 15 MB.");
  }
  if (!TIPOS_ANEXO_PERMITIDOS.includes(archivo.type)) {
    throw new Error("Formato no soportado. Usa JPG, PNG, WEBP o PDF.");
  }

  const supabase = await createClient();
  const extension = archivo.name.split(".").pop() ?? "pdf";
  const path = `${check.usuario.clinica_id}/${tratamientoId}/${categoria}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("tratamiento-anexos")
    .upload(path, archivo, { contentType: archivo.type });
  if (uploadError) throw new Error("No se pudo subir el archivo.");

  const { error: insertError } = await supabase.from("tratamiento_anexos").insert({
    clinica_id: check.usuario.clinica_id,
    tratamiento_id: tratamientoId,
    storage_path: path,
    nombre_archivo: archivo.name,
    content_type: archivo.type,
    categoria,
    created_by: check.usuario.id,
  });
  if (insertError) throw new Error("No se pudo registrar el anexo.");

  revalidatePath("/tratamientos");
}

export async function eliminarAnexoTratamiento(id: string, storagePath: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  // Mismo motivo que en eliminarFotoTratamiento: RLS ya lo exige, esto solo
  // da un mensaje claro en vez de un error crudo.
  if (!esAdministrador(usuario)) throw new Error("Solo un administrador puede eliminar anexos.");

  const supabase = await createClient();
  const { error: storageError } = await supabase.storage
    .from("tratamiento-anexos")
    .remove([storagePath]);
  if (storageError) throw new Error("No se pudo eliminar el archivo.");

  const { error } = await supabase.from("tratamiento_anexos").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el anexo.");

  revalidatePath("/tratamientos");
}

export async function urlFirmadaAnexo(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("tratamiento-anexos")
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function listarAnexosTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamiento_anexos")
    .select("id, storage_path, nombre_archivo, content_type, categoria, created_at")
    .eq("tratamiento_id", tratamientoId)
    .order("created_at", { ascending: false });

  return Promise.all(
    (data ?? []).map(async (anexo) => ({
      ...anexo,
      url: await urlFirmadaAnexo(anexo.storage_path),
    })),
  );
}
