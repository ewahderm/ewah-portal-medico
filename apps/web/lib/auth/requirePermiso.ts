import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";

export async function requirePermiso(moduloCode: string, permisoCode: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tienePermiso } = await supabase.rpc("has_permission", {
    modulo_code: moduloCode,
    permiso_code: permisoCode,
  });

  if (!tienePermiso) {
    return { ok: false as const, error: "No tienes permiso para esta acción." };
  }
  return { ok: true as const, usuario };
}
