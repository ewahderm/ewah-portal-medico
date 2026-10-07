"use server";

// Analítica clínica agregada. La RPC (0084) vuelve a validar permisos y
// tenant dentro de la BD; aquí se valida primero para dar un mensaje claro
// en español y no gastar una consulta cuando ya se sabe que no hay acceso.

import { createClient } from "@/lib/supabase/server";
import { accesoAnalitica } from "./acceso";
import {
  construirAnaliticaClinica,
  esRangoFechaValido,
  TEXTO_RANGO_INVALIDO,
  type FilaAnalitica,
  type AnaliticaClinica,
} from "./analitica";

export async function obtenerAnaliticaClinica(desde: string, hasta: string): Promise<AnaliticaClinica | { error: string }> {
  const check = await accesoAnalitica();
  if (!check.ok) return { error: check.error };

  if (!esRangoFechaValido(desde, hasta)) {
    return { error: TEXTO_RANGO_INVALIDO };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reportes_analitica_clinica", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    console.error("[reportes] fn_reportes_analitica_clinica", error);
    return { error: "No se pudo cargar la analítica de la clínica." };
  }
  if (!data) return { error: "La consulta de analítica no devolvió datos." };
  try {
    return construirAnaliticaClinica(data as FilaAnalitica[]);
  } catch (e) {
    console.error("[reportes] construirAnaliticaClinica", e);
    return { error: "No se pudo cargar la analítica de la clínica." };
  }
}
