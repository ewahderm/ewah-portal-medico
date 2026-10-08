"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { MESES, type Informe } from "@/lib/finanzas/informe";
import { descargarInformePdf } from "@/lib/finanzas/pdf-informe";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  titulo: string;
  periodo: { desde: string; hasta: string; fDesde: string; fHasta: string; min: string; max: string };
  sedeId: string | null;
  sedes: { id: string; nombre: string }[];
  informe: Informe;
  saldoInicial: number | null;
  saldoFinal: number | null;
  efecto: number | null;
  sinTasa: string[];
  serie: { mes: string; entradas: number; salidas: number }[];
  puedeExportar: boolean;
};

export function InformeCliente(props: Props) {
  const { titulo, periodo, sedeId, sedes, informe, saldoInicial, saldoFinal, efecto, sinTasa, serie, puedeExportar } = props;
  const router = useRouter();
  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta, ...(sedeId ? { sede: sedeId } : {}) });
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`/finanzas/informe?${p.toString()}`);
  };
  const consulta = new URLSearchParams({ desde: periodo.fDesde, hasta: periodo.fHasta, ...(sedeId ? { sede: sedeId } : {}) }).toString();
  const nombreSede = sedes.find((s) => s.id === sedeId)?.nombre ?? null;
  const maxSerie = Math.max(1, ...serie.flatMap((s) => [s.entradas, s.salidas]));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="informeDesde">Desde</Label>
            <CampoMes id="informeDesde" valor={periodo.desde} min={periodo.min} max={periodo.max} onElegir={(v) => ir({ desde: v })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="informeHasta">Hasta</Label>
            <CampoMes id="informeHasta" valor={periodo.hasta} min={periodo.min} max={periodo.max} onElegir={(v) => ir({ hasta: v })} />
          </div>
          {sedes.length > 1 ? (
            <div className="space-y-1 sm:w-56">
              <Label htmlFor="informeSede">Sede</Label>
              <Combobox
                id="informeSede"
                items={[{ value: "", label: "Todas" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                value={sedeId ?? ""}
                placeholder="Todas"
                onValueChange={(v) => ir({ sede: v ? String(v) : null })}
              />
            </div>
          ) : null}
          {puedeExportar ? (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/exportar/finanzas?tipo=informe&${consulta}`} />}>
                <DownloadIcon /> Informe en Excel
              </Button>
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/exportar/finanzas?tipo=movimientos&${consulta}`} />}>
                <DownloadIcon /> Movimientos en Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => descargarInformePdf({ titulo, desde: periodo.fDesde, hasta: periodo.fHasta, sede: nombreSede, informe, saldoInicial, saldoFinal, efecto })}
              >
                <FileTextIcon /> PDF
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Flujo de efectivo · {titulo}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Del {fechaLegible(periodo.fDesde)} al {fechaLegible(periodo.fHasta)}
            {nombreSede ? ` · sede ${nombreSede}` : ""}. Método directo, por actividades (NIIF para Pymes, sección 7). Solo cuenta la plata
            disponible: bancos, billeteras y efectivo.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {saldoInicial !== null ? <Total etiqueta="Efectivo al inicio del periodo" valor={saldoInicial} /> : null}
          {informe.bloques.map((b) => (
            <section key={b.actividad} className="space-y-1">
              <h3 className="text-sm font-semibold">{b.titulo}</h3>
              {b.entradas.length + b.salidas.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos.</p> : null}
              <ul className="text-sm">
                {b.entradas.map((r) => (
                  <Renglon key={`e-${r.codigo}`} nombre={r.nombre} valor={r.valor} />
                ))}
                {b.salidas.map((r) => (
                  <Renglon key={`s-${r.codigo}`} nombre={r.nombre} valor={-r.valor} />
                ))}
              </ul>
              <Total etiqueta={`Efectivo neto de ${b.titulo.replace("Actividades de ", "")}`} valor={b.neto} sutil />
            </section>
          ))}
          <Total etiqueta="Aumento (disminución) neto del efectivo" valor={informe.variacion} />
          {efecto ? <Total etiqueta="Efecto de la tasa de cambio en las divisas" valor={efecto} sutil /> : null}
          {saldoFinal !== null ? <Total etiqueta="Efectivo al final del periodo" valor={saldoFinal} /> : null}
          {sedeId ? (
            <Alert>
              <AlertDescription>Con una sede elegida el informe muestra sus movimientos; los saldos de las cuentas son de toda la clínica.</AlertDescription>
            </Alert>
          ) : sinTasa.length ? (
            <Alert>
              <AlertDescription>
                Aún no se ha usado una tasa de {sinTasa.join(" ni de ")}: esas cuentas no se incluyen en los saldos en pesos (sí sus
                movimientos, a su valor en COP).
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {serie.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Entradas y salidas por mes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Entradas y salidas de los últimos meses">
              {serie.map((s) => (
                <li key={s.mes} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {MESES[Number(s.mes.slice(5)) - 1].slice(0, 3)} {s.mes.slice(2, 4)}
                  </span>
                  <span className="space-y-0.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.max(1, (s.entradas / maxSerie) * 75)}%` }} />
                      <span className="tabular-nums text-emerald-700">{formatoDinero(s.entradas)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 rounded-full bg-destructive" style={{ width: `${Math.max(1, (s.salidas / maxSerie) * 75)}%` }} />
                      <span className="tabular-nums text-destructive">{formatoDinero(s.salidas)}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// Mes AAAA-MM: aplica al salir del campo o con Enter (donde no hay selector
// de mes se escribe a mano y no debe navegar a cada tecla).
function CampoMes({ id, valor, min, max, onElegir }: { id: string; valor: string; min: string; max: string; onElegir: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const aplicar = () => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(texto) && texto !== valor) onElegir(texto);
  };
  return (
    <Input
      id={id}
      type="month"
      value={texto}
      min={min}
      max={max}
      placeholder="AAAA-MM"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => e.key === "Enter" && aplicar()}
    />
  );
}

function Renglon({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <li className="flex justify-between gap-3 border-b border-dashed py-1 last:border-0">
      <span className="min-w-0 break-words">{nombre}</span>
      <span className={cn("shrink-0 tabular-nums", valor < 0 && "text-destructive")}>{formatoDinero(valor)}</span>
    </li>
  );
}

function Total({ etiqueta, valor, sutil }: { etiqueta: string; valor: number; sutil?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 rounded-lg px-2 py-1.5 text-sm", sutil ? "bg-muted/50" : "bg-primary/10 font-semibold")}>
      <span>{etiqueta}</span>
      <span className={cn("tabular-nums", valor < 0 && "text-destructive")}>{formatoDinero(valor)}</span>
    </div>
  );
}
