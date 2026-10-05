"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional } from "@/lib/forms/opcional";
import { enviarSolicitudCambioPlan } from "@/lib/email/suscripcionCorreo";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE") {
  return requirePermisoBase("suscripcion", permiso);
}

export async function solicitarCambioPlan(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const planSolicitado = String(formData.get("planCodigo") ?? "").trim();
  if (!planSolicitado) return { error: "Selecciona el plan que quieres solicitar." };

  const mensaje = campoOpcional(formData, "mensaje");

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const [{ data: clinica }, { data: planNuevo }] = await Promise.all([
    supabase
      .from("clinicas")
      .select("nombre, planes(nombre)")
      .eq("id", check.usuario.clinica_id)
      .maybeSingle(),
    supabase.from("planes").select("nombre").eq("codigo", planSolicitado).maybeSingle(),
  ]);

  if (!clinica || !planNuevo) return { error: "No se pudo procesar la solicitud." };

  await enviarSolicitudCambioPlan({
    nombreClinica: clinica.nombre,
    nombreSolicitante: check.usuario.nombre,
    emailSolicitante: check.usuario.email,
    planActual: (clinica.planes as unknown as { nombre: string } | null)?.nombre ?? "—",
    planSolicitado: planNuevo.nombre,
    mensaje,
  });

  return null;
}
