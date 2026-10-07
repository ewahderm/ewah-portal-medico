// Estado de la evaluación médica periódica de una persona (Res. 1843 de
// 2025). Puro: la fecha del próximo examen la calcula la BD
// (fn_sst_estado_personas) con el último examen y el profesiograma.

import { diasHasta } from "@/lib/habilitacion/ruta";
import type { Semaforo } from "@/lib/habilitacion/semaforo";

export type EstadoExamen = { semaforo: Semaforo; texto: string };

export function estadoExamen(
  p: { ultimo_examen: string | null; proximo_examen: string | null; periodicidad_meses: number | null; cargo_id: string | null },
  hoy: string,
): EstadoExamen {
  if (!p.ultimo_examen) return { semaforo: "rojo", texto: "Sin examen de ingreso o periódico registrado en RRHH" };
  if (!p.cargo_id) return { semaforo: "por_confirmar", texto: "Sin cargo en RRHH: no sabemos cada cuánto repetirlo" };
  if (!p.periodicidad_meses || !p.proximo_examen) return { semaforo: "por_confirmar", texto: "Define la periodicidad del cargo" };
  const dias = diasHasta(p.proximo_examen, hoy);
  if (dias < 0) return { semaforo: "rojo", texto: `Periódico vencido hace ${-dias} día${dias === -1 ? "" : "s"}` };
  if (dias <= 30) return { semaforo: "ambar", texto: `Periódico en ${dias} día${dias === 1 ? "" : "s"}` };
  return { semaforo: "verde", texto: "Al día" };
}

export const TIPOS_CAPACITACION = [
  { value: "induccion", label: "Inducción" },
  { value: "reinduccion", label: "Reinducción" },
  { value: "capacitacion", label: "Capacitación" },
  { value: "simulacro", label: "Simulacro" },
  { value: "charla", label: "Charla" },
] as const;

export const EPP_SALUD = [
  "Guantes de nitrilo",
  "Guantes de látex",
  "Tapabocas quirúrgico",
  "Respirador N95",
  "Gafas de protección",
  "Careta",
  "Bata antifluido",
  "Gorro",
  "Polainas",
  "Delantal plomado",
] as const;
