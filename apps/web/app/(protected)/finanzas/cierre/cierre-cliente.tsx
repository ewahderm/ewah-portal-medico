"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { cerrarMes, reabrirMes } from "@/lib/finanzas/cierre-acciones";
import { claveMes, nombreMes, type Mes } from "@/lib/finanzas/informe";
import type { Arqueo, Periodo } from "@/lib/finanzas/consultas";
import type { Moneda } from "@/lib/finanzas/constantes";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoDinero } from "../_components/campo-dinero";

type CuentaArqueo = { id: string; nombre: string; moneda: Moneda; saldo: number };
type Verificacion = { boldVencidos: number; porRevisar: number; cuentas: CuentaArqueo[] };

const capital = (t: string) => t[0].toUpperCase() + t.slice(1);

export function CierreCliente({
  siguiente,
  verificacion,
  periodos,
  arqueos,
  nombreCuenta,
  monedaCuenta,
  hayCerrables,
  puedeAprobar,
}: {
  siguiente: Mes | null;
  verificacion: Verificacion | null;
  periodos: Periodo[];
  arqueos: Arqueo[];
  nombreCuenta: Record<string, string>;
  monedaCuenta: Record<string, Moneda>;
  hayCerrables: boolean;
  puedeAprobar: boolean;
}) {
  const cerrados = periodos.filter((p) => p.estado === "cerrado").sort((a, b) => claveMes(b).localeCompare(claveMes(a)));
  const ultimo = cerrados[0];
  return (
    <div className="space-y-4">
      {siguiente && verificacion ? (
        <CerrarMes mes={siguiente} verificacion={verificacion} puedeAprobar={puedeAprobar} />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-5 text-emerald-700" />
            {hayCerrables ? "Todos los meses terminados están cerrados." : "Aún no termina ningún mes desde el inicio del flujo de caja."}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Meses cerrados</CardTitle>
          <p className="text-sm text-muted-foreground">Un mes cerrado no admite movimientos con fecha en él. Para corregir, reabre el último con un motivo.</p>
        </CardHeader>
        <CardContent>
          {cerrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno todavía.</p>
          ) : (
            <ul className="divide-y">
              {cerrados.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                  <LockIcon className="mt-0.5 size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{capital(nombreMes(p))}</span>
                    <span className="block text-xs text-muted-foreground">
                      Cerrado el {p.cerrado_en ? fechaLegible(p.cerrado_en.slice(0, 10)) : ""}
                      {p.historial.some((h) => h.accion === "reabrir") ? ` · reabierto ${p.historial.filter((h) => h.accion === "reabrir").length} vez/veces` : ""}
                    </span>
                    {arqueos
                      .filter((a) => a.periodo_id === p.id && a.diferencia !== 0 && !a.reemplazado)
                      .map((a) => (
                        <span key={a.id} className={cn("block text-xs", a.diferencia < 0 ? "text-destructive" : "text-emerald-700")}>
                          Arqueo {nombreCuenta[a.cuenta_id]}: {a.diferencia < 0 ? "faltante" : "sobrante"} de{" "}
                          {formatoDinero(Math.abs(a.diferencia), monedaCuenta[a.cuenta_id])}
                          {a.motivo ? ` (${a.motivo})` : ""}
                        </span>
                      ))}
                    {p.historial
                      .filter((h) => h.accion === "reabrir")
                      .map((h) => (
                        <span key={h.en} className="block text-xs text-muted-foreground">
                          Reabierto el {fechaLegible(h.en.slice(0, 10))}: {h.motivo}
                        </span>
                      ))}
                  </span>
                  {puedeAprobar && p.id === ultimo?.id ? <Reabrir periodo={p} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CerrarMes({ mes, verificacion, puedeAprobar }: { mes: Mes; verificacion: Verificacion; puedeAprobar: boolean }) {
  const router = useRouter();
  const [contado, setContado] = useState<Record<string, number | null>>(Object.fromEntries(verificacion.cuentas.map((c) => [c.id, c.saldo])));
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const diferencia = (c: CuentaArqueo) => Math.round(((contado[c.id] ?? c.saldo) - c.saldo) * 100) / 100;

  async function cerrar() {
    for (const c of verificacion.cuentas) {
      if (contado[c.id] === null) return setError(`Revisa el saldo contado de ${c.nombre}.`);
      if (diferencia(c) !== 0 && (motivos[c.id] ?? "").trim().length < 10) return setError(`Explica la diferencia de ${c.nombre} (al menos 10 caracteres).`);
    }
    setPendiente(true);
    setError(null);
    const r = await cerrarMes({
      anio: mes.anio,
      mes: mes.mes,
      arqueos: verificacion.cuentas.map((c) => ({ cuentaId: c.id, contado: contado[c.id], motivo: motivos[c.id] ?? "" })),
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: `${capital(nombreMes(mes))} cerrado`, type: "success" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Cerrar {nombreMes(mes)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cuenta la plata de cada cuenta al último día del mes. Si no coincide con el sistema, la diferencia queda como sobrante o faltante
          de caja con tu explicación.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          <Chequeo ok={verificacion.boldVencidos === 0} texto={
              verificacion.boldVencidos
                ? `${verificacion.boldVencidos} ${verificacion.boldVencidos === 1 ? "cobro" : "cobros"} con pasarela sin liquidar de ese mes o antes`
                : "Sin cobros con pasarela pendientes del mes"
            } />
          <Chequeo ok={verificacion.porRevisar === 0} texto={
              verificacion.porRevisar
                ? `${verificacion.porRevisar} ${verificacion.porRevisar === 1 ? "tratamiento" : "tratamientos"} por revisar en Cobros`
                : "Sin ingresos por revisar"
            } />
        </ul>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-3">
          {verificacion.cuentas.map((c) => {
            const dif = diferencia(c);
            return (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_10rem] sm:items-end">
                  <div>
                    <p className="text-sm font-medium">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground">Según el sistema: {formatoDinero(c.saldo, c.moneda)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`contado-${c.id}`}>Contado</Label>
                    <CampoDinero id={`contado-${c.id}`} moneda={c.moneda} valorInicial={c.saldo} onValor={(v) => setContado((x) => ({ ...x, [c.id]: v }))} vacioEsCero />
                  </div>
                  <p className={cn("text-sm tabular-nums sm:text-right", dif < 0 && "text-destructive", dif > 0 && "text-emerald-700")}>
                    {dif === 0 ? "Cuadra" : `${dif < 0 ? "Faltan" : "Sobran"} ${formatoDinero(Math.abs(dif), c.moneda)}`}
                  </p>
                </div>
                {dif !== 0 ? (
                  <div className="mt-2 space-y-1">
                    <Label htmlFor={`motivo-${c.id}`}>¿Por qué no cuadra?</Label>
                    <Input id={`motivo-${c.id}`} maxLength={500} value={motivos[c.id] ?? ""} onChange={(e) => setMotivos((x) => ({ ...x, [c.id]: e.target.value }))} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {puedeAprobar ? (
          <Button onClick={cerrar} disabled={pendiente}>
            {pendiente ? "Cerrando…" : `Cerrar ${nombreMes(mes)}`}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Cerrar el mes requiere permiso de aprobar en Flujo de caja.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Chequeo({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={cn("flex items-center gap-2", !ok && "text-amber-700")}>
      {ok ? <CheckCircle2Icon className="size-4 text-emerald-700" /> : <TriangleAlertIcon className="size-4" />}
      {texto}
    </li>
  );
}

function Reabrir({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function reabrir() {
    setPendiente(true);
    setError(null);
    const r = await reabrirMes(periodo.anio, periodo.mes, motivo);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: `${capital(nombreMes(periodo))} reabierto`, type: "success" });
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setAbierto(true)}>
        Reabrir
      </Button>
      {abierto ? (
        <Dialog open onOpenChange={(o) => !o && setAbierto(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reabrir {nombreMes(periodo)}</DialogTitle>
              <DialogDescription>Se podrá registrar de nuevo en ese mes. Queda en el historial con tu motivo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="motivoReabrir">¿Por qué lo reabres?</Label>
              <Textarea id="motivoReabrir" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Al menos 10 caracteres" />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <Button onClick={reabrir} disabled={pendiente || motivo.trim().length < 10}>
                {pendiente ? "Reabriendo…" : "Reabrir"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
