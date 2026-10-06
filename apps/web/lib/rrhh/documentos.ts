"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { esAdministrador } from "@/lib/auth/session";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import { TIPOS_DOCUMENTO_EMPLEADO, MAX_DOCUMENTO_BYTES, TIPOS_DOCUMENTO_PERMITIDOS } from "./constantes";

function requirePermiso(permiso: "CREATE") {
  return requirePermisoBase("rrhh", permiso);
}

export async function subirDocumentoEmpleado(empleadoId: string, formData: FormData) {
  const tipo = String(formData.get("tipo") ?? "");
  if (!TIPOS_DOCUMENTO_EMPLEADO.some((t) => t.value === tipo)) {
    throw new Error("Tipo de documento inválido.");
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) throw new Error(check.error);

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new Error("Selecciona un archivo.");
  }
  if (archivo.size > MAX_DOCUMENTO_BYTES) {
    throw new Error("El archivo no puede pesar más de 10 MB.");
  }
  if (!TIPOS_DOCUMENTO_PERMITIDOS.includes(archivo.type)) {
    throw new Error("Formato no soportado. Usa JPG, PNG, WEBP o PDF.");
  }

  const tipoVacunaId = valorOpcionalSelect(formData, "tipoVacunaId");
  const tipoExamenId = valorOpcionalSelect(formData, "tipoExamenId");
  const nombrePersonalizado = campoOpcional(formData, "nombrePersonalizado");
  const fechaEvento = campoOpcional(formData, "fechaEvento");
  const fechaVencimiento = campoOpcional(formData, "fechaVencimiento");

  if (tipo === "vacuna" && !tipoVacunaId) throw new Error("Selecciona el tipo de vacuna.");
  if (tipo === "examen_ocupacional" && !tipoExamenId) {
    throw new Error("Selecciona el tipo de examen ocupacional.");
  }

  const supabase = await createClient();
  const extension = archivo.name.split(".").pop() ?? "pdf";
  const path = `${check.usuario.clinica_id}/empleados/${empleadoId}/${tipo}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("documentos-rrhh")
    .upload(path, archivo, { contentType: archivo.type });
  if (uploadError) throw new Error("No se pudo subir el archivo.");

  const { error: insertError } = await supabase.from("documentos_empleado").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    tipo,
    tipo_vacuna_id: tipo === "vacuna" ? tipoVacunaId : null,
    tipo_examen_id: tipo === "examen_ocupacional" ? tipoExamenId : null,
    nombre_personalizado: nombrePersonalizado,
    storage_path: path,
    nombre_archivo: archivo.name,
    fecha_evento: fechaEvento,
    fecha_vencimiento: fechaVencimiento,
    created_by: check.usuario.id,
  });
  if (insertError) throw new Error("No se pudo guardar el documento.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function eliminarDocumentoEmpleado(id: string, empleadoId: string) {
  const check = await requirePermiso("CREATE");
  if (!check.ok) throw new Error(check.error);
  if (!esAdministrador(check.usuario)) {
    throw new Error("Solo un administrador puede eliminar un documento.");
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documentos_empleado")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("documentos_empleado").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el documento.");

  if (doc?.storage_path) {
    await supabase.storage.from("documentos-rrhh").remove([doc.storage_path]);
  }

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function listarDocumentosEmpleado(empleadoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documentos_empleado")
    .select(
      "id, tipo, nombre_personalizado, storage_path, nombre_archivo, fecha_evento, fecha_vencimiento, created_at, tipos_vacuna(nombre), tipos_examen_ocupacional(nombre)",
    )
    .eq("empleado_id", empleadoId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// Nombre genérico a propósito: el bucket "documentos-rrhh" es compartido
// entre documentos de empleado, actas, incapacidades, vacaciones,
// protocolos y planilla — cualquier storage_path de ese bucket se firma
// igual, sin importar de qué tabla venga.
export async function urlFirmadaDocumentoRrhh(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documentos-rrhh")
    .createSignedUrl(storagePath, 600);
  if (error || !data) throw new Error("No se pudo generar el enlace.");
  return data.signedUrl;
}
