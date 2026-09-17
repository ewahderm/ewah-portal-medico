"use client";

import { useActionState, useState } from "react";
import { crearLote } from "@/lib/inventario/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";

type Opcion = { id: string; nombre: string };

function toItems(opciones: Opcion[]) {
  return opciones.map((o) => ({ value: o.id, label: o.nombre }));
}

export function LoteDialog({
  insumos,
  sedes,
  trigger,
}: {
  insumos: Opcion[];
  sedes: Opcion[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearLote, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo lote</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="insumoId">Insumo</Label>
              <Combobox id="insumoId" name="insumoId" required items={toItems(insumos)} placeholder="Selecciona" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox id="sedeId" name="sedeId" required items={toItems(sedes)} placeholder="Selecciona" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="numeroLote">Número de lote (opcional)</Label>
              <Input id="numeroLote" name="numeroLote" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaVencimiento">Fecha de vencimiento (opcional)</Label>
              <Input id="fechaVencimiento" name="fechaVencimiento" type="date" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="cantidadRecibida">Cantidad recibida</Label>
              <Input
                id="cantidadRecibida"
                name="cantidadRecibida"
                type="number"
                min="0"
                step="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="costoUnitario">Costo unitario (opcional)</Label>
              <Input
                id="costoUnitario"
                name="costoUnitario"
                type="number"
                min="0"
                step="1000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proveedor">Proveedor (opcional)</Label>
            <Input id="proveedor" name="proveedor" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Registrar lote"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
