"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";
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

// Sin pasarela de pago todavía — este atajo deja probar el gating real
// (Anexos/Inventario/Campañas) sin pedir un cambio manual por SQL cada
// vez. Restringido a administrador y a la PROPIA clínica: la función de
// base de datos (security definer) vuelve a validar ambas cosas, esto
// solo da un mensaje claro antes de llegar ahí.
export async function cambiarPlanPrueba(planCodigo: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un administrador puede cambiar el plan de la clínica.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cambiar_plan_propia_clinica", {
    p_plan_codigo: planCodigo,
  });
  if (error) throw new Error("No se pudo cambiar el plan.");

  revalidatePath("/suscripcion");
  revalidatePath("/dashboard");
}
