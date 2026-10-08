"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { eliminarTarifa, guardarTarifa } from "@/lib/finanzas/bold-acciones";
import { TARIFA_BOLD, desglose, formatoPorcentaje, leerPorcentajeTarifa, resumenTarifa, type Tarifa } from "@/lib/finanzas/tarifas";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoDinero } from "./campo-dinero";

type Form = {
  vigente: string;
  comision: string;
  incluyeIva: boolean;
  fijo: number | null;
  retefuente: string;
  reteica: string;
  reteiva: string;
  recargo: string;
  dias: string;
};

const texto = (n: number) => String(n).replace(".", ",");
const deTarifa = (t: Omit<Tarifa, "id" | "medio_pago_id" | "vigente_desde">, vigente: string): Form => ({
  vigente,
  comision: texto(t.porcentaje_comision),
  incluyeIva: t.comision_incluye_iva,
  fijo: t.valor_fijo_comision,
  retefuente: texto(t.porcentaje_retefuente),
  reteica: texto(t.porcentaje_reteica),
  reteiva: texto(t.porcentaje_reteiva),
  recargo: texto(t.recargo_internacional),
  dias: String(t.dias_habiles_abono),
});

// Tarifa de un medio de pago: historial por vigencia, formulario y simulador
// ("de un cobro de $100.000 te llegan $X").
export function TarifaDialog({
  medio,
  tarifas,
  hoy,
  puedeEditar,
  onCerrar,
}: {
  medio: { id: string; nombre: string };
  tarifas: Tarifa[];
  hoy: string;
  puedeEditar: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const ultima = tarifas[0];
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(ultima ? deTarifa(ultima, hoy) : deTarifa(TARIFA_BOLD, hoy));
  const [simulado, setSimulado] = useState<number | null>(100000);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const set = (c: Partial<Form>) => setForm((f) => ({ ...f, ...c }));

  const datos = {
    vigente_desde: form.vigente,
    porcentaje_comision: leerPorcentajeTarifa(form.comision),
    comision_incluye_iva: form.incluyeIva,
    valor_fijo_comision: form.fijo ?? 0,
    porcentaje_retefuente: leerPorcentajeTarifa(form.retefuente),
    porcentaje_reteica: leerPorcentajeTarifa(form.reteica),
    porcentaje_reteiva: leerPorcentajeTarifa(form.reteiva),
    recargo_internacional: leerPorcentajeTarifa(form.recargo),
    dias_habiles_abono: /^\d{1,2}$/.test(form.dias) ? Number(form.dias) : NaN,
  };
  const completo =
    datos.porcentaje_comision !== null &&
    datos.porcentaje_retefuente !== null &&
    datos.porcentaje_reteica !== null &&
    datos.porcentaje_reteiva !== null &&
    datos.recargo_internacional !== null;
  const sim = completo && simulado ? desglose(simulado, datos as Parameters<typeof desglose>[1]) : null;

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!completo) return setError("Revisa los porcentajes: van de 0 a 100, con hasta 4 decimales.");
    setPendiente(true);
    setError(null);
    const r = await guardarTarifa({ id: editando, medioPagoId: medio.id, datos: datos as Parameters<typeof guardarTarifa>[0]["datos"] });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: editando ? "Tarifa actualizada" : "Tarifa guardada", type: "success" });
    setEditando(null);
    router.refresh();
  }

  async function eliminar(t: Tarifa) {
    const r = await eliminarTarifa(t.id);
    if (r.error) return toast.add({ title: "No se eliminó", description: r.error, type: "error" });
    toast.add({ title: "Tarifa eliminada", type: "success" });
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tarifa de {medio.nombre}</DialogTitle>
          <DialogDescription>
            Lo que cobra la pasarela o el banco por cada cobro. Una tarifa nueva aplica desde su fecha; lo ya liquidado no cambia.
          </DialogDescription>
        </DialogHeader>

        {tarifas.length ? (
          <ul className="divide-y rounded-lg border text-sm">
            {tarifas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Desde el {fechaLegible(t.vigente_desde)}</span>
                  <span className="block text-xs text-muted-foreground">{resumenTarifa(t)}</span>
                </span>
                {puedeEditar ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Editar la tarifa del ${fechaLegible(t.vigente_desde)}`}
                      onClick={() => {
                        setEditando(t.id);
                        setForm(deTarifa(t, t.vigente_desde));
                      }}
                    >
                      <PencilIcon />
                    </Button>
                    <Button variant="outline" size="icon-sm" aria-label={`Eliminar la tarifa del ${fechaLegible(t.vigente_desde)}`} onClick={() => eliminar(t)}>
                      <Trash2Icon />
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no tiene tarifa: sus cobros llegan completos.</p>
        )}

        {puedeEditar ? (
          <form onSubmit={guardar} className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{editando ? "Editar tarifa" : "Nueva tarifa"}</p>
              {!editando ? (
                <Button type="button" size="xs" variant="outline" onClick={() => setForm(deTarifa(TARIFA_BOLD, form.vigente))}>
                  Usar la tarifa estándar de Bold
                </Button>
              ) : null}
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 space-y-1 sm:col-span-1">
                <Label htmlFor="tarifaVigente">Aplica desde</Label>
                <Input id="tarifaVigente" type="date" value={form.vigente} onChange={(e) => set({ vigente: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tarifaComision">Comisión %</Label>
                <Input id="tarifaComision" inputMode="decimal" value={form.comision} onChange={(e) => set({ comision: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tarifaFijo">Valor fijo</Label>
                <CampoDinero id="tarifaFijo" valorInicial={form.fijo} onValor={(v) => set({ fijo: v })} vacioEsCero />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-3">
                <Checkbox checked={form.incluyeIva} onCheckedChange={(v) => set({ incluyeIva: !!v })} />
                La comisión ya incluye IVA
              </label>
              <div className="space-y-1">
                <Label htmlFor="tarifaRetefuente">ReteRenta %</Label>
                <Input id="tarifaRetefuente" inputMode="decimal" value={form.retefuente} onChange={(e) => set({ retefuente: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tarifaReteica">ReteICA %</Label>
                <Input id="tarifaReteica" inputMode="decimal" value={form.reteica} onChange={(e) => set({ reteica: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tarifaReteiva">ReteIVA %</Label>
                <Input id="tarifaReteiva" inputMode="decimal" value={form.reteiva} onChange={(e) => set({ reteiva: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tarifaRecargo">Recargo internacional %</Label>
                <Input id="tarifaRecargo" inputMode="decimal" value={form.recargo} onChange={(e) => set({ recargo: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tarifaDias">Días hábiles de abono</Label>
                <Input id="tarifaDias" inputMode="numeric" value={form.dias} onChange={(e) => set({ dias: e.target.value })} />
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="tarifaSimulador">De un cobro de</Label>
                <div className="w-36">
                  <CampoDinero id="tarifaSimulador" valorInicial={simulado} onValor={setSimulado} />
                </div>
              </div>
              {sim ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
                  <dt className="text-muted-foreground">Comisión{form.incluyeIva ? " (IVA incluido)" : " + IVA"}</dt>
                  <dd className="text-right">−{formatoDinero(sim.comision)}</dd>
                  <dt className="text-muted-foreground">ReteRenta ({formatoPorcentaje(datos.porcentaje_retefuente ?? 0)})</dt>
                  <dd className="text-right">−{formatoDinero(sim.retefuente)}</dd>
                  <dt className="text-muted-foreground">ReteICA ({formatoPorcentaje(datos.porcentaje_reteica ?? 0)})</dt>
                  <dd className="text-right">−{formatoDinero(sim.reteica)}</dd>
                  {sim.reteiva ? (
                    <>
                      <dt className="text-muted-foreground">ReteIVA</dt>
                      <dd className="text-right">−{formatoDinero(sim.reteiva)}</dd>
                    </>
                  ) : null}
                  <dt className="font-medium">Te llegan</dt>
                  <dd className="text-right font-semibold">{formatoDinero(sim.neto)}</dd>
                </dl>
              ) : (
                <p className="mt-2 text-muted-foreground">Completa la tarifa para simular.</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Las retenciones no son gasto: son anticipos de impuestos que se descuentan en la declaración.</p>
            </div>
            <div className="flex justify-end gap-2">
              {editando ? (
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                  Cancelar edición
                </Button>
              ) : null}
              <Button type="submit" disabled={pendiente}>
                {pendiente ? "Guardando…" : "Guardar tarifa"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
