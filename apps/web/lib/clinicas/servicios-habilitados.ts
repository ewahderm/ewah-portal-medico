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
import type { ResultadoAccion } from "@/lib/forms/resultado";

// Lista de servicios habilitados ante REPS (0055, por sede desde 0061) —
// cada fila persiste de inmediato (igual que activarCups/desactivarCups),
// independiente del botón "Guardar" del resto de Datos básicos de la
// clínica. Desde Datos básicos sigue siendo solo de administrador (en
// todos los planes); el detalle regulatorio de la misma fila (complejidad,
// modalidades, estado) se edita desde Habilitación.

export type { ServicioHabilitado };

async function requireAdmin() {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { ok: false as const, error: "Solo un administrador puede cambiar esta configuración." };
  }
  return { ok: true as const, usuario };
}

export async function agregarServicioHabilitado(
  practicaMedicaId: string,
  sedeId: string | null,
  codigoHabilitacion: string | null,
): Promise<{ error: string } | { servicio: ServicioHabilitado }> {
  const acceso = await requireAdmin();
  if (!acceso.ok) return { error: acceso.error };
  const usuario = acceso.usuario;
  if (!practicaMedicaId) return { error: "Selecciona un servicio." };

  const supabase = await createClient();
  const { data, error } = await insertarServicioHabilitado<ServicioHabilitado>(
    supabase,
    usuario,
    { practicaMedicaId, sedeId, codigoHabilitacion },
    SERVICIO_HABILITADO_SELECT,
  );
  if (error || !data) {
    return { error: error ? mensajeError(error, "No se pudo agregar el servicio habilitado.") : "No se pudo agregar el servicio habilitado." };
  }

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
  return { servicio: data };
}

export async function actualizarCodigoServicioHabilitado(id: string, codigoHabilitacion: string | null): Promise<ResultadoAccion> {
  const acceso = await requireAdmin();
  if (!acceso.ok) return { error: acceso.error };
  const usuario = acceso.usuario;

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .update({ codigo_habilitacion: codigoHabilitacion?.trim() || null, updated_by: usuario.id })
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) return { error: mensajeError(error, "No se pudo actualizar el código.") };

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
  return {};
}

// Asignar o cambiar la sede de una fila ya creada (p. ej. las creadas antes
// de 0061, que quedaron sin sede).
export async function actualizarSedeServicioHabilitado(id: string, sedeId: string | null): Promise<ResultadoAccion> {
  const acceso = await requireAdmin();
  if (!acceso.ok) return { error: acceso.error };
  const usuario = acceso.usuario;

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .update({ sede_id: sedeId || null, updated_by: usuario.id })
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) return { error: mensajeError(error, "No se pudo cambiar la sede.") };

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
  return {};
}

export async function eliminarServicioHabilitado(id: string): Promise<ResultadoAccion> {
  const acceso = await requireAdmin();
  if (!acceso.ok) return { error: acceso.error };
  const usuario = acceso.usuario;

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_servicios_habilitados")
    .delete()
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) return { error: mensajeError(error, "No se pudo eliminar el servicio habilitado.") };

  revalidatePath("/parametros");
  revalidatePath("/habilitacion", "layout");
  return {};
}
