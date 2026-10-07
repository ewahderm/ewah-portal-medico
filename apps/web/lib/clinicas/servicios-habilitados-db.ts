import type { createClient } from "@/lib/supabase/server";

// Operación de negocio "declarar un servicio en una sede" (una fila de
// clinica_servicios_habilitados, 0055/0061/0062). La disparan dos pantallas
// con permisos distintos — Parámetros → Datos básicos (solo admin, todos los
// planes) y Habilitación → Sedes y servicios (habilitacion/EDIT + plan Pro) —
// así que cada action hace su propio chequeo y ambas comparten ESTE insert y
// la traducción de errores. Vive fuera de los archivos "use server" porque
// esos solo pueden exportar funciones async invocables desde el cliente, y
// esta no debe serlo (no valida permisos por sí misma).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CamposServicioHabilitado = {
  practicaMedicaId: string;
  sedeId: string | null;
  codigoHabilitacion: string | null;
  // Detalle regulatorio (Habilitación). Datos básicos no los envía: el
  // trigger fn_servicio_habilitado_validar (0062) asigna numeral y
  // complejidad cuando la norma solo admite una opción.
  servicioNormaId?: string | null;
  complejidad?: string | null;
  modalidades?: string[];
  telemedicinaCategorias?: string[];
  telemedicinaRoles?: string[];
  estado?: string;
  fechaHabilitacion?: string | null;
  fechaCierreTemporal?: string | null;
};

export async function insertarServicioHabilitado<T>(
  supabase: Supabase,
  usuario: { id: string; clinica_id: string },
  campos: CamposServicioHabilitado,
  select: string,
) {
  const fila: Record<string, unknown> = {
    clinica_id: usuario.clinica_id,
    practica_medica_id: campos.practicaMedicaId,
    sede_id: campos.sedeId || null,
    codigo_habilitacion: campos.codigoHabilitacion?.trim() || null,
    created_by: usuario.id,
    updated_by: usuario.id,
  };
  if (campos.servicioNormaId !== undefined) fila.servicio_norma_id = campos.servicioNormaId;
  if (campos.complejidad !== undefined) fila.complejidad = campos.complejidad;
  if (campos.modalidades !== undefined) fila.modalidades = campos.modalidades;
  if (campos.telemedicinaCategorias !== undefined) fila.telemedicina_categorias = campos.telemedicinaCategorias;
  if (campos.telemedicinaRoles !== undefined) fila.telemedicina_roles = campos.telemedicinaRoles;
  if (campos.estado !== undefined) fila.estado = campos.estado;
  if (campos.fechaHabilitacion !== undefined) fila.fecha_habilitacion = campos.fechaHabilitacion;
  if (campos.fechaCierreTemporal !== undefined) fila.fecha_cierre_temporal = campos.fechaCierreTemporal;

  const { data, error } = await supabase
    .from("clinica_servicios_habilitados")
    .insert(fila)
    .select(select)
    .single();
  return { data: data as T | null, error };
}

// 23505 = unique (clínica, sede, práctica, numeral) de 0062; P0001 = los
// triggers fn_hab_misma_clinica / fn_servicio_habilitado_validar, cuyos
// mensajes ya están escritos para el usuario; 23514 = un check de 0061
// (p. ej. telemedicina sin la modalidad). Cualquier otro error se oculta
// tras un mensaje genérico y su detalle queda solo en el log del servidor.
export function mensajeErrorServicio(error: { code?: string; message: string }, generico: string) {
  if (error.code === "23505") return "Ese servicio ya está registrado en esa sede.";
  if (error.code === "P0001") return error.message;
  if (error.code === "23514") {
    return "La combinación de modalidades y telemedicina no es válida: las categorías y roles de telemedicina solo aplican si marcas la modalidad Telemedicina.";
  }
  if (error.code === "42501") return "No tienes permiso para esta acción.";
  console.error(error);
  return generico;
}
