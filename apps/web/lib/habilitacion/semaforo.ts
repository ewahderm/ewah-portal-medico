// Semáforo de fechas límite (§5.4) y estado calculado de una ocurrencia.
// Una sola tabla reutilizada por calendario, obligaciones, resumen y (F9)
// correo. "Vencido" y "extemporáneo" NO se guardan: se calculan. Puro.

import { diasHasta } from "@/lib/habilitacion/ruta";
import type { ObligacionClinica, Ocurrencia } from "@/lib/habilitacion/tipos";

export const UMBRALES_SEMAFORO = { rojo: 7, ambar: 30 } as const;

export type Semaforo = "rojo" | "ambar" | "verde" | "gris" | "por_confirmar";

export type EstadoOcurrencia = {
  semaforo: Semaforo;
  etiqueta: string; // "Vence en 5 días", "Vencida hace 3 días", "Presentada a tiempo"…
  vencida: boolean;
  extemporanea: boolean;
  dias: number;
};

export function estadoOcurrencia(
  o: Pick<Ocurrencia, "estado" | "fecha_limite" | "fecha_presentacion">,
  hoy: string,
  porConfirmar = false,
): EstadoOcurrencia {
  const dias = diasHasta(o.fecha_limite, hoy);
  if (o.estado === "presentado") {
    const extemporanea = !!o.fecha_presentacion && o.fecha_presentacion > o.fecha_limite;
    return { semaforo: "gris", etiqueta: extemporanea ? "Presentada fuera de plazo" : "Presentada", vencida: false, extemporanea, dias };
  }
  if (o.estado === "no_aplica_periodo") return { semaforo: "gris", etiqueta: "No aplica en este periodo", vencida: false, extemporanea: false, dias };
  if (o.estado === "anulado") return { semaforo: "gris", etiqueta: "Anulada", vencida: false, extemporanea: false, dias };
  const vencida = dias < 0;
  const etiqueta =
    dias < 0 ? `Vencida hace ${-dias} día${dias === -1 ? "" : "s"}` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
  if (porConfirmar) return { semaforo: "por_confirmar", etiqueta: `${etiqueta} · por confirmar`, vencida, extemporanea: false, dias };
  const semaforo: Semaforo = dias <= UMBRALES_SEMAFORO.rojo ? "rojo" : dias <= UMBRALES_SEMAFORO.ambar ? "ambar" : "verde";
  return { semaforo, etiqueta, vencida, extemporanea: false, dias };
}

// Una obligación está "por confirmar" mientras su activación por defecto lo
// sea (ST002, SIVIGILA) o pida confirmar con el asesor (RIPS, D6) y el
// usuario no la haya confirmado. No genera alerta roja (AC2 HU-5.1).
export function porConfirmar(c: Pick<ObligacionClinica, "confirmada" | "hab_obligaciones_catalogo">): boolean {
  const cat = c.hab_obligaciones_catalogo;
  return !c.confirmada && (cat.activacion_default === "por_confirmar" || cat.requiere_confirmacion_asesor);
}

// Para el paso 5 de la ruta y "Lo urgente": solo cuentan las obligaciones
// activas y confirmadas (o que no piden confirmación).
export function resumenObligaciones(
  config: ObligacionClinica[],
  pendientes: Pick<Ocurrencia, "obligacion_id" | "estado" | "fecha_limite" | "fecha_presentacion">[],
  hoy: string,
) {
  const porId = new Map(config.map((c) => [c.obligacion_id, c]));
  let vencidas = 0;
  let proximas = 0;
  for (const o of pendientes) {
    const c = porId.get(o.obligacion_id);
    if (!c || !c.activa || porConfirmar(c) || o.estado !== "pendiente") continue;
    const e = estadoOcurrencia(o, hoy);
    if (e.vencida) vencidas++;
    else if (e.dias <= UMBRALES_SEMAFORO.rojo) proximas++;
  }
  return { vencidas, proximas, activas: config.filter((c) => c.activa).length };
}
