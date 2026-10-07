"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CircleHelpIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { anularSuficiencia, registrarSuficiencia } from "@/lib/habilitacion/documentos";
import { indicadoresSuficiencia, parsePesosCO, type CifrasSuficiencia } from "@/lib/habilitacion/suficiencia";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import type { SuficienciaRegistro } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const pesos = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const CAMPOS = [
  { k: "patrimonioTotal", label: "Patrimonio total" },
  { k: "capital", label: "Capital (suscrito y pagado, o fiscal)" },
  { k: "mercantiles360", label: "Obligaciones mercantiles vencidas a más de 360 días" },
  { k: "laborales360", label: "Obligaciones laborales vencidas a más de 360 días" },
  { k: "pasivoCorriente", label: "Pasivo corriente" },
] as const;
type Campo = (typeof CAMPOS)[number]["k"];

// HU-3.3: calculadora de los 3 indicadores (Manual 8.2) para revisarlos
// antes de pedir la certificación firmada. Información financiera: esta
// sección solo se muestra a quien tiene permiso de edición.
export function Suficiencia({ registros, puedeCrear, puedeAnular }: { registros: SuficienciaRegistro[]; puedeCrear: boolean; puedeAnular: boolean }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<Campo, string>>({ patrimonioTotal: "", capital: "", mercantiles360: "", laborales360: "", pasivoCorriente: "" });
  const [fechaCorte, setFechaCorte] = useState(`${new Date().getFullYear() - 1}-12-31`);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  const cifras: CifrasSuficiencia | null = useMemo(() => {
    const n = Object.fromEntries(CAMPOS.map((c) => [c.k, parsePesosCO(valores[c.k])])) as Record<Campo, number | null>;
    if (Object.values(n).some((v) => v === null)) return null;
    return {
      patrimonio_total: n.patrimonioTotal!,
      capital: n.capital!,
      obligaciones_mercantiles_360: n.mercantiles360!,
      obligaciones_laborales_360: n.laborales360!,
      pasivo_corriente: n.pasivoCorriente!,
    };
  }, [valores]);
  const calculo = cifras ? indicadoresSuficiencia(cifras) : null;

  async function guardar() {
    setPendiente(true);
    setError(null);
    const r = await registrarSuficiencia({
      fechaCorte,
      patrimonioTotal: valores.patrimonioTotal,
      capital: valores.capital,
      mercantiles360: valores.mercantiles360,
      laborales360: valores.laborales360,
      pasivoCorriente: valores.pasivoCorriente,
      observacion: null,
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Cifras guardadas", type: "success" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Suficiencia patrimonial y financiera</CardTitle>
        <p className="text-sm text-muted-foreground">
          Escribe las cifras de tus estados financieros (año anterior, o de constitución si eres nuevo) y revisa los 3 indicadores
          antes de pedir la certificación al revisor fiscal o contador.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fecha-corte">Fecha de corte</Label>
            <Input id="fecha-corte" type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
          </div>
          {CAMPOS.map((c) => (
            <div key={c.k} className="space-y-1">
              <Label htmlFor={`suf-${c.k}`}>{c.label}</Label>
              <Input
                id={`suf-${c.k}`}
                inputMode="decimal"
                placeholder="$ 0"
                value={valores[c.k]}
                onChange={(e) => setValores((v) => ({ ...v, [c.k]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {calculo ? (
          <ul className="space-y-2" aria-live="polite">
            {calculo.indicadores.map((i) => {
              const Icono = i.cumple === null ? CircleHelpIcon : i.cumple ? CheckIcon : XIcon;
              return (
                <li key={i.nombre} className="flex items-start gap-2 rounded-lg border p-2 text-sm">
                  <Icono
                    className={cn("mt-0.5 size-4 shrink-0", i.cumple === null ? "text-muted-foreground" : i.cumple ? "text-emerald-700" : "text-destructive")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    {i.nombre}: <strong>{i.valor === null ? "no calculable" : `${i.valor.toLocaleString("es-CO")} %`}</strong>
                    <span className="text-muted-foreground"> (debe ser {i.regla})</span>
                    <span className="sr-only">{i.cumple === null ? " — no calculable" : i.cumple ? " — cumple" : " — no cumple"}</span>
                  </span>
                </li>
              );
            })}
            <li className="text-sm font-medium">
              {calculo.cumpleTodos === true
                ? "Cumples los tres indicadores."
                : calculo.cumpleTodos === false
                  ? "No cumples algún indicador: revísalo con tu contador antes de radicar."
                  : "Algún indicador no se puede calcular con estas cifras."}
            </li>
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Escribe las 5 cifras en pesos (por ejemplo 125.000.000) para ver los indicadores.</p>
        )}

        {puedeCrear ? (
          <Button onClick={guardar} disabled={pendiente || !cifras}>
            {pendiente ? "Guardando…" : "Guardar estas cifras"}
          </Button>
        ) : null}

        {registros.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Cifras registradas</h3>
            <ul className="space-y-2">
              {registros.map((r) => (
                <RegistroItem key={r.id} r={r} puedeAnular={puedeAnular} />
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RegistroItem({ r, puedeAnular }: { r: SuficienciaRegistro; puedeAnular: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { cumpleTodos } = indicadoresSuficiencia(r);

  async function anular() {
    const res = await anularSuficiencia(r.id, motivo);
    if (res.error) toast.add({ title: "No se anuló", description: res.error, type: "error" });
    else router.refresh();
  }

  return (
    <li className={cn("rounded-lg border p-2 text-sm", r.anulado && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Corte {fechaLegible(r.fecha_corte)}</span>
        {r.anulado ? (
          <Badge variant="secondary">Anulado</Badge>
        ) : (
          <Badge variant={cumpleTodos ? "default" : "outline"}>{cumpleTodos ? "Cumple" : cumpleTodos === false ? "No cumple" : "No calculable"}</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          Patrimonio {pesos(r.patrimonio_total)} · capital {pesos(r.capital)} · pasivo corriente {pesos(r.pasivo_corriente)}
        </span>
        {puedeAnular && !r.anulado && !anulando ? (
          <button type="button" className="text-xs underline underline-offset-4" onClick={() => setAnulando(true)}>
            Anular
          </button>
        ) : null}
      </div>
      {r.anulado && r.anulado_motivo ? <p className="text-xs text-muted-foreground">Anulado: {r.anulado_motivo}</p> : null}
      {anulando ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo de anulación" />
          <Button size="sm" variant="destructive" onClick={anular} disabled={motivo.trim().length < 10}>
            Anular
          </Button>
        </div>
      ) : null}
    </li>
  );
}
