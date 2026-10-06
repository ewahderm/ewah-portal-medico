"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import { campoOpcional } from "@/lib/forms/opcional";

const TIPOS_LOGO_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;

export async function actualizarMarcaClinica(formData: FormData) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede editar la marca de la clínica.");
  }

  const nombreComercial = campoOpcional(formData, "nombreComercial");
  const correoNotificaciones = campoOpcional(formData, "correoNotificaciones");
  const telefonoContacto = campoOpcional(formData, "telefonoContacto");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_actualizar_marca_propia_clinica", {
    p_nombre_comercial: nombreComercial,
    p_correo_notificaciones: correoNotificaciones,
    p_telefono_contacto: telefonoContacto,
  });
  if (error) throw new Error("No se pudo actualizar la marca de la clínica.");

  revalidatePath("/suscripcion");
}

// Determina qué campos/cálculos de RRHH-Nómina son exclusivamente
// colombianos (ver lib/rrhh/calculo.ts) — por eso vive en /parametros y no
// en /suscripcion, es configuración operativa de RRHH, no de marca.
export async function actualizarPaisOperacionClinica(formData: FormData) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }

  const paisOperacionId = String(formData.get("paisOperacionId") ?? "");
  if (!paisOperacionId) throw new Error("Selecciona un país.");
  const exoneracionAportes = formData.get("exoneracionAportes") === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_actualizar_pais_y_exoneracion_clinica", {
    p_pais_operacion_id: paisOperacionId,
    p_exoneracion_aportes: exoneracionAportes,
  });
  if (error) throw new Error("No se pudo actualizar la configuración.");

  revalidatePath("/parametros");
}

// No pasa por comprimirImagen.ts a propósito: ese util re-codifica todo a
// JPEG, lo que le quitaría la transparencia a un logo PNG/SVG. Aquí solo se
// valida tipo y tamaño — el navegador sube el archivo tal cual.
export async function subirLogoClinica(formData: FormData) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar el logo de la clínica.");
  }

  const archivo = formData.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new Error("Selecciona un archivo de logo.");
  }
  if (!TIPOS_LOGO_PERMITIDOS.includes(archivo.type)) {
    throw new Error("El logo debe ser PNG, JPEG, WebP o SVG.");
  }
  if (archivo.size > TAMANO_MAXIMO_LOGO) {
    throw new Error("El logo no puede pesar más de 2MB.");
  }

  const supabase = await createClient();

  const { data: clinicaActual } = await supabase
    .from("clinicas")
    .select("logo_storage_path")
    .eq("id", usuario.clinica_id)
    .maybeSingle();

  const extension = archivo.name.split(".").pop() || "png";
  const path = `${usuario.clinica_id}/logo-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("clinica-logos")
    .upload(path, archivo, { contentType: archivo.type });
  if (uploadError) throw new Error("No se pudo subir el logo.");

  const { error: rpcError } = await supabase.rpc("fn_actualizar_logo_propia_clinica", {
    p_logo_storage_path: path,
  });
  if (rpcError) throw new Error("No se pudo guardar el logo.");

  // Best-effort: limpia el archivo anterior para no acumular huérfanos en
  // el bucket. Si falla, el logo nuevo ya quedó guardado igual.
  const pathAnterior = clinicaActual?.logo_storage_path;
  if (pathAnterior && pathAnterior !== path) {
    await supabase.storage.from("clinica-logos").remove([pathAnterior]);
  }

  revalidatePath("/suscripcion");
}
