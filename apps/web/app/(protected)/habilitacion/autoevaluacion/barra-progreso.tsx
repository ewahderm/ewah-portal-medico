import { cn } from "cn";

// Barra de avance con su número en texto para lectores de pantalla (el
// color nunca es la única señal). La transición de ancho respeta
// prefers-reduced-motion.
export function BarraProgreso({ valor, etiqueta, delgada }: { valor: number; etiqueta?: string; delgada?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div className="space-y-1">
      {etiqueta ? <p className="text-right text-xs text-muted-foreground">{etiqueta}</p> : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label={etiqueta ?? `${v} %`}
        className={cn("w-full overflow-hidden rounded-full bg-muted", delgada ? "h-1" : "h-2")}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
