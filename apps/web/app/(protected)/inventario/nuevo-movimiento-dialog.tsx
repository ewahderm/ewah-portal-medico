"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { registrarMovimiento } from "@/lib/inventario/actions";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA, MOTIVO_LABEL } from "@/lib/inventario/motivos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";

type Lote = {
  id: string;
  insumo_id: string;
  numero_lote: string;
  cantidad_actual: number;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};
type Insumo = { id: string; nombre: string };

const ITEMS_MOTIVO = [
  ...MOTIVOS_ENTRADA.map((m) => ({ value: m, label: `Ingreso — ${MOTIVO_LABEL[m]}` })),
  ...MOTIVOS_SALIDA.map((m) => ({ value: m, label: `Salida — ${MOTIVO_LABEL[m]}` })),
];

export function NuevoMovimientoDialog({ insumos, lotes }: { insumos: Insumo[]; lotes: Lote[] }) {
  const [open, setOpen] = useState(false);
  const [insumoId, setInsumoId] = useState("");
  const [state, formAction, pending] = useActionState(registrarMovimiento, null);

  const lotesDelInsumo = useMemo(
    () => lotes.filter((l) => l.insumo_id === insumoId),
    [lotes, insumoId],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInsumoId("");
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Nuevo movimiento
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo movimiento de inventario</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {state?.warning ? (
            <Alert>
              <AlertDescription>Registrado, pero: {state.warning}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="insumoIdMovimiento">Insumo</Label>
            <Combobox
              id="insumoIdMovimiento"
              items={insumos.map((i) => ({ value: i.id, label: i.nombre }))}
              value={insumoId}
              onValueChange={(valor) => setInsumoId(String(valor ?? ""))}
              placeholder="Escriba para buscar insumo..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivoMovimiento">Tipo de movimiento</Label>
            <Combobox
              id="motivoMovimiento"
              name="motivoMovimiento"
              required
              items={ITEMS_MOTIVO}
              placeholder="Escriba tipo de movimiento..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loteId">Lote</Label>
            <Combobox
              key={insumoId}
              id="loteId"
              name="loteId"
              required
              disabled={lotesDelInsumo.length === 0}
              items={lotesDelInsumo.map((l) => ({
                value: l.id,
                label: `${l.numero_lote} — ${l.sedes?.nombre ?? "—"} (stock: ${l.cantidad_actual})`,
              }))}
              placeholder={!insumoId ? "Primero seleccione un insumo" : "Selecciona"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cantidadMovimiento">Cantidad</Label>
            <Input id="cantidadMovimiento" name="cantidad" type="number" min="0" step="0.01" required placeholder="0.00" />
            <p className="text-xs text-muted-foreground">
              Ingresa siempre la cantidad positiva; el signo se aplica automáticamente según el tipo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea id="observaciones" name="observaciones" rows={2} placeholder="Observaciones adicionales" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
