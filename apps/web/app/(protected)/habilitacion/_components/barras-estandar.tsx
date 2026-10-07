import Link from "next/link";
import { cn } from "cn";
import { ESTANDARES } from "@/lib/habilitacion/constantes";

export type ConteoEstandar = { estandar_codigo: string; cumple: number; no_cumple: number; no_aplica: number; pendientes: number };

// Siete barras por estándar (§5.6) con CSS propio, sin librería de
// gráficos: verde = cumple, rojo = no cumple, gris = pendiente (No aplica
// sale del denominador, igual que el indicador). El número va en texto.
export function BarrasEstandar({ filas, href }: { filas: ConteoEstandar[]; href?: (estandar: string, estado?: string) => string }) {
  const porCodigo = new Map(filas.map((f) => [f.estandar_codigo, f]));
  return (
    <ul className="space-y-3">
      {ESTANDARES.filter((e) => porCodigo.has(e.value)).map((e) => {
        const f = porCodigo.get(e.value)!;
        const base = f.cumple + f.no_cumple + f.pendientes;
        const pct = (n: number) => (base === 0 ? 0 : (n / base) * 100);
        const cumplimiento = base === 0 ? null : Math.round(pct(f.cumple));
        const etiqueta = (
          <span className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{e.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {cumplimiento === null ? "No aplica" : `${cumplimiento} %`}
              {f.no_cumple > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium text-destructive">
                    {f.no_cumple} No cumple
                  </span>
                </>
              ) : null}
              {f.pendientes > 0 ? ` · ${f.pendientes} pendientes` : ""}
            </span>
          </span>
        );
        return (
          <li key={e.value} className="space-y-1">
            {href ? (
              <Link href={href(e.value, f.no_cumple > 0 ? "no_cumple" : undefined)} className="block rounded-sm hover:underline">
                {etiqueta}
              </Link>
            ) : (
              etiqueta
            )}
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${e.label}: ${f.cumple} cumple, ${f.no_cumple} no cumple, ${f.pendientes} pendientes, ${f.no_aplica} no aplica`}
            >
              <span className="h-full bg-emerald-500" style={{ width: `${pct(f.cumple)}%` }} />
              <span className={cn("h-full bg-destructive")} style={{ width: `${pct(f.no_cumple)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
