"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
import {
  SERVICIO_HABILITADO_SELECT,
  type ServicioHabilitado,
} from "@/lib/clinicas/servicios-habilitados-tipos";

// Lista de servicios habilitados ante REPS (0055) — cada fila persiste de
// inmediato (igual que activarCups/desactivarCups), independiente del
// botón "Guardar" del resto de Datos básicos de la clínica. Restringido a
// administrador porque el RLS de clinica_servicios_habilitados exige
// es_admin(), mismo nivel que fn_actualizar_datos_basicos_clinica.

export type { ServicioHabilitado };

export async function agregarServicioHabilitado(
  practicaMedicaId: string,
  codigoHabilitacion: string | null,
): Promise<ServicioHabilitado> {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }
  if (!practicaMedicaId) throw new Error("Selecciona una práctica médica.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinica_servicios_habilitados")
    .insert({
      clinica_id: usuario.clinica_id,
      practica_medica_id: practicaMedicaId,
      codigo_habilitacion: codigoHabilitacion?.trim() || null,
      created_by: usuario.id,
    })
    .select(SERVICIO_HABILITADO_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Esa práctica médica ya está en la lista.");
    throw new Error("No se pudo agregar el servicio habilitado.");
  }

  revalidatePath("/parametros");
  return data as unknown as ServicioHabilitado;
}

export async function actualizarCodigoServicioHabilitado(id: string, codigoHabilitacion: string | null) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .update({ codigo_habilitacion: codigoHabilitacion?.trim() || null })
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) throw new Error("No se pudo actualizar el código.");

  revalidatePath("/parametros");
}

export async function eliminarServicioHabilitado(id: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .delete()
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) throw new Error("No se pudo eliminar el servicio habilitado.");

  revalidatePath("/parametros");
}
