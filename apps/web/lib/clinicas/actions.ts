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

  // El nombre comercial ya no se edita aquí (vive en Datos básicos, 0080);
  // la RPC conserva el parámetro por compatibilidad y lo ignora.
  const correoNotificaciones = campoOpcional(formData, "correoNotificaciones");
  const telefonoContacto = campoOpcional(formData, "telefonoContacto");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_actualizar_marca_propia_clinica", {
    p_nombre_comercial: null,
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
// Devuelve { error } en vez de lanzar: en producción Next oculta el mensaje de
// toda excepción de una server action (el usuario solo veía "Minified React
// error #441"), así que los mensajes escritos para el usuario viajan como
// valor de retorno.
export async function actualizarDatosBasicosClinica(formData: FormData): Promise<{ error?: string }> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { error: "Solo un administrador puede cambiar esta configuración." };
  }

  const paisOperacionId = String(formData.get("paisOperacionId") ?? "");
  if (!paisOperacionId) return { error: "Selecciona un país." };
  const exoneracionAportes = formData.get("exoneracionAportes") === "on";

  const nit = String(formData.get("nit") ?? "").trim();
  if (!nit) return { error: "El número de identificación es obligatorio." };

  const nombreLegal = campoOpcional(formData, "nombreLegal");
  if (!nombreLegal) return { error: "El nombre legal de la clínica es obligatorio." };
  if (nombreLegal.length > 200) return { error: "El nombre legal no puede superar 200 caracteres." };
  const nombreComercial = campoOpcional(formData, "nombreComercial");
  if (nombreComercial && nombreComercial.length > 200) {
    return { error: "El nombre comercial no puede superar 200 caracteres." };
  }
  // Se quitan espacios, puntos o guiones que vengan al copiarlo del
  // certificado de la ARL (mismo criterio que tenía el perfil SG-SST).
  const codigoActividad = campoOpcional(formData, "codigoActividadEconomica")?.replace(/\D/g, "") || null;
  if (codigoActividad && !/^[1-5]\d{6}$/.test(codigoActividad)) {
    return { error: "La actividad económica tiene 7 dígitos y empieza por la clase de riesgo (1 a 5). Cópiala de tu afiliación a la ARL." };
  }

  const supabase = await createClient();

  // Una sola RPC (0080) que encadena perfil + NIT (0059) + datos básicos
  // (0052) en la misma transacción: si algo falla no queda a medio guardar.
  const { error } = await supabase.rpc("fn_guardar_datos_basicos_clinica", {
    p_nombre_legal: nombreLegal,
    p_nombre_comercial: nombreComercial,
    p_codigo_actividad_economica: codigoActividad,
    p_nit: nit,
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
  if (error) {
    // P0001 = raise exception de las funciones: mensajes escritos para el
    // usuario (NIT duplicado, nombre legal vacío, código inválido...).
    if (error.code === "P0001") return { error: error.message };
    console.error("[clinicas] guardar datos básicos", error);
    return { error: "No se pudieron guardar los datos de la clínica. Intenta de nuevo." };
  }

  revalidatePath("/parametros");
  revalidatePath("/suscripcion");
  return {};
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
