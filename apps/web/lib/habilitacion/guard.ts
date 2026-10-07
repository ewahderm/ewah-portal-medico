// Chequeo de acceso de TODA server action de Habilitación (§3.1). Sin
// "use server" (no debe ser invocable desde el cliente) — solo lo importan
// otros módulos de servidor. Compone los dos helpers ya existentes en vez de
// reimplementarlos:
//   - requirePermiso('habilitacion', permiso): RBAC (deja pasar al admin).
//   - requireEntitlement('habilitacion', 'gestion'): plan Pro. Necesario
//     aparte porque has_permission() no mira el plan.
// Es conveniencia: la defensa real está en las políticas RLS y RPC (0061).

import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { FEATURE_GESTION, MODULO_HABILITACION } from "@/lib/habilitacion/constantes";

export type PermisoHabilitacion = "VIEW" | "CREATE" | "EDIT" | "VOID" | "APPROVE" | "EXPORT";

export async function requireHabilitacion(permiso: PermisoHabilitacion, opciones: { gestion: boolean }) {
  const check = await requirePermiso(MODULO_HABILITACION, permiso);
  if (!check.ok) return check;

  if (opciones.gestion) {
    const plan = await requireEntitlement(MODULO_HABILITACION, FEATURE_GESTION);
    if (!plan.ok) {
      return { ok: false as const, error: "Esta función de Habilitación está disponible en el plan Pro." };
    }
  }
  return check;
}
