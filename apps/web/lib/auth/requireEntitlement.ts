import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";

export async function requireEntitlement(moduloCode: string, featureCode?: string) {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };

  const supabase = await createClient();
  const { data: tieneEntitlement } = await supabase.rpc("has_entitlement", {
    modulo_code: moduloCode,
    feature_code: featureCode ?? null,
  });

  if (!tieneEntitlement) {
    return { ok: false as const, error: "Esta función requiere un plan superior." };
  }
  return { ok: true as const, usuario };
}
