"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearTemperaturaConsultorio } from "@/lib/medio-ambiente/actions";
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
import { FechaJornadaFields } from "./fecha-jornada-fields";

type Consultorio = { id: string; nombre: string; sede_id: string };

export function NuevaTemperaturaConsultorioDialog({
  sedes,
  consultorios,
  onCreado,
}: {
  sedes: Opcion[];
  consultorios: Consultorio[];
  onCreado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sedeId, setSedeId] = useState("");

  // El consultorio depende de la sede — no tiene sentido ofrecer consultorios
  // de otra sede. Mismo patrón que NuevaLimpiezaDialog.
  const consultoriosDeLaSede = useMemo(
    () => consultorios.filter((c) => c.sede_id === sedeId),
    [consultorios, sedeId],
  );

  const [state, formAction, pending] = useActionState(crearTemperaturaConsultorio, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onCreado();
    toast.add({ title: "Registro guardado", type: "success" });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSedeId("");
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Nuevo registro
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temperatura y humedad de consultorio</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox
                id="sedeId"
                name="sedeId"
                required
                items={toItems(sedes)}
                value={sedeId}
                onValueChange={(v) => setSedeId(String(v ?? ""))}
                placeholder="Buscar sede..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consultorioId">Consultorio</Label>
              <Combobox
                id="consultorioId"
                name="consultorioId"
                key={sedeId}
                required
                disabled={!sedeId}
                items={toItems(consultoriosDeLaSede)}
                placeholder={!sedeId ? "Primero elige la sede" : "Buscar consultorio..."}
              />
            </div>
          </div>

          <FechaJornadaFields />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="temperaturaCelsius">Temperatura (°C)</Label>
              <Input
                id="temperaturaCelsius"
                name="temperaturaCelsius"
                type="number"
                step="0.1"
                required
                placeholder="22.0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="humedadPorcentaje">Humedad (%)</Label>
              <Input
                id="humedadPorcentaje"
                name="humedadPorcentaje"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="55.0"
              />
            </div>
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
