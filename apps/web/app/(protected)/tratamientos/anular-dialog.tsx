"use client";

import { useState, useTransition } from "react";
import { anularTratamiento } from "@/lib/tratamientos/actions";
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

export function AnularDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAnular() {
    setError(null);
    startTransition(async () => {
      try {
        await anularTratamiento(id, motivo);
        setOpen(false);
        setMotivo("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo anular.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Anular
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular tratamiento</DialogTitle>
        </DialogHeader>

        <Alert>
          <AlertDescription>
            El registro no se borra: queda marcado como anulado y visible en el
            historial. Si fue un error de captura, después de anular podrás crear el
            registro correcto con &quot;Corregir&quot;.
          </AlertDescription>
        </Alert>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo de la anulación</Label>
          <Textarea
            id="motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: tipo de tratamiento registrado por error"
            required
          />
        </div>

        <Button
          variant="destructive"
          className="w-full"
          disabled={pending || !motivo.trim()}
          onClick={handleAnular}
        >
          {pending ? "Anulando..." : "Confirmar anulación"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
