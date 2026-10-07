"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import {
  SERVICIO_HABILITADO_SELECT,
  type ServicioHabilitado,
} from "@/lib/clinicas/servicios-habilitados-tipos";
import {
  insertarServicioHabilitado,
  mensajeErrorServicio as mensajeError,
} from "@/lib/clinicas/servicios-habilitados-db";

// Lista de servicios habilitados ante REPS (0055, por sede desde 0061) —
// cada fila persiste de inmediato (igual que activarCups/desactivarCups),
// independiente del botón "Guardar" del resto de Datos básicos de la
// clínica. Desde Datos básicos sigue siendo solo de administrador (en
// todos los planes); el detalle regulatorio de la misma fila (complejidad,
// modalidades, estado) se edita desde Habilitación.

export type { ServicioHabilitado };

async function requireAdmin() {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }
  return usuario;
}

export async function agregarServicioHabilitado(
  practicaMedicaId: string,
  sedeId: string | null,
  codigoHabilitacion: string | null,
): Promise<ServicioHabilitado> {
  const usuario = await requireAdmin();
  if (!practicaMedicaId) throw new Error("Selecciona un servicio.");

  const supabase = await createClient();
  const { data, error } = await insertarServicioHabilitado<ServicioHabilitado>(
    supabase,
    usuario,
    { practicaMedicaId, sedeId, codigoHabilitacion },
    SERVICIO_HABILITADO_SELECT,
  );
  if (error || !data) {
    throw new Error(error ? mensajeError(error, "No se pudo agregar el servicio habilitado.") : "No se pudo agregar el servicio habilitado.");
  }

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
  return data;
}

export async function actualizarCodigoServicioHabilitado(id: string, codigoHabilitacion: string | null) {
  const usuario = await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .update({ codigo_habilitacion: codigoHabilitacion?.trim() || null, updated_by: usuario.id })
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) throw new Error(mensajeError(error, "No se pudo actualizar el código."));

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
}

// Asignar o cambiar la sede de una fila ya creada (p. ej. las creadas antes
// de 0061, que quedaron sin sede).
export async function actualizarSedeServicioHabilitado(id: string, sedeId: string | null) {
  const usuario = await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .update({ sede_id: sedeId || null, updated_by: usuario.id })
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) throw new Error(mensajeError(error, "No se pudo cambiar la sede."));

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
}

export async function eliminarServicioHabilitado(id: string) {
  const usuario = await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .delete()
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) throw new Error(mensajeError(error, "No se pudo eliminar el servicio habilitado."));

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
}
