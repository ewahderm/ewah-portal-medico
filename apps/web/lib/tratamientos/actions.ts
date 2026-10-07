"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { campoOpcional } from "@/lib/forms/opcional";
import { CATEGORIAS_ANEXO } from "./anexos";
import { tieneInfoPendiente } from "@/lib/pacientes/completitud";
import type { ActionState } from "@/lib/auth/actions";
import type { ResultadoAccion } from "@/lib/forms/resultado";

const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const TIPOS_FOTO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];

const MAX_ANEXO_BYTES = 15 * 1024 * 1024;
const TIPOS_ANEXO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// El PDF ya viene ensamblado desde el navegador (una página por foto
// recortada) — el límite es generoso porque varias páginas de foto en JPEG
// calidad media pueden pesar más que un PDF de texto típico.
const MAX_CONSENTIMIENTO_BYTES = 20 * 1024 * 1024;
const MAX_PAGINAS_CONSENTIMIENTO = 20;

function requirePermiso(permiso: "CREATE" | "VOID") {
  return requirePermisoBase("tratamientos", permiso);
}

// El botón de Fotos/Anexos (con su marca de "tiene archivos") vive en 3
// pantallas — /tratamientos, la ficha del paciente y el detalle de una
// cita — pero antes solo se revalidaba /tratamientos: subir o borrar un
// archivo desde las otras dos no actualizaba la marca hasta salir y
// volver a entrar. `/pacientes/[id]` es una ruta dinámica: revalidarla
// por patrón (`'page'`) cubre cualquier paciente, no solo uno — incluye
// el segmento de grupo de rutas `(protected)` porque revalidatePath con
// patrón opera sobre la estructura de archivos, no sobre la URL visible.
function revalidarPantallasDeArchivos() {
  revalidatePath("/tratamientos");
  revalidatePath("/(protected)/pacientes/[id]", "page");
  revalidatePath("/citas");
}

// Repetido en crearTratamiento y editarTratamiento (ambas insertan una fila
// nueva en tratamientos) — se valida siempre en el servidor, sin confiar en
// que el botón ya venga deshabilitado desde el cliente.
async function pacienteTieneInfoPendiente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pacienteId: string,
) {
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("tipo_identificacion_id, numero_identificacion, email, telefono1")
    .eq("id", pacienteId)
    .maybeSingle();

  if (!paciente) return true;
  return tieneInfoPendiente(paciente);
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
  const atencionId = campoOpcional(formData, "atencionId");

  const errorValidacion = validarDatosTratamiento(datos);
  if (errorValidacion) return { error: errorValidacion };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  if (await pacienteTieneInfoPendiente(supabase, datos.pacienteId)) {
    return {
      error:
        "Este paciente tiene información obligatoria pendiente. Complétala en su ficha antes de registrar un tratamiento.",
    };
  }

  // Todo tratamiento cuelga de una atención — nunca de una cita
  // directamente. Si se corrige uno ya anulado, hereda la atención del
  // original (más abajo). Si no, o ya viene de un atencionId (desde el
  // detalle de una atención) — se valida que sea del mismo paciente, el
  // mismo criterio de seguridad que ya existía para citaId — o, si no
  // viene ninguno (ej. el botón "Nuevo tratamiento" de /tratamientos, que
  // deja elegir cualquier paciente sin pasar antes por una atención), se
  // crea una atención sin cita al vuelo para que el tratamiento nunca
  // quede sin su contenedor.
  let atencionIdFinal: string | null = null;
  if (corrigeA) {
    const { data: original } = await supabase
      .from("tratamientos")
      .select("atencion_id")
      .eq("id", corrigeA)
      .maybeSingle();
    atencionIdFinal = original?.atencion_id ?? null;
  } else if (atencionId) {
    const { data: atencionDestino } = await supabase
      .from("atenciones")
      .select("id, paciente_id")
      .eq("id", atencionId)
      .maybeSingle();
    if (!atencionDestino || atencionDestino.paciente_id !== datos.pacienteId) {
      return { error: "La atención indicada no es válida para este paciente." };
    }
    atencionIdFinal = atencionId;
  } else {
    const { data: nuevaAtencion, error: errorAtencion } = await supabase
      .from("atenciones")
      .insert({
        clinica_id: check.usuario.clinica_id,
        paciente_id: datos.pacienteId,
        profesional_id: datos.profesionalId,
        fecha: datos.fecha,
        created_by: check.usuario.id,
      })
      .select("id")
      .single();
    if (errorAtencion || !nuevaAtencion) {
      return { error: "No se pudo crear la atención para este tratamiento." };
    }
    atencionIdFinal = nuevaAtencion.id;
  }

  if (!atencionIdFinal) return { error: "No se pudo determinar la atención de este tratamiento." };

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
      atencion_id: atencionIdFinal,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (error || !tratamiento) return { error: "No se pudo registrar el tratamiento." };

  revalidatePath("/tratamientos");
  revalidatePath("/citas");
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

  if (await pacienteTieneInfoPendiente(supabase, datos.pacienteId)) {
    return {
      error:
        "Este paciente tiene información obligatoria pendiente. Complétala en su ficha antes de registrar un tratamiento.",
    };
  }

  // El corregido hereda la atención del original, para no perder el
  // enlace solo por haber corregido un error (el formulario no manda este
  // campo, así que se consulta aparte).
  const { data: original } = await supabase
    .from("tratamientos")
    .select("atencion_id")
    .eq("id", editaId)
    .maybeSingle();

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
      atencion_id: original?.atencion_id,
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

export async function anularTratamiento(id: string, motivo: string): Promise<ResultadoAccion> {
  if (!motivo.trim()) return { error: "El motivo de anulación es obligatorio." };

  const check = await requirePermiso("VOID");
  if (!check.ok) return { error: check.error };

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

  if (error) return { error: "No se pudo anular el tratamiento." };

  revalidatePath("/tratamientos");
  return {};
}

// Revertir una anulación queda restringido a un administrador — la base de
// datos ya lo exige (fn_tratamientos_solo_anular), esto solo da un mensaje
// claro en vez del error crudo de la policy.
export async function revertirAnulacionTratamiento(id: string): Promise<ResultadoAccion> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { error: "Solo un administrador puede revertir la anulación de un tratamiento." };
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

  if (error) return { error: "No se pudo revertir la anulación." };

  // Si este tratamiento se había anulado al "Editarlo" o al "Corregirlo"
  // (ambos flujos crean un registro nuevo que apunta a este vía corrige_a),
  // reactivarlo sin anular también ese reemplazo deja los dos activos a la
  // vez — el mismo evento clínico duplicado, ya reportado como bug real.
  const { data: corregido } = await supabase
    .from("tratamientos")
    .select("id")
    .eq("corrige_a", id)
    .eq("anulado", false)
    .maybeSingle();

  if (corregido) {
    const { error: anularCorregidoError } = await supabase
      .from("tratamientos")
      .update({
        anulado: true,
        anulado_motivo: "Anulado automáticamente al revertir la anulación del registro que corregía.",
        anulado_por: usuario.id,
        anulado_en: new Date().toISOString(),
      })
      .eq("id", corregido.id);
    if (anularCorregidoError) {
      return { error: "Se revirtió la anulación, pero no se pudo anular el registro corregido que lo había reemplazado — quedaron los dos activos, anúlalo manualmente.", };
    }
  }

  revalidatePath("/tratamientos");
  return {};
}

function columnaFoto(etiqueta: "antes" | "despues") {
  return etiqueta === "antes" ? "storage_path_antes" : "storage_path_despues";
}

function validarArchivoFoto(formData: FormData): { error: string } | { foto: File } {
  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return { error: "Selecciona una foto." };
  }
  if (foto.size > MAX_FOTO_BYTES) {
    return { error: "La foto no puede pesar más de 8 MB." };
  }
  if (!TIPOS_FOTO_PERMITIDOS.includes(foto.type)) {
    return { error: "Formato no soportado. Usa JPG, PNG o WEBP." };
  }
  return { foto };
}

// Un registro de fotos es un PAR (antes + después) con una sola
// observación compartida — no una foto suelta. Se puede crear con una
// sola de las dos (la que se tenga a mano) y completar la otra después con
// completarFotoRegistro, porque en la práctica el "antes" se toma en la
// consulta inicial y el "después" en una posterior.
export async function crearRegistroFoto(
  tratamientoId: string,
  etiqueta: "antes" | "despues",
  formData: FormData,
): Promise<ResultadoAccion> {
  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const validacion = validarArchivoFoto(formData);
  if ("error" in validacion) return { error: validacion.error };
  const foto = validacion.foto;
  const observaciones = campoOpcional(formData, "observaciones");

  const supabase = await createClient();
  const extension = foto.name.split(".").pop() ?? "jpg";
  const path = `${check.usuario.clinica_id}/${tratamientoId}/${etiqueta}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("tratamiento-fotos")
    .upload(path, foto, { contentType: foto.type });
  if (uploadError) return { error: "No se pudo subir la foto." };

  const { error: insertError } = await supabase.from("tratamiento_fotos").insert({
    clinica_id: check.usuario.clinica_id,
    tratamiento_id: tratamientoId,
    [columnaFoto(etiqueta)]: path,
    observaciones,
    created_by: check.usuario.id,
  });
  if (insertError) return { error: "No se pudo registrar la foto." };

  revalidarPantallasDeArchivos();
  return {};
}

// Agrega la foto que falta (antes o después) a un registro ya existente.
// No permite reemplazar una foto que ya está — para eso hay que eliminar
// el registro completo y crear uno nuevo (mismo criterio append-only que
// el resto de la historia clínica).
export async function completarFotoRegistro(
  fotoId: string,
  tratamientoId: string,
  etiqueta: "antes" | "despues",
  formData: FormData,
): Promise<ResultadoAccion> {
  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const validacion = validarArchivoFoto(formData);
  if ("error" in validacion) return { error: validacion.error };
  const foto = validacion.foto;
  const columna = columnaFoto(etiqueta);

  const supabase = await createClient();
  const { data: registro } = await supabase
    .from("tratamiento_fotos")
    .select("id, storage_path_antes, storage_path_despues")
    .eq("id", fotoId)
    .eq("tratamiento_id", tratamientoId)
    .eq("clinica_id", check.usuario.clinica_id)
    .maybeSingle();
  if (!registro) return { error: "Registro no encontrado." };
  if (registro[columna]) return { error: "Este registro ya tiene una foto de este lado." };

  const extension = foto.name.split(".").pop() ?? "jpg";
  const path = `${check.usuario.clinica_id}/${tratamientoId}/${etiqueta}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("tratamiento-fotos")
    .upload(path, foto, { contentType: foto.type });
  if (uploadError) return { error: "No se pudo subir la foto." };

  const { error: updateError } = await supabase
    .from("tratamiento_fotos")
    .update({ [columna]: path })
    .eq("id", fotoId);
  if (updateError) return { error: "No se pudo completar el registro." };

  revalidarPantallasDeArchivos();
  return {};
}

export async function eliminarFotoTratamiento(id: string): Promise<ResultadoAccion> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  // La política de RLS ya solo permite este DELETE a un administrador
  // (es_admin()) — se repite aquí para dar un mensaje claro en vez de
  // dejar que falle con el error crudo de la base de datos.
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede eliminar fotos." };

  const supabase = await createClient();
  const { data: registro } = await supabase
    .from("tratamiento_fotos")
    .select("storage_path_antes, storage_path_despues")
    .eq("id", id)
    .maybeSingle();
  if (!registro) return { error: "Registro no encontrado." };

  const paths = [registro.storage_path_antes, registro.storage_path_despues].filter(
    (p): p is string => Boolean(p),
  );
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("tratamiento-fotos").remove(paths);
    if (storageError) return { error: "No se pudo eliminar el archivo." };
  }

  const { error } = await supabase.from("tratamiento_fotos").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la foto." };

  revalidarPantallasDeArchivos();
  return {};
}

export async function urlFirmadaFoto(storagePath: string, descargar = false) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("tratamiento-fotos")
    .createSignedUrl(storagePath, 60 * 10, descargar ? { download: true } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function listarFotosTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamiento_fotos")
    .select("id, storage_path_antes, storage_path_despues, observaciones, created_at")
    .eq("tratamiento_id", tratamientoId)
    .order("created_at");

  return Promise.all(
    (data ?? []).map(async (foto) => ({
      id: foto.id,
      observaciones: foto.observaciones,
      storagePathAntes: foto.storage_path_antes,
      storagePathDespues: foto.storage_path_despues,
      urlAntes: foto.storage_path_antes ? await urlFirmadaFoto(foto.storage_path_antes) : null,
      urlDespues: foto.storage_path_despues ? await urlFirmadaFoto(foto.storage_path_despues) : null,
    })),
  );
}

export async function subirAnexoTratamiento(
  tratamientoId: string,
  categoria: string,
  formData: FormData,
): Promise<ResultadoAccion> {
  if (!(CATEGORIAS_ANEXO as readonly string[]).includes(categoria)) {
    return { error: "Categoría inválida." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("tratamientos", "anexos");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (archivo.size > MAX_ANEXO_BYTES) {
    return { error: "El archivo no puede pesar más de 15 MB." };
  }
  if (!TIPOS_ANEXO_PERMITIDOS.includes(archivo.type)) {
    return { error: "Formato no soportado. Usa JPG, PNG, WEBP o PDF." };
  }

  const observaciones = campoOpcional(formData, "observaciones");

  const supabase = await createClient();
  const extension = archivo.name.split(".").pop() ?? "pdf";
  const path = `${check.usuario.clinica_id}/${tratamientoId}/${categoria}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("tratamiento-anexos")
    .upload(path, archivo, { contentType: archivo.type });
  if (uploadError) return { error: "No se pudo subir el archivo." };

  const { error: insertError } = await supabase.from("tratamiento_anexos").insert({
    clinica_id: check.usuario.clinica_id,
    tratamiento_id: tratamientoId,
    storage_path: path,
    nombre_archivo: archivo.name,
    content_type: archivo.type,
    categoria,
    observaciones,
    created_by: check.usuario.id,
  });
  if (insertError) return { error: "No se pudo registrar el anexo." };

  revalidarPantallasDeArchivos();
  return {};
}

export async function eliminarAnexoTratamiento(id: string, storagePath: string): Promise<ResultadoAccion> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  // Mismo motivo que en eliminarFotoTratamiento: RLS ya lo exige, esto solo
  // da un mensaje claro en vez de un error crudo.
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede eliminar anexos." };

  const supabase = await createClient();
  const { error: storageError } = await supabase.storage
    .from("tratamiento-anexos")
    .remove([storagePath]);
  if (storageError) return { error: "No se pudo eliminar el archivo." };

  const { error } = await supabase.from("tratamiento_anexos").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el anexo." };

  revalidarPantallasDeArchivos();
  return {};
}

export async function urlFirmadaAnexo(storagePath: string, descargar = false) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("tratamiento-anexos")
    .createSignedUrl(storagePath, 60 * 10, descargar ? { download: true } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

// Solo lectura de algo ya visible en la cita (mismo criterio que
// listarFotosTratamiento/listarAnexosTratamiento) — no se exige un permiso
// explícito, pero sí se filtra por clinica_id para no exponer tratamientos
// de otra clínica.
export type TratamientoDeAtencion = {
  id: string;
  paciente_id: string;
  tipo_tratamiento_id: string;
  profesional_id: string;
  sede_id: string;
  medio_pago_id: string;
  fecha: string;
  costo: number | null;
  notas: string | null;
  cufe: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  tipos_tratamiento: { nombre: string } | null;
  sedes: { nombre: string } | null;
  profesional: { nombre: string } | null;
  tieneFotos: boolean;
  tieneAnexos: boolean;
  tieneConsentimiento: boolean;
};

export async function listarTratamientosDeAtencion(atencionId: string): Promise<TratamientoDeAtencion[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamientos")
    .select(
      `id, paciente_id, tipo_tratamiento_id, profesional_id, sede_id, medio_pago_id,
       fecha, costo, notas, cufe, anulado, anulado_motivo,
       tipos_tratamiento(nombre), sedes(nombre),
       profesional:usuarios!tratamientos_profesional_id_fkey(nombre),
       tratamiento_fotos(count), tratamiento_anexos(count), tratamiento_consentimientos(count)`,
    )
    .eq("atencion_id", atencionId)
    .eq("clinica_id", usuario.clinica_id)
    .order("created_at");

  return (data ?? []).map((fila) => {
    const t = fila as unknown as Omit<TratamientoDeAtencion, "tieneFotos" | "tieneAnexos" | "tieneConsentimiento"> & {
      tratamiento_fotos?: { count: number }[];
      tratamiento_anexos?: { count: number }[];
      tratamiento_consentimientos?: { count: number }[];
    };
    return {
      ...t,
      tieneFotos: (t.tratamiento_fotos?.[0]?.count ?? 0) > 0,
      tieneAnexos: (t.tratamiento_anexos?.[0]?.count ?? 0) > 0,
      tieneConsentimiento: (t.tratamiento_consentimientos?.[0]?.count ?? 0) > 0,
    };
  });
}

// Tratamientos vigentes del paciente en cualquier atención — para que una
// evolución de control pueda ligarse a un procedimiento hecho en una visita
// anterior. Mismo filtro por clínica que el listado de la atención.
export type TratamientoDePaciente = {
  id: string;
  fecha: string;
  tipos_tratamiento: { nombre: string } | null;
};

export async function listarTratamientosDelPaciente(pacienteId: string): Promise<TratamientoDePaciente[]> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamientos")
    .select("id, fecha, tipos_tratamiento(nombre)")
    .eq("paciente_id", pacienteId)
    .eq("clinica_id", usuario.clinica_id)
    .eq("anulado", false)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as TratamientoDePaciente[];
}

export type TratamientoDetalle = {
  id: string;
  fecha: string;
  costo: number | null;
  notas: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  tipos_tratamiento: { nombre: string } | null;
  sedes: { nombre: string } | null;
  profesional: { nombre: string } | null;
};

// Detalle de solo lectura de un tratamiento, para consultarlo desde una
// evolución que lo referencia (puede ser de una atención anterior).
export async function obtenerTratamientoDetalle(tratamientoId: string): Promise<TratamientoDetalle | null> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamientos")
    .select(
      `id, fecha, costo, notas, anulado, anulado_motivo,
       tipos_tratamiento(nombre), sedes(nombre),
       profesional:usuarios!tratamientos_profesional_id_fkey(nombre)`,
    )
    .eq("id", tratamientoId)
    .eq("clinica_id", usuario.clinica_id)
    .maybeSingle();

  return (data as unknown as TratamientoDetalle) ?? null;
}

export async function listarAnexosTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamiento_anexos")
    .select("id, storage_path, nombre_archivo, content_type, categoria, observaciones, created_at")
    .eq("tratamiento_id", tratamientoId)
    .order("created_at", { ascending: false });

  return Promise.all(
    (data ?? []).map(async (anexo) => ({
      ...anexo,
      url: await urlFirmadaAnexo(anexo.storage_path),
    })),
  );
}

// Consentimientos informados: mismo patrón de Storage+tabla que Anexos,
// pero SIN requireEntitlement — a diferencia de Anexos (sub-feature de
// pago), un consentimiento informado es una necesidad clínica/legal
// (decisión acordada con el usuario), disponible en cualquier plan igual
// que el resto del núcleo de Tratamientos.
export async function subirConsentimientoTratamiento(tratamientoId: string, formData: FormData): Promise<ResultadoAccion> {
  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "No se generó ningún PDF para subir." };
  }
  if (archivo.size > MAX_CONSENTIMIENTO_BYTES) {
    return { error: "El PDF no puede pesar más de 20 MB." };
  }
  if (archivo.type !== "application/pdf") {
    return { error: "El consentimiento debe guardarse como PDF." };
  }

  const paginas = Number(formData.get("paginas") ?? 0);
  if (!Number.isInteger(paginas) || paginas < 1 || paginas > MAX_PAGINAS_CONSENTIMIENTO) {
    return { error: `El consentimiento debe tener entre 1 y ${MAX_PAGINAS_CONSENTIMIENTO} páginas.` };
  }

  const supabase = await createClient();
  const path = `${check.usuario.clinica_id}/${tratamientoId}/consentimiento-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("tratamiento-consentimientos")
    .upload(path, archivo, { contentType: "application/pdf" });
  if (uploadError) return { error: "No se pudo subir el consentimiento." };

  const { error: insertError } = await supabase.from("tratamiento_consentimientos").insert({
    clinica_id: check.usuario.clinica_id,
    tratamiento_id: tratamientoId,
    storage_path: path,
    nombre_archivo: archivo.name || "consentimiento.pdf",
    paginas,
    created_by: check.usuario.id,
  });
  if (insertError) return { error: "No se pudo registrar el consentimiento." };

  revalidarPantallasDeArchivos();
  return {};
}

export async function eliminarConsentimientoTratamiento(id: string, storagePath: string): Promise<ResultadoAccion> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { error: "Solo un administrador puede eliminar un consentimiento." };
  }

  const supabase = await createClient();
  const { error: storageError } = await supabase.storage
    .from("tratamiento-consentimientos")
    .remove([storagePath]);
  if (storageError) return { error: "No se pudo eliminar el archivo." };

  const { error } = await supabase.from("tratamiento_consentimientos").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el consentimiento." };

  revalidarPantallasDeArchivos();
  return {};
}

export async function urlFirmadaConsentimiento(storagePath: string, descargar = false) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("tratamiento-consentimientos")
    .createSignedUrl(storagePath, 60 * 10, descargar ? { download: true } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function listarConsentimientosTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tratamiento_consentimientos")
    .select("id, storage_path, nombre_archivo, paginas, created_at")
    .eq("tratamiento_id", tratamientoId)
    .order("created_at", { ascending: false });

  return Promise.all(
    (data ?? []).map(async (c) => ({
      ...c,
      url: await urlFirmadaConsentimiento(c.storage_path),
    })),
  );
}
