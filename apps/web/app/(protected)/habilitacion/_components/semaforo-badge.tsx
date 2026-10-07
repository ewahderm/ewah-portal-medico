import { CircleCheckIcon, CircleDashedIcon, ClockIcon, OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { Semaforo } from "@/lib/habilitacion/semaforo";

// Insignia del semáforo (§5.4): color + ícono + texto; el color nunca es la
// única señal. Una sola tabla para calendario, obligaciones y resumen.
export const ESTILO_SEMAFORO: Record<Semaforo, { icono: LucideIcon; clase: string; color: string }> = {
  rojo: { icono: OctagonAlertIcon, clase: "border-destructive/30 bg-destructive/10 text-destructive", color: "var(--destructive)" },
  ambar: { icono: TriangleAlertIcon, clase: "border-amber-300 bg-amber-50 text-amber-800", color: "oklch(0.75 0.15 70)" },
  verde: { icono: ClockIcon, clase: "border-emerald-200 bg-emerald-50 text-emerald-800", color: "oklch(0.6 0.13 160)" },
  gris: { icono: CircleCheckIcon, clase: "border-border bg-muted text-muted-foreground", color: "var(--muted-foreground)" },
  por_confirmar: { icono: CircleDashedIcon, clase: "border-dashed border-foreground/30 bg-background text-muted-foreground", color: "var(--muted-foreground)" },
};

export function SemaforoBadge({ semaforo, etiqueta, className }: { semaforo: Semaforo; etiqueta: string; className?: string }) {
  const e = ESTILO_SEMAFORO[semaforo];
  const Icono = e.icono;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", e.clase, className)}>
      <Icono className="size-3" aria-hidden /> {etiqueta}
    </span>
  );
}
