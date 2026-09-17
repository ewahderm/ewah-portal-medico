import { createClient } from "@supabase/supabase-js";

// Cliente con service_role — bypassa RLS. Solo importar en código de
// servidor (route handlers, server actions). NUNCA en un componente cliente.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
