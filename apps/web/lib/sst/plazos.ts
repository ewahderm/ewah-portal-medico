// Estado de los plazos de un evento (reporte e investigación). Puro: las
// fechas límite las calcula la BD (0073, con festivos); aquí solo se
// comparan con hoy para el semáforo.

import { diasHasta } from "@/lib/habilitacion/ruta";
import type { Semaforo } from "@/lib/habilitacion/semaforo";

export type EventoPlazos = {
  tipo_evento: string;
  gravedad: string | null;
  reportado_arl: boolean;
  reportado_eps: boolean;
  reportado_mintrabajo: boolean;
  fecha_limite_reporte: string | null;
  fecha_limite_investigacion: string | null;
  cerrado: boolean;
};

export type Pendiente = { clave: "arl" | "eps" | "mintrabajo" | "investigacion"; texto: string; semaforo: Semaforo; dias: number };

function semaforo(dias: number): Semaforo {
  return dias <= 1 ? "rojo" : dias <= 7 ? "ambar" : "verde";
}

function plazo(nombre: string, limite: string, hoy: string): { texto: string; dias: number } {
  const dias = diasHasta(limite, hoy);
  if (dias < 0) return { texto: `${nombre}: venció hace ${-dias} día${dias === -1 ? "" : "s"}`, dias };
  if (dias === 0) return { texto: `${nombre}: vence hoy`, dias };
  return { texto: `${nombre}: vence en ${dias} día${dias === 1 ? "" : "s"}`, dias };
}

// Lo que falta por hacer en un evento, el más urgente primero. Los
// incidentes no se reportan a la ARL (no hay lesión), pero sí se investigan.
export function pendientesEvento(e: EventoPlazos, investigacionCerrada: boolean, hoy: string): Pendiente[] {
  if (e.cerrado) return [];
  const out: Pendiente[] = [];
  const lesion = e.tipo_evento !== "incidente";
  if (lesion && e.fecha_limite_reporte) {
    if (!e.reportado_arl) {
      const p = plazo("Reportar a la ARL", e.fecha_limite_reporte, hoy);
      out.push({ clave: "arl", ...p, semaforo: semaforo(p.dias) });
    }
    if (!e.reportado_eps) {
      const p = plazo("Reportar a la EPS", e.fecha_limite_reporte, hoy);
      out.push({ clave: "eps", ...p, semaforo: semaforo(p.dias) });
    }
    if ((e.gravedad === "grave" || e.gravedad === "mortal") && !e.reportado_mintrabajo) {
      const p = plazo("Reportar a MinTrabajo", e.fecha_limite_reporte, hoy);
      out.push({ clave: "mintrabajo", ...p, semaforo: semaforo(p.dias) });
    }
  }
  if (!investigacionCerrada && e.fecha_limite_investigacion) {
    const p = plazo("Investigar", e.fecha_limite_investigacion, hoy);
    out.push({ clave: "investigacion", ...p, semaforo: p.dias <= 3 ? "rojo" : p.dias <= 7 ? "ambar" : "verde" });
  }
  return out.sort((a, b) => a.dias - b.dias);
}
