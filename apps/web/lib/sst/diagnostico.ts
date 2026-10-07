// Diagnóstico de la clínica (perfil + conteo → grupo). Sin "use server":
// lo usan los Server Components de varias secciones.

import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";
import { getConteoTrabajadores, getPerfilSst, type ConteoTrabajadores, type PerfilSst } from "@/lib/sst/consultas";
import { diagnosticar, type Diagnostico } from "@/lib/sst/grupo";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// La actividad económica vive en clinicas (0080). Se filtra por la clínica
// del usuario: un super admin ve todas las clínicas por RLS y un
// .maybeSingle() sin filtro fallaría con más de una fila.
async function getCodigoActividadClinica(supabase: Supabase): Promise<string | null> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;
  const { data, error } = await supabase
    .from("clinicas")
    .select("codigo_actividad_economica")
    .eq("id", usuario.clinica_id)
    .maybeSingle();
  if (error) console.error("[sst] actividad económica de la clínica", error);
  return data?.codigo_actividad_economica ?? null;
}

export async function getDiagnostico(
  supabase: Supabase,
): Promise<{ perfil: PerfilSst | null; conteo: ConteoTrabajadores | null; d: Diagnostico | null; errorPerfil: boolean }> {
  const [{ perfil, error: errorPerfil }, conteo, codigoActividad] = await Promise.all([
    getPerfilSst(supabase),
    getConteoTrabajadores(supabase),
    getCodigoActividadClinica(supabase),
  ]);
  // Si el perfil no se pudo leer NO se diagnostica con uno vacío (diría
  // "empleador sin actividad" y llevaría a un grupo equivocado).
  const d = conteo && !errorPerfil
    ? diagnosticar({
        modo: perfil?.modo ?? "empleador",
        dependientes: conteo.dependientes,
        contratistas: conteo.contratistas,
        sinCategoria: conteo.sin_categoria,
        otros: perfil?.otros_trabajadores ?? 0,
        excluyeContratistas: perfil?.excluye_contratistas ?? false,
        codigoActividad,
        claseClinica: conteo.clase_clinica,
        claseCargosMax: conteo.clase_cargos_max,
      })
    : null;
  return { perfil, conteo, d, errorPerfil };
}
