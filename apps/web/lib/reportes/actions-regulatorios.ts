"use server";

// Acciones de los reportes regulatorios. Cada una valida su propio acceso
// al inicio: una acción del servidor es un endpoint público y no puede
// confiar en que la pantalla haya ocultado la pestaña.

import { esRangoFechaValido } from "./analitica";
import { accesoInvima, accesoNomina } from "./acceso";
import { cargarComisionesNomina, cargarReporteInvima } from "./consultas-regulatorias";
import type { InsumoInvima } from "./invima";
import { agruparComisionesNomina, type ComisionNomina } from "./nomina";

export async function obtenerReporteInvima(): Promise<InsumoInvima[]> {
  const check = await accesoInvima();
  if (!check.ok) throw new Error(check.error);
  return cargarReporteInvima(check.usuario.clinica_id);
}

export async function obtenerComisionesNomina(desde: string, hasta: string): Promise<ComisionNomina[]> {
  const check = await accesoNomina();
  if (!check.ok) throw new Error(check.error);
  if (!esRangoFechaValido(desde, hasta)) {
    throw new Error("Elige un rango válido de hasta 366 días.");
  }
  const filas = await cargarComisionesNomina(check.usuario.clinica_id, desde, hasta);
  return agruparComisionesNomina(filas);
}
