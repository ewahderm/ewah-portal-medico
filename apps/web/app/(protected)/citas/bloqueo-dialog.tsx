"use client";

import { useActionState, useState } from "react";
import { crearBloqueo } from "@/lib/citas/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Opcion = { id: string; nombre: string };

function toItems(opciones: Opcion[]) {
  return opciones.map((o) => ({ value: o.id, label: o.nombre }));
}

export function BloqueoDialog({
  profesionales,
  consultorios,
  fechaSeleccionada,
  trigger,
}: {
  profesionales: Opcion[];
  consultorios: Opcion[];
  fechaSeleccionada: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearBloqueo, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear horario</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <Alert>
            <AlertDescription>
              Usa esto para vacaciones, almuerzo o capacitaciones — bloquea el horario
              en la agenda sin asociar un paciente.
            </AlertDescription>
          </Alert>

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="profesionalId">Profesional</Label>
              <Select name="profesionalId" required items={toItems(profesionales)}>
                <SelectTrigger id="profesionalId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {profesionales.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="consultorioId">Consultorio</Label>
              <Select name="consultorioId" required items={toItems(consultorios)}>
                <SelectTrigger id="consultorioId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {consultorios.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                name="fecha"
                type="date"
                required
                defaultValue={fechaSeleccionada}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horaInicio">Hora inicio</Label>
              <Input id="horaInicio" name="horaInicio" type="time" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horaFin">Hora fin</Label>
              <Input id="horaFin" name="horaFin" type="time" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea id="motivo" name="motivo" rows={2} placeholder="Ej: vacaciones" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Bloquear horario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
