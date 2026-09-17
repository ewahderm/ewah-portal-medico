"use client";

import { useActionState, useState } from "react";
import { crearTratamiento } from "@/lib/tratamientos/actions";
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

type Correccion = {
  id: string;
  paciente_id: string;
  tipo_tratamiento_id: string;
  profesional_id: string;
  fecha: string;
  costo: number | null;
  notas: string | null;
};

function toItems(opciones: Opcion[]) {
  return opciones.map((o) => ({ value: o.id, label: o.nombre }));
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export function TratamientoDialog({
  pacientes,
  tiposTratamiento,
  profesionales,
  usuarioActualId,
  corrigiendo,
  trigger,
}: {
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  usuarioActualId: string;
  corrigiendo?: Correccion;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearTratamiento, null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {corrigiendo ? "Corregir tratamiento" : "Nuevo tratamiento"}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {corrigiendo ? (
            <input type="hidden" name="corrigeA" value={corrigiendo.id} />
          ) : null}

          {corrigiendo ? (
            <Alert>
              <AlertDescription>
                Este registro anulado no se modifica. Al guardar se crea un tratamiento
                nuevo que lo corrige.
              </AlertDescription>
            </Alert>
          ) : null}

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="pacienteId">Paciente</Label>
            <Select
              name="pacienteId"
              required
              items={toItems(pacientes)}
              defaultValue={corrigiendo?.paciente_id}
            >
              <SelectTrigger id="pacienteId" className="w-full">
                <SelectValue placeholder="Selecciona un paciente" />
              </SelectTrigger>
              <SelectContent>
                {pacientes.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipoTratamientoId">Tipo de tratamiento</Label>
            <Select
              name="tipoTratamientoId"
              required
              items={toItems(tiposTratamiento)}
              defaultValue={corrigiendo?.tipo_tratamiento_id}
            >
              <SelectTrigger id="tipoTratamientoId" className="w-full">
                <SelectValue placeholder="Selecciona un tratamiento" />
              </SelectTrigger>
              <SelectContent>
                {tiposTratamiento.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="profesionalId">Profesional</Label>
              <Select
                name="profesionalId"
                required
                items={toItems(profesionales)}
                defaultValue={corrigiendo?.profesional_id ?? usuarioActualId}
              >
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
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                name="fecha"
                type="date"
                required
                defaultValue={corrigiendo?.fecha ?? hoy()}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="costo">Costo (opcional)</Label>
            <Input
              id="costo"
              name="costo"
              type="number"
              min="0"
              step="1000"
              placeholder="0"
              defaultValue={corrigiendo?.costo ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas">Notas clínicas (opcional)</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={4}
              placeholder="Evolución, indicaciones, reacciones..."
              defaultValue={corrigiendo?.notas ?? ""}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : corrigiendo ? "Guardar corrección" : "Registrar tratamiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
