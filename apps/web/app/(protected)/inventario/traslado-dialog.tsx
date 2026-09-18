"use client";

import { useActionState } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
import { registrarTraslado } from "@/lib/inventario/actions";
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
import type { Opcion } from "@/lib/forms/opciones";

export function TrasladoDialog({
  loteId,
  insumoNombre,
  numeroLote,
  sedeOrigenNombre,
  sedesDestino,
}: {
  loteId: string;
  insumoNombre: string;
  numeroLote: string;
  sedeOrigenNombre: string;
  sedesDestino: Opcion[];
}) {
  const [state, formAction, pending] = useActionState(registrarTraslado, null);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ArrowLeftRightIcon /> Trasladar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trasladar entre sedes</DialogTitle>
        </DialogHeader>

        <Alert>
          <AlertDescription>
            {insumoNombre} — lote {numeroLote}, actualmente en {sedeOrigenNombre}.
          </AlertDescription>
        </Alert>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="loteOrigenId" value={loteId} />

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
            <Label htmlFor="sedeDestinoId">Sede destino</Label>
            <Combobox
              id="sedeDestinoId"
              name="sedeDestinoId"
              required
              items={sedesDestino.map((s) => ({ value: s.id, label: s.nombre }))}
              placeholder="Selecciona"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cantidadTraslado">Cantidad a trasladar</Label>
            <Input id="cantidadTraslado" name="cantidad" type="number" min="0" step="0.01" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacionesTraslado">Observaciones (opcional)</Label>
            <Textarea id="observacionesTraslado" name="observaciones" rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Confirmar traslado"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
