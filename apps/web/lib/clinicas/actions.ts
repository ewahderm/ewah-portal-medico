"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";

const TIPOS_LOGO_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;

// Datos de marca para imprimir en un PDF (comprobantes de nómina/honorarios,
// etc.) — mismo bucket público ya usado para el logo en el navbar/correos.
export async function obtenerClinicaParaPdf() {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");

  const supabase = await createClient();
  const { data: clinica } = await supabase
    .from("clinicas")
    .select("nombre, nombre_comercial, nit, telefono_contacto, logo_storage_path")
    .eq("id", usuario.clinica_id)
    .single();
  if (!clinica) throw new Error("No se pudo cargar la información de la clínica.");

  const logoUrl = clinica.logo_storage_path
    ? supabase.storage.from("clinica-logos").getPublicUrl(clinica.logo_storage_path).data.publicUrl
    : null;

  return {
    nombre: clinica.nombre,
    nombreComercial: clinica.nombre_comercial,
    nit: clinica.nit,
    telefonoContacto: clinica.telefono_contacto,
    logoUrl,
  };
}

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

// Datos básicos de la clínica como prestador de salud (RIPS/REPS/INVIMA) +
// generalidades (dirección/teléfono/email/geografía) + el país de
// operación y la exoneración de aportes que ya vivían aquí (0048) — mismo
// motivo para seguir en /parametros y no en /suscripcion: es configuración
// operativa/regulatoria, no de marca. Reemplaza a
// actualizarPaisOperacionClinica, que queda sin uso pero no se borra.
export async function actualizarDatosBasicosClinica(formData: FormData) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }

  const paisOperacionId = String(formData.get("paisOperacionId") ?? "");
  if (!paisOperacionId) throw new Error("Selecciona un país.");
  const exoneracionAportes = formData.get("exoneracionAportes") === "on";

  const nit = String(formData.get("nit") ?? "").trim();
  if (!nit) throw new Error("El número de identificación es obligatorio.");

  const supabase = await createClient();

  // RPC aparte (0059) para no cambiar la firma de la función principal; el
  // mensaje de "ya existe otra clínica con ese número" es apto para mostrar.
  const { error: errorNit } = await supabase.rpc("fn_actualizar_nit_clinica", { p_nit: nit });
  if (errorNit) {
    throw new Error(
      errorNit.message.includes("Ya existe otra clínica")
        ? errorNit.message
        : "No se pudo actualizar el número de identificación.",
    );
  }

  const { error } = await supabase.rpc("fn_actualizar_datos_basicos_clinica", {
    p_pais_operacion_id: paisOperacionId,
    p_exoneracion_aportes: exoneracionAportes,
    p_direccion: campoOpcional(formData, "direccion"),
    p_telefono: campoOpcional(formData, "telefono"),
    p_email: campoOpcional(formData, "email"),
    p_tipo_persona_id: valorOpcionalSelect(formData, "tipoPersonaId"),
    p_tipo_documento_id: valorOpcionalSelect(formData, "tipoDocumentoId"),
    p_rol_actor_id: valorOpcionalSelect(formData, "rolActorId"),
    p_tipo_transaccion_invima_id: valorOpcionalSelect(formData, "tipoTransaccionInvimaId"),
    p_codigo_habilitacion: campoOpcional(formData, "codigoHabilitacion"),
    p_clase_riesgo_id: valorOpcionalSelect(formData, "claseRiesgoId"),
    p_departamento_id: valorOpcionalSelect(formData, "departamentoId"),
    p_ciudad_id: valorOpcionalSelect(formData, "ciudadId"),
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
