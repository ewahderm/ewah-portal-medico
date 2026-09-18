"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { crearLote } from "@/lib/inventario/actions";
import { MOTIVOS_ENTRADA, MOTIVO_LABEL } from "@/lib/inventario/motivos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";

type Opcion = { id: string; nombre: string };

function toItems(opciones: Opcion[]) {
  return opciones.map((o) => ({ value: o.id, label: o.nombre }));
}

const ITEMS_MOTIVO_ENTRADA = MOTIVOS_ENTRADA.map((m) => ({ value: m, label: MOTIVO_LABEL[m] }));

export function RecepcionLoteForm({ insumos, sedes }: { insumos: Opcion[]; sedes: Opcion[] }) {
  const [state, formAction, pending] = useActionState(crearLote, null);
  const [resetKey, setResetKey] = useState(0);
  const estabaPendiente = useRef(false);

  useEffect(() => {
    if (estabaPendiente.current && !pending && !state?.error) {
      setResetKey((k) => k + 1);
    }
    estabaPendiente.current = pending;
  }, [pending, state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <PackagePlusIcon className="size-4 text-primary" /> Recepción de lote
        </CardTitle>
        <CardDescription>
          Registra la llegada de un lote nuevo — esto crea el lote y su entrada inicial de stock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5" key={resetKey}>
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="insumoId">Insumo</Label>
              <Combobox id="insumoId" name="insumoId" required items={toItems(insumos)} placeholder="Selecciona" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox id="sedeId" name="sedeId" required items={toItems(sedes)} placeholder="Selecciona" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="numeroLote">Número de lote</Label>
              <Input id="numeroLote" name="numeroLote" required placeholder="Ej: FAA25009" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaVencimiento">Fecha de vencimiento (opcional)</Label>
              <Input id="fechaVencimiento" name="fechaVencimiento" type="date" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
              <Label htmlFor="motivoEntrada">Motivo del ingreso</Label>
              <Combobox
                id="motivoEntrada"
                name="motivoEntrada"
                required
                items={ITEMS_MOTIVO_ENTRADA}
                placeholder="Selecciona"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor (opcional)</Label>
              <Input id="proveedor" name="proveedor" />
            </div>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : "Registrar lote"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
