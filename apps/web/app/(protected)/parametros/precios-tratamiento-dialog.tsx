"use client";

import { useState, useTransition } from "react";
import { HistoryIcon } from "lucide-react";
import { agregarPrecioTratamiento } from "@/lib/parametros/tipos-tratamiento";
import { precioVigente, type PrecioTratamiento } from "@/lib/tratamientos/precios";
import { formatoMoneda, hoy } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type PrecioConAutor = PrecioTratamiento & { autor: { nombre: string } | null };

// Precio de un tipo de tratamiento con su historial: nunca se edita uno
// anterior, se registra uno nuevo desde una fecha (hoy o un aumento futuro).
export function PreciosTratamientoDialog({
  tipoId,
  tipoNombre,
  precios,
  editable,
}: {
  tipoId: string;
  tipoNombre: string;
  precios: PrecioConAutor[];
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState(hoy());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const historial = precios
    .filter((p) => p.tipo_tratamiento_id === tipoId)
    .sort((a, b) => (a.vigente_desde === b.vigente_desde ? b.created_at.localeCompare(a.created_at) : b.vigente_desde.localeCompare(a.vigente_desde)));
  const vigente = precioVigente(precios, tipoId, hoy());

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await agregarPrecioTratamiento(tipoId, Number(valor), desde);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.add({ title: desde > hoy() ? "Precio programado" : "Precio actualizado", type: "success" });
      setValor("");
      setDesde(hoy());
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {vigente === null ? "Poner precio" : formatoMoneda(vigente)}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Precio · {tipoNombre}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Precio vigente hoy</p>
          <p className="text-2xl font-semibold tabular-nums">{vigente === null ? "Sin precio" : formatoMoneda(vigente)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se propone solo al registrar el tratamiento; quien lo registra lo puede cambiar.
          </p>
        </div>

        {editable ? (
          <div className="space-y-3">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="precio-valor">Nuevo precio</Label>
                <Input
                  id="precio-valor"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="precio-desde">Rige desde</Label>
                <Input id="precio-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Con una fecha futura queda programado (por ejemplo, el aumento de enero). Los tratamientos ya registrados no cambian.
            </p>
            <Button className="w-full" disabled={pending || valor === ""} onClick={guardar}>
              {pending ? "Guardando..." : "Guardar precio"}
            </Button>
          </div>
        ) : null}

        <div className="space-y-2 border-t pt-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <HistoryIcon className="size-4" /> Historial
          </p>
          {historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no tiene precio.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {historial.map((p) => {
                const futuro = p.vigente_desde > hoy();
                return (
                  <li key={`${p.vigente_desde}-${p.created_at}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block font-medium tabular-nums">{formatoMoneda(p.valor)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Desde {p.vigente_desde} · {p.autor?.nombre ?? "—"}
                      </span>
                    </span>
                    {futuro ? <Badge variant="outline">Programado</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
