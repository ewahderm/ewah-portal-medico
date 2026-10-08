"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, PaperclipIcon } from "lucide-react";
import { anularLiquidacion, liquidarPasarela, urlSoporteLiquidacion } from "@/lib/finanzas/bold-acciones";
import { subirArchivoFinanzas } from "@/lib/finanzas/subida-cliente";
import { agruparPorAbono, totalizar, validarLiquidacion, type PendientePasarela } from "@/lib/finanzas/tarifas";
import type { Liquidacion } from "@/lib/finanzas/consultas";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { abrirFirmado } from "../../habilitacion/_components/abrir-firmado";
import { CampoDinero } from "../_components/campo-dinero";

type CuentaOpcion = { id: string; nombre: string; destino: boolean; pasarela: boolean };

export function BoldCliente({
  pendientes,
  liquidaciones,
  cuentas,
  hoy,
  puedeCrear,
  puedeAnular,
}: {
  pendientes: PendientePasarela[];
  liquidaciones: Liquidacion[];
  cuentas: CuentaOpcion[];
  hoy: string;
  puedeCrear: boolean;
  puedeAnular: boolean;
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [liquidando, setLiquidando] = useState(false);
  const nombre = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const pasarelas = [...new Set(pendientes.map((p) => p.cuenta_id))];
  const seleccion = pendientes.filter((p) => elegidos.has(p.movimiento_id));
  const total = totalizar(seleccion);
  const variasPasarelas = new Set(seleccion.map((p) => p.cuenta_id)).size > 1;
  const sinTarifa = pendientes.some((p) => !p.tarifa_id);

  const alternar = (ids: string[], marcar: boolean) =>
    setElegidos((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (marcar) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  return (
    <div className="space-y-4">
      {sinTarifa ? (
        <Alert>
          <AlertDescription>
            Hay cobros sin tarifa: se espera que lleguen completos. Configura la tarifa en Configuración → Medios de pago.
          </AlertDescription>
        </Alert>
      ) : null}

      {pendientes.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-5 text-emerald-700" />
            No hay cobros pendientes de abono.
          </CardContent>
        </Card>
      ) : (
        pasarelas.map((cuentaId) => (
          <Card key={cuentaId}>
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">{nombre.get(cuentaId) ?? "Pasarela"}: pendientes de abono</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Marca los cobros que llegaron al banco y liquídalos. El neto esperado sale de la tarifa de cada medio.
                </p>
              </div>
              <p className="shrink-0 text-right text-sm tabular-nums">
                <span className="block text-xs text-muted-foreground">Neto esperado</span>
                <span className="text-lg font-semibold">{formatoDinero(totalizar(pendientes.filter((p) => p.cuenta_id === cuentaId)).neto)}</span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {agruparPorAbono(pendientes.filter((p) => p.cuenta_id === cuentaId)).map((g) => {
                const ids = g.items.map((i) => i.movimiento_id);
                const todos = ids.every((id) => elegidos.has(id));
                const vencido = g.fecha !== null && g.fecha < hoy;
                return (
                  <section key={g.fecha ?? "sin"} className="rounded-lg border">
                    <header className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
                      {puedeCrear ? (
                        <Checkbox
                          checked={todos}
                          indeterminate={!todos && ids.some((id) => elegidos.has(id))}
                          onCheckedChange={(v) => alternar(ids, !!v)}
                          aria-label={`Elegir los cobros que llegan el ${g.fecha ? fechaLegible(g.fecha) : "día sin fecha"}`}
                        />
                      ) : null}
                      <span className="flex-1 font-medium">
                        {g.fecha ? `Llegan el ${fechaLegible(g.fecha)}` : "Sin fecha esperada"}{" "}
                        {vencido ? <Badge variant="destructive">Vencido</Badge> : null}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {g.totales.cantidad} · bruto {formatoDinero(g.totales.bruto)} · neto {formatoDinero(g.totales.neto)}
                      </span>
                    </header>
                    <ul className="divide-y">
                      {g.items.map((p) => (
                        <li key={p.movimiento_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          {puedeCrear ? (
                            <Checkbox
                              checked={elegidos.has(p.movimiento_id)}
                              onCheckedChange={(v) => alternar([p.movimiento_id], !!v)}
                              aria-label={`Elegir el cobro de ${formatoDinero(p.bruto)} del ${fechaLegible(p.fecha)}`}
                            />
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block break-words">{p.descripcion ?? "Cobro"}</span>
                            <span className="block text-xs text-muted-foreground">Cobrado el {fechaLegible(p.fecha)}{p.tarifa_id ? "" : " · sin tarifa"}</span>
                          </span>
                          <span className="text-right tabular-nums">
                            <span className="block">{formatoDinero(p.bruto)}</span>
                            <span className="block text-xs text-muted-foreground">llegan {formatoDinero(p.neto)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      {seleccion.length ? (
        <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {seleccion.length} {seleccion.length === 1 ? "cobro" : "cobros"} · bruto {formatoDinero(total.bruto)} ·{" "}
            <span className="font-semibold">neto esperado {formatoDinero(total.neto)}</span>
            {variasPasarelas ? <span className="block text-xs text-destructive">Liquida los cobros de una pasarela a la vez.</span> : null}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setElegidos(new Set())}>
              Quitar selección
            </Button>
            <Button size="sm" disabled={variasPasarelas} onClick={() => setLiquidando(true)}>
              Liquidar
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Liquidaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {liquidaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay liquidaciones.</p>
          ) : (
            <ul className="divide-y">
              {liquidaciones.map((l) => (
                <LiquidacionFila key={l.id} liquidacion={l} nombreCuenta={nombre} puedeAnular={puedeAnular} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {liquidando ? (
        <LiquidarDialog
          seleccion={seleccion}
          cuentas={cuentas.filter((c) => c.destino)}
          hoy={hoy}
          onCerrar={(listo) => {
            setLiquidando(false);
            if (listo) setElegidos(new Set());
          }}
        />
      ) : null}
    </div>
  );
}

function LiquidarDialog({ seleccion, cuentas, hoy, onCerrar }: { seleccion: PendientePasarela[]; cuentas: CuentaOpcion[]; hoy: string; onCerrar: (listo: boolean) => void }) {
  const router = useRouter();
  const total = totalizar(seleccion);
  const fechaMinima = seleccion.reduce((m, p) => (p.fecha > m ? p.fecha : m), "0000-01-01");
  const [id] = useState(() => crypto.randomUUID());
  const [cuentaId, setCuentaId] = useState<string | null>(cuentas.length === 1 ? cuentas[0].id : null);
  const [fecha, setFecha] = useState(hoy);
  const [neto, setNeto] = useState<number | null>(total.neto);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const diferencia = neto === null ? null : Math.round((total.neto - neto) * 100) / 100;

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const invalido = validarLiquidacion({ ids: seleccion.map((p) => p.movimiento_id), cuentaId, fecha, netoReal: neto, bruto: total.bruto, hoy, fechaMinima });
    if (invalido) return setError(invalido);
    setPendiente(true);
    setError(null);
    let soporte: { path: string; nombre: string } | null = null;
    if (archivo) {
      const s = await subirArchivoFinanzas(archivo, "liquidaciones", id);
      if ("error" in s) {
        setPendiente(false);
        return setError(s.error);
      }
      soporte = s;
    }
    const r = await liquidarPasarela({
      id,
      movimientos: seleccion.map((p) => p.movimiento_id),
      cuentaId,
      fecha,
      netoReal: neto,
      netoEsperado: total.neto,
      soportePath: soporte?.path ?? null,
      soporteNombre: soporte?.nombre ?? null,
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Liquidación registrada", description: `Llegaron ${formatoDinero(neto ?? 0)}`, type: "success" });
    router.refresh();
    onCerrar(true);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liquidar {seleccion.length === 1 ? "1 cobro" : `${seleccion.length} cobros`}</DialogTitle>
          <DialogDescription>Confirma lo que llegó al banco. Se registran el abono, la comisión, las retenciones y la diferencia si la hay.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-muted/50 p-3 text-sm tabular-nums">
            <dt className="text-muted-foreground">Cobrado</dt>
            <dd className="text-right">{formatoDinero(total.bruto)}</dd>
            <dt className="text-muted-foreground">Comisión (IVA incluido)</dt>
            <dd className="text-right">−{formatoDinero(total.comision)}</dd>
            <dt className="text-muted-foreground">Retenciones</dt>
            <dd className="text-right">−{formatoDinero(total.retenciones)}</dd>
            <dt className="font-medium">Neto esperado</dt>
            <dd className="text-right font-semibold">{formatoDinero(total.neto)}</dd>
          </dl>
          <div className="space-y-1">
            <Label htmlFor="cuentaLiquidacion">¿A qué cuenta llegó?</Label>
            <Combobox id="cuentaLiquidacion" items={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} value={cuentaId} onValueChange={(v) => setCuentaId(v ? String(v) : null)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fechaLiquidacion">Fecha del abono</Label>
              <Input id="fechaLiquidacion" type="date" value={fecha} min={fechaMinima} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="netoLiquidacion">¿Cuánto llegó?</Label>
              <CampoDinero id="netoLiquidacion" valorInicial={neto} onValor={setNeto} required />
            </div>
          </div>
          {diferencia ? (
            <p className={cn("text-sm", diferencia > 0 ? "text-destructive" : "text-emerald-700")}>
              {diferencia > 0 ? `Llegaron ${formatoDinero(diferencia)} menos de lo esperado` : `Llegaron ${formatoDinero(-diferencia)} más de lo esperado`}: queda
              registrado como diferencia en la liquidación.
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="reporteLiquidacion">Reporte de la pasarela (opcional)</Label>
            <FileInput id="reporteLiquidacion" accept={ACCEPT_ARCHIVO} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onCerrar(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Liquidando…" : "Liquidar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LiquidacionFila({ liquidacion: l, nombreCuenta, puedeAnular }: { liquidacion: Liquidacion; nombreCuenta: Map<string, string>; puedeAnular: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function anular() {
    setPendiente(true);
    setError(null);
    const r = await anularLiquidacion(l.id, motivo);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Liquidación anulada", description: "Sus cobros volvieron a pendientes.", type: "success" });
    setAnulando(false);
    router.refresh();
  }

  return (
    <li className={cn("flex flex-wrap items-start gap-3 py-3 text-sm", l.anulada && "opacity-60")}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          <span className={cn(l.anulada && "line-through")}>
            {fechaLegible(l.fecha)} · {l.cobros} {l.cobros === 1 ? "cobro" : "cobros"} a {nombreCuenta.get(l.cuenta_banco_id) ?? "la cuenta"}
          </span>
          {l.anulada ? <Badge variant="outline">Anulada</Badge> : null}
          {!l.anulada && l.diferencia !== 0 ? <Badge variant="secondary">Con diferencia</Badge> : null}
        </span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          Cobrado {formatoDinero(l.bruto)} · comisión {formatoDinero(l.comision)} · retenciones {formatoDinero(l.retefuente + l.reteica + l.reteiva)}
          {l.diferencia ? ` · diferencia ${formatoDinero(l.diferencia)}` : ""}
        </span>
        {l.anulada && l.anulada_motivo ? <span className="block text-xs text-muted-foreground">Anulada: {l.anulada_motivo}</span> : null}
        <span className="mt-1 flex flex-wrap gap-2">
          {l.soporte_nombre_archivo ? (
            <Button size="xs" variant="outline" onClick={() => abrirFirmado(() => urlSoporteLiquidacion(l.id))}>
              <PaperclipIcon /> {l.soporte_nombre_archivo}
            </Button>
          ) : null}
          {puedeAnular && !l.anulada ? (
            <Button size="xs" variant="ghost" onClick={() => setAnulando(true)}>
              Anular
            </Button>
          ) : null}
        </span>
      </span>
      <span className="shrink-0 text-right font-semibold tabular-nums">{formatoDinero(l.neto_real)}</span>
      {anulando ? (
        <Dialog open onOpenChange={(o) => !o && setAnulando(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Anular liquidación</DialogTitle>
              <DialogDescription>
                Se anulan el abono, la comisión, las retenciones y la diferencia, y los {l.cobros} cobros vuelven a quedar pendientes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`motivoLiq-${l.id}`}>¿Por qué la anulas?</Label>
              <Textarea id={`motivoLiq-${l.id}`} rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Al menos 10 caracteres" />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAnulando(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={anular} disabled={pendiente || motivo.trim().length < 10}>
                {pendiente ? "Anulando…" : "Anular"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  );
}
