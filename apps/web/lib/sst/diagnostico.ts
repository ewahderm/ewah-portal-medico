// Diagnóstico de la clínica (perfil + conteo → grupo). Sin "use server":
// lo usan los Server Components de varias secciones.

import { createClient } from "@/lib/supabase/server";
import { getConteoTrabajadores, getPerfilSst, type ConteoTrabajadores, type PerfilSst } from "@/lib/sst/consultas";
import { diagnosticar, type Diagnostico } from "@/lib/sst/grupo";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getDiagnostico(
  supabase: Supabase,
): Promise<{ perfil: PerfilSst | null; conteo: ConteoTrabajadores | null; d: Diagnostico | null }> {
  const [perfil, conteo] = await Promise.all([getPerfilSst(supabase), getConteoTrabajadores(supabase)]);
  const d = conteo
    ? diagnosticar({
        modo: perfil?.modo ?? "empleador",
        dependientes: conteo.dependientes,
        contratistas: conteo.contratistas,
        sinCategoria: conteo.sin_categoria,
        otros: perfil?.otros_trabajadores ?? 0,
        excluyeContratistas: perfil?.excluye_contratistas ?? false,
        codigoActividad: perfil?.codigo_actividad ?? null,
        claseClinica: conteo.clase_clinica,
        claseCargosMax: conteo.clase_cargos_max,
      })
    : null;
  return { perfil, conteo, d };
}
