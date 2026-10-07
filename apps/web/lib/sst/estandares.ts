// Calificación de la autoevaluación de estándares mínimos (Res. 0312 de
// 2019). Espejo de fn_sst_autoevaluacion_cierre (0078): la BD es la que
// fija el puntaje al cerrar; esto solo muestra el avance mientras se
// califica. Lógica pura: sin "use server".

import { CICLOS, type Ciclo } from "@/lib/sst/documentos-catalogo";

export const ESTADOS_ITEM = [
  { value: "pendiente", label: "Sin calificar" },
  { value: "cumple", label: "Cumple" },
  { value: "no_cumple", label: "No cumple" },
  { value: "no_aplica", label: "No aplica" },
] as const;
export type EstadoItem = (typeof ESTADOS_ITEM)[number]["value"];

export type NivelEstandares = "critico" | "moderado" | "aceptable";

export const NIVELES_ESTANDARES: Record<NivelEstandares, { label: string; que: string; tono: "rojo" | "ambar" | "verde" }> = {
  critico: {
    label: "Crítico",
    que: "Plan de mejoramiento inmediato, reportarlo a la ARL y hacerle seguimiento; puede haber visita del Ministerio del Trabajo.",
    tono: "rojo",
  },
  moderado: {
    label: "Moderadamente aceptable",
    que: "Plan de mejoramiento y seguimiento de la ARL; reportarlo según lo que indique la norma.",
    tono: "ambar",
  },
  aceptable: {
    label: "Aceptable",
    que: "Mantener la calificación e incluir las mejoras en el plan anual.",
    tono: "verde",
  },
};

export function nivelDe(puntaje: number): NivelEstandares {
  if (puntaje < 60) return "critico";
  if (puntaje <= 85) return "moderado";
  return "aceptable";
}

export type ItemCalificado = { estado: EstadoItem; peso: number };

export type Avance = {
  total: number;
  calificados: number;
  pendientes: number;
  // Puntaje si se cerrara hoy contando lo pendiente como no cumplido.
  puntaje: number;
  nivel: NivelEstandares;
};

export function avance(items: ItemCalificado[]): Avance {
  const pesoTotal = items.reduce((s, i) => s + i.peso, 0);
  const logrado = items.filter((i) => i.estado === "cumple" || i.estado === "no_aplica").reduce((s, i) => s + i.peso, 0);
  const pendientes = items.filter((i) => i.estado === "pendiente").length;
  const puntaje = pesoTotal > 0 ? Math.round((logrado / pesoTotal) * 10000) / 100 : 0;
  return { total: items.length, calificados: items.length - pendientes, pendientes, puntaje, nivel: nivelDe(puntaje) };
}

// Puntaje por ciclo PHVA (sobre el peso de los ítems de ese ciclo).
export function porCiclo(items: (ItemCalificado & { ciclo: Ciclo })[]): Record<Ciclo, { logrado: number; posible: number }> {
  const r = Object.fromEntries(CICLOS.map((c) => [c.value, { logrado: 0, posible: 0 }])) as Record<Ciclo, { logrado: number; posible: number }>;
  for (const i of items) {
    r[i.ciclo].posible += i.peso;
    if (i.estado === "cumple" || i.estado === "no_aplica") r[i.ciclo].logrado += i.peso;
  }
  for (const c of CICLOS) {
    r[c.value].logrado = Math.round(r[c.value].logrado * 100) / 100;
    r[c.value].posible = Math.round(r[c.value].posible * 100) / 100;
  }
  return r;
}
