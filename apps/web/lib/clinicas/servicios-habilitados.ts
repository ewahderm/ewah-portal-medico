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

// Agrega una práctica concreta (0056) — si su servicio REPS padre todavía
// no está en la lista de la clínica, lo crea en el mismo paso (sin código
// de habilitación; el admin lo escribe después en la fila del servicio).
// Devuelve la fila del servicio completa para reemplazarla en el cliente.
export async function agregarPracticaServicio(practicaServicioId: string): Promise<ServicioHabilitado> {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }
  if (!practicaServicioId) throw new Error("Selecciona una práctica.");

  const supabase = await createClient();
  const { data: practica } = await supabase
    .from("practicas_servicio")
    .select("practica_medica_id")
    .eq("id", practicaServicioId)
    .single();
  if (!practica) throw new Error("Práctica no encontrada.");

  let { data: servicio } = await supabase
    .from("clinica_servicios_habilitados")
    .select("id")
    .eq("clinica_id", usuario.clinica_id)
    .eq("practica_medica_id", practica.practica_medica_id)
    .maybeSingle();
  if (!servicio) {
    const { data: creado, error } = await supabase
      .from("clinica_servicios_habilitados")
      .insert({
        clinica_id: usuario.clinica_id,
        practica_medica_id: practica.practica_medica_id,
        created_by: usuario.id,
      })
      .select("id")
      .single();
    if (error || !creado) throw new Error("No se pudo agregar el servicio habilitado.");
    servicio = creado;
  }

  const { error } = await supabase.from("clinica_practicas_servicio").insert({
    clinica_id: usuario.clinica_id,
    servicio_habilitado_id: servicio.id,
    practica_servicio_id: practicaServicioId,
    created_by: usuario.id,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Esa práctica ya está en la lista.");
    throw new Error("No se pudo agregar la práctica.");
  }

  const { data, error: errorLectura } = await supabase
    .from("clinica_servicios_habilitados")
    .select(SERVICIO_HABILITADO_SELECT)
    .eq("id", servicio.id)
    .single();
  if (errorLectura || !data) throw new Error("No se pudo leer el servicio actualizado.");

  revalidatePath("/parametros");
  return data as unknown as ServicioHabilitado;
}

export async function eliminarPracticaServicio(id: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar esta configuración.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinica_practicas_servicio")
    .delete()
    .eq("id", id)
    .eq("clinica_id", usuario.clinica_id);
  if (error) throw new Error("No se pudo quitar la práctica.");

  revalidatePath("/parametros");
}
