"use client";

import { useState, useTransition } from "react";
import { cancelarCita } from "@/lib/citas/actions";
import { Button } from "@/components/ui/button";
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

export function CancelarDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCancelar() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelarCita(id, motivo);
        setOpen(false);
        setMotivo("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cancelar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Cancelar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar cita</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo de la cancelación</Label>
          <Textarea
            id="motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: paciente reagendó por su cuenta"
            required
          />
        </div>

        <Button
          variant="destructive"
          className="w-full"
          disabled={pending || !motivo.trim()}
          onClick={handleCancelar}
        >
          {pending ? "Cancelando..." : "Confirmar cancelación"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
