"use client";

import { useState, useActionState } from "react";
import { CheckIcon } from "lucide-react";
import { confirmarCeroResiduo } from "@/lib/medio-ambiente/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";
import { MesAnioSelect } from "./mes-anio-select";

export function ConfirmarCeroResiduoDialog({
  sedes,
  onConfirmado,
}: {
  sedes: Opcion[];
  onConfirmado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState("");
  const [state, formAction, pending] = useActionState(confirmarCeroResiduo, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    setMes("");
    onConfirmado();
    toast.add({ title: "Mes PGIRASA confirmado", type: "success" });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(siguiente) => {
        // El contenido se desmonta al cerrar: el mes elegido vuelve a vacío.
        if (!siguiente) setMes("");
        setOpen(siguiente);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <CheckIcon /> Confirmar 0 kg peligrosos
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar mes sin residuos peligrosos</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Esta declaración indica que la sede no generó residuos peligrosos durante todo el mes.
            No reemplaza los pesajes de residuos no peligrosos y solo se permite para meses cerrados.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ceroSedeId">Sede</Label>
            <Combobox
              id="ceroSedeId"
              name="sedeId"
              required
              items={toItems(sedes)}
              placeholder="Buscar sede..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ceroMes">Mes cerrado</Label>
            <MesAnioSelect id="ceroMes" name="mes" onValueChange={setMes} />
          </div>
          <Button type="submit" className="w-full" disabled={pending || !mes}>
            {pending ? "Confirmando..." : "Confirmar 0 kg"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
