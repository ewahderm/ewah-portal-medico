"use client";

import { useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearTemperaturaNevera } from "@/lib/medio-ambiente/actions";
import { datetimeLocalAhora } from "@/lib/medio-ambiente/fecha-local";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
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
import { toItems, type Opcion } from "@/lib/forms/opciones";

export function NuevaTemperaturaNeveraDialog({
  sedes,
  onCreado,
}: {
  sedes: Opcion[];
  onCreado: () => void;
}) {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (prevState: Awaited<ReturnType<typeof crearTemperaturaNevera>>, formData: FormData) => {
      const local = String(formData.get("registradoEnLocal") ?? "");
      if (local) formData.set("registradoEn", new Date(local).toISOString());
      return crearTemperaturaNevera(prevState, formData);
    },
    null,
  );

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onCreado();
    toast.add({ title: "Registro guardado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Nuevo registro
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temperatura de nevera (cadena de frío)</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox id="sedeId" name="sedeId" required items={toItems(sedes)} placeholder="Buscar sede..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nevera">Nevera</Label>
              <Input id="nevera" name="nevera" defaultValue="Principal" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="registradoEnLocal">Fecha y hora</Label>
            <Input
              id="registradoEnLocal"
              name="registradoEnLocal"
              type="datetime-local"
              required
              defaultValue={datetimeLocalAhora()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="temperaturaCelsius">Temperatura (°C)</Label>
            <Input
              id="temperaturaCelsius"
              name="temperaturaCelsius"
              type="number"
              step="0.1"
              required
              placeholder="4.0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea id="observaciones" name="observaciones" rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
