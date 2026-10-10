import { ClockIcon, PalmtreeIcon } from "lucide-react";
import { formatoDias, formatoHoras, type SaldosEmpleado } from "@/lib/rrhh/solicitudes-tipos";
import { Card, CardContent } from "@/components/ui/card";

// Cuántos días de vacaciones tiene y cuántas horas le faltan por reponer.
export function SaldosEmpleadoTarjetas({ saldos }: { saldos: SaldosEmpleado }) {
  const v = saldos.vacaciones;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardContent className="flex items-start gap-3 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PalmtreeIcon className="size-5" />
          </span>
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm text-muted-foreground">Vacaciones disponibles</span>
            {saldos.laboral ? (
              <>
                <span className={`block text-2xl font-semibold tabular-nums ${v.disponibles < 0 ? "text-destructive" : ""}`}>{formatoDias(v.disponibles)}</span>
                <span className="block text-xs text-muted-foreground">
                  Acumulados {formatoDias(v.generados)} · tomados {formatoDias(v.tomados)}
                  {v.pendientes ? ` · ${formatoDias(v.pendientes)} en solicitudes pendientes` : ""}
                </span>
                <span className="block text-xs text-muted-foreground">Se acumulan 15 días hábiles por año trabajado (1,25 por mes).</span>
              </>
            ) : (
              <span className="block text-sm">No aplica: el contrato por prestación de servicios no genera vacaciones.</span>
            )}
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-start gap-3 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClockIcon className="size-5" />
          </span>
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm text-muted-foreground">Horas por reponer</span>
            <span className="block text-2xl font-semibold tabular-nums">{formatoHoras(Math.max(0, saldos.horas.pendientes))}</span>
            <span className="block text-xs text-muted-foreground">
              De permisos que se reponen: {formatoHoras(saldos.horas.por_reponer)} · ya repuestas {formatoHoras(saldos.horas.repuestas)}
            </span>
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
