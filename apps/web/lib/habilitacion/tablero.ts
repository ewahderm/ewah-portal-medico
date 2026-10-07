// Indicadores del tablero (§5.6, requerimiento §6) que no salen directo de
// una RPC. Puro, sin E/S.

import { porConfirmar } from "@/lib/habilitacion/semaforo";
import type { FilaProgreso, ObligacionClinica, Ocurrencia } from "@/lib/habilitacion/tipos";

export type ConteoPorEstandar = { estandar_codigo: string; cumple: number; no_cumple: number; no_aplica: number; pendientes: number };

// Suma las filas sede × servicio × estándar por estándar (todas las sedes).
export function estandaresDeProgreso(filas: FilaProgreso[]): ConteoPorEstandar[] {
  const mapa = new Map<string, ConteoPorEstandar>();
  for (const f of filas) {
    const c = mapa.get(f.estandar_codigo) ?? { estandar_codigo: f.estandar_codigo, cumple: 0, no_cumple: 0, no_aplica: 0, pendientes: 0 };
    c.cumple += f.cumple;
    c.no_cumple += f.no_cumple;
    c.no_aplica += f.no_aplica;
    c.pendientes += f.sin_evaluar;
    mapa.set(f.estandar_codigo, c);
  }
  return [...mapa.values()];
}

export function sumarProgreso(filas: FilaProgreso[]) {
  return {
    reverificar: filas.reduce((n, f) => n + f.reverificar, 0),
    planesAbiertos: filas.reduce((n, f) => n + f.planes_abiertos, 0),
  };
}

// Disciplina de reporte: de lo que vencía en el último año (obligaciones
// activas y confirmadas), cuánto se presentó a tiempo. "No aplica en el
// periodo" no cuenta; lo pendiente con fecha pasada cuenta como no a tiempo.
export function disciplinaReporte(
  config: ObligacionClinica[],
  ocurrencias: Pick<Ocurrencia, "obligacion_id" | "estado" | "fecha_limite" | "fecha_presentacion">[],
  hoy: string,
): { aTiempo: number; total: number; porcentaje: number | null } {
  const porId = new Map(config.map((c) => [c.obligacion_id, c]));
  let aTiempo = 0;
  let total = 0;
  for (const o of ocurrencias) {
    const c = porId.get(o.obligacion_id);
    if (!c || !c.activa || porConfirmar(c) || o.fecha_limite >= hoy) continue;
    if (o.estado === "presentado") {
      total++;
      if (o.fecha_presentacion && o.fecha_presentacion <= o.fecha_limite) aTiempo++;
    } else if (o.estado === "pendiente") {
      total++;
    }
  }
  return { aTiempo, total, porcentaje: total === 0 ? null : Math.round((aTiempo / total) * 100) };
}

export function contarPorConfirmar(config: ObligacionClinica[]): number {
  return config.filter((c) => c.activa && porConfirmar(c)).length;
}
