// Estados de una cita: ícono, color y nombre. Una sola tabla para el
// calendario de escritorio, su leyenda y la lista del día en celular.
import { Clock, CircleCheck, CheckCheck, TriangleAlert, X, RotateCcw, Lock, type LucideIcon } from "lucide-react";
import { ESTADO_LABEL } from "./tipos";

// Insignia de estado (ícono en círculo) que se dibuja sobre cada evento y
// se reutiliza tal cual en la leyenda de "Estado" — una sola tabla para no
// duplicar la definición entre ambos lugares. El FONDO/borde del evento ya
// no depende del estado (ver eventPropGetter más abajo): esa señal ahora es
// 100% profesional, y el estado se comunica solo por esta insignia.
export type EstadoInfo = {
  clave: string;
  label: string;
  Icono: LucideIcon;
  bgInsignia: string;
  colorIcono: string;
};

export const ESTADOS_LEYENDA: EstadoInfo[] = [
  { clave: "agendada", label: ESTADO_LABEL.agendada, Icono: Clock, bgInsignia: "var(--ewah-cyan)", colorIcono: "var(--ewah-navy)" },
  { clave: "confirmada", label: ESTADO_LABEL.confirmada, Icono: CircleCheck, bgInsignia: "var(--ewah-cyan-dark)", colorIcono: "white" },
  { clave: "atendida", label: ESTADO_LABEL.atendida, Icono: CheckCheck, bgInsignia: "var(--ewah-navy)", colorIcono: "white" },
  { clave: "no_asistio", label: ESTADO_LABEL.no_asistio, Icono: TriangleAlert, bgInsignia: "oklch(0.75 0.15 70)", colorIcono: "var(--ewah-navy)" },
  { clave: "cancelada", label: ESTADO_LABEL.cancelada, Icono: X, bgInsignia: "var(--destructive)", colorIcono: "white" },
  { clave: "reprogramada", label: ESTADO_LABEL.reprogramada, Icono: RotateCcw, bgInsignia: "var(--ewah-slate)", colorIcono: "white" },
  { clave: "bloqueo", label: "Bloqueo", Icono: Lock, bgInsignia: "var(--ewah-navy)", colorIcono: "white" },
];

export const ESTADOS_POR_CLAVE: Record<string, EstadoInfo> = Object.fromEntries(
  ESTADOS_LEYENDA.map((e) => [e.clave, e]),
);
