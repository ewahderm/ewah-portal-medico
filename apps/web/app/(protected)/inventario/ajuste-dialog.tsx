"use client";

import { useState, useTransition } from "react";
import { registrarAjusteLote } from "@/lib/inventario/actions";
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

export function AjusteDialog({ loteId }: { loteId: string }) {
  const [open, setOpen] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAjustar() {
    setError(null);
    const valor = Number(cantidad);
    if (Number.isNaN(valor) || valor === 0) {
      setError("La cantidad debe ser un número distinto de cero.");
      return;
    }
    startTransition(async () => {
      try {
        await registrarAjusteLote(loteId, valor, motivo);
        setOpen(false);
        setCantidad("");
        setMotivo("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo ajustar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Ajustar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock del lote</DialogTitle>
        </DialogHeader>

        <Alert>
          <AlertDescription>
            Usa un número negativo para pérdidas o daños (ej: -1) y positivo si
            apareció más stock del registrado (ej: 5).
          </AlertDescription>
        </Alert>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="cantidadAjuste">Cantidad</Label>
          <Input
            id="cantidadAjuste"
            type="number"
            step="1"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Ej: -1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="motivoAjuste">Motivo</Label>
          <Textarea
            id="motivoAjuste"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: se rompió una ampolla"
            required
          />
        </div>

        <Button
          className="w-full"
          disabled={pending || !cantidad.trim() || !motivo.trim()}
          onClick={handleAjustar}
        >
          {pending ? "Guardando..." : "Confirmar ajuste"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
