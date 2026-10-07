"use server";

// Acciones de los reportes regulatorios. Cada una valida su propio acceso
// al inicio: una acción del servidor es un endpoint público y no puede
// confiar en que la pantalla haya ocultado la pestaña.

import { esRangoFechaValido, TEXTO_RANGO_INVALIDO } from "./analitica";
import { accesoInvima, accesoNomina } from "./acceso";
import { cargarComisionesNomina, cargarReporteInvima } from "./consultas-regulatorias";
import type { InsumoInvima } from "./invima";
import { agruparComisionesNomina, type ComisionNomina } from "./nomina";

export async function obtenerReporteInvima(): Promise<InsumoInvima[] | { error: string }> {
  const check = await accesoInvima();
  if (!check.ok) return { error: check.error };
  try {
    return await cargarReporteInvima(check.usuario.clinica_id);
  } catch (e) {
    console.error("[reportes] reporte INVIMA", e);
    return { error: "No se pudo cargar el reporte INVIMA." };
  }
}

export async function obtenerComisionesNomina(desde: string, hasta: string): Promise<ComisionNomina[] | { error: string }> {
  const check = await accesoNomina();
  if (!check.ok) return { error: check.error };
  if (!esRangoFechaValido(desde, hasta)) {
    return { error: TEXTO_RANGO_INVALIDO };
  }
  try {
    const filas = await cargarComisionesNomina(check.usuario.clinica_id, desde, hasta);
    return agruparComisionesNomina(filas);
  } catch (e) {
    console.error("[reportes] comisiones de nómina", e);
    return { error: "No se pudieron consultar las comisiones de nómina." };
  }
}
