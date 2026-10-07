import Link from "next/link";
import {
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  LockIcon,
  MapPinIcon,
  SparklesIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { EstadoPaso, PasoRuta } from "@/lib/habilitacion/ruta";

// Una dimensión por canal visual (lección de la Agenda): el CÍRCULO dice el
// estado (color + ícono) y el TEXTO lo repite — el color nunca es la única
// señal. Horizontal en escritorio, vertical en móvil.
const ESTILO: Record<EstadoPaso, { icono: LucideIcon | null; circulo: string; etiqueta: string }> = {
  completo: { icono: CheckIcon, circulo: "bg-primary text-primary-foreground border-primary", etiqueta: "Completo" },
  en_curso: { icono: CircleDotIcon, circulo: "border-primary text-accent-foreground bg-accent", etiqueta: "En curso" },
  alerta: { icono: TriangleAlertIcon, circulo: "border-amber-600 bg-amber-50 text-amber-700", etiqueta: "Revisar" },
  pendiente: { icono: null, circulo: "border-foreground/30 bg-background text-foreground", etiqueta: "Pendiente" },
  bloqueado: { icono: LockIcon, circulo: "border-border bg-muted text-muted-foreground", etiqueta: "Bloqueado" },
  requiere_pro: { icono: SparklesIcon, circulo: "border-border bg-muted text-muted-foreground", etiqueta: "Plan Pro" },
  proximamente: { icono: ClockIcon, circulo: "border-dashed border-border bg-background text-muted-foreground", etiqueta: "Próximamente" },
  actual: { icono: MapPinIcon, circulo: "border-[var(--ewah-navy)] bg-[var(--ewah-navy)] text-white", etiqueta: "Estás aquí" },
};

export function RutaPasos({ pasos }: { pasos: PasoRuta[] }) {
  return (
    <ol className="grid grid-cols-1 gap-0 md:grid-cols-6 md:gap-2" aria-label="Ruta de habilitación">
      {pasos.map((p, i) => {
        const e = ESTILO[p.estado];
        const Icono = e.icono;
        const enlazable = p.href && !["bloqueado", "proximamente", "actual"].includes(p.estado);
        const ultimo = i === pasos.length - 1;
        const contenido = (
          <>
            <div className="flex flex-col items-center md:w-full md:flex-row">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                  e.circulo,
                )}
                aria-hidden="true"
              >
                {Icono ? <Icono className="size-4" /> : p.numero}
              </span>
              {/* Conector: vertical en móvil, horizontal en escritorio. */}
              {!ultimo ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "my-1 h-full min-h-6 w-0.5 flex-1 rounded md:mx-2 md:my-0 md:h-0.5 md:min-h-0 md:w-auto",
                    p.estado === "completo" ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <div className="min-w-0 pb-4 md:pt-3 md:pb-0">
              <p className="text-xs text-muted-foreground">
                Paso {p.numero} · <span className="font-medium">{e.etiqueta}</span>
              </p>
              <p className={cn("text-sm font-semibold", enlazable && "group-hover:text-accent-foreground")}>{p.titulo}</p>
              <p className="text-xs text-muted-foreground">{p.detalle}</p>
            </div>
          </>
        );
        return (
          <li key={p.clave} className={cn(p.estado === "proximamente" && "opacity-70")}>
            {enlazable ? (
              <Link
                href={p.href!}
                className="group flex gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex-col md:gap-0"
              >
                {contenido}
              </Link>
            ) : (
              <div className="flex gap-3 md:flex-col md:gap-0" aria-disabled={p.estado === "proximamente" || undefined}>
                {contenido}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
