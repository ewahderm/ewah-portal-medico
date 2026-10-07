import { CircleCheckIcon, CircleDashedIcon, CircleXIcon } from "lucide-react";
import { cn } from "cn";
import type { EstadoDeclaracion } from "@/lib/habilitacion/constantes";

// Estado de declaración de un servicio (§5.6): color + ícono + texto (el
// color nunca es la única señal).
export function EstadoDeclaracionBadge({
  estado,
  noCumple,
  pendientes,
  className,
}: {
  estado: EstadoDeclaracion;
  noCumple: number;
  pendientes: number;
  className?: string;
}) {
  const [Icono, texto, estilo] =
    estado === "listo"
      ? [CircleCheckIcon, "Listo para declarar", "bg-emerald-50 text-emerald-800 border-emerald-200"]
      : estado === "con_incumplimientos"
        ? [CircleXIcon, `${noCumple} No cumple`, "bg-destructive/10 text-destructive border-destructive/30"]
        : [CircleDashedIcon, `${pendientes} sin evaluar`, "bg-muted text-muted-foreground border-border"];
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", estilo, className)}>
      <Icono className="size-3.5" aria-hidden /> {texto}
    </span>
  );
}
