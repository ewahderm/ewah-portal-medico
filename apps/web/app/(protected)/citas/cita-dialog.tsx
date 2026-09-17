"use client";

import { useActionState, useState } from "react";
import { crearCita } from "@/lib/citas/actions";
import { opcionesHora, sumarMinutos } from "@/lib/citas/horarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";

type Opcion = { id: string; nombre: string };

const OPCIONES_HORA = opcionesHora();

function toItems(opciones: Opcion[]) {
  return opciones.map((o) => ({ value: o.id, label: o.nombre }));
}

export function CitaDialog({
  pacientes,
  profesionales,
  consultorios,
  tiposTratamiento,
  fechaSeleccionada,
  horaInicioSeleccionada,
  trigger,
  open: openControlado,
  onOpenChange: onOpenChangeControlado,
}: {
  pacientes: Opcion[];
  profesionales: Opcion[];
  consultorios: Opcion[];
  tiposTratamiento: Opcion[];
  fechaSeleccionada: string;
  horaInicioSeleccionada?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInterno, setOpenInterno] = useState(false);
  const open = openControlado ?? openInterno;
  const setOpen = onOpenChangeControlado ?? setOpenInterno;
  const [state, formAction, pending] = useActionState(crearCita, null);
  const [horaInicio, setHoraInicio] = useState(horaInicioSeleccionada ?? "09:00");
  const [horaFin, setHoraFin] = useState(sumarMinutos(horaInicioSeleccionada ?? "09:00", 60));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {state?.warning ? (
            <Alert>
              <AlertDescription>
                Cita agendada, pero: {state.warning}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="pacienteId">Paciente</Label>
            <Combobox
              id="pacienteId"
              name="pacienteId"
              required
              items={toItems(pacientes)}
              placeholder="Selecciona un paciente"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipoTratamientoId">Tipo de tratamiento</Label>
            <Combobox
              id="tipoTratamientoId"
              name="tipoTratamientoId"
              required
              items={toItems(tiposTratamiento)}
              placeholder="Selecciona un tratamiento"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="profesionalId">Profesional</Label>
              <Combobox
                id="profesionalId"
                name="profesionalId"
                required
                items={toItems(profesionales)}
                placeholder="Selecciona"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consultorioId">Consultorio</Label>
              <Combobox
                id="consultorioId"
                name="consultorioId"
                required
                items={toItems(consultorios)}
                placeholder="Selecciona"
              />
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
              <Combobox
                id="horaInicio"
                name="horaInicio"
                required
                items={OPCIONES_HORA}
                value={horaInicio}
                onValueChange={(valor) => {
                  const nuevaHoraInicio = String(valor ?? "");
                  setHoraInicio(nuevaHoraInicio);
                  setHoraFin(sumarMinutos(nuevaHoraInicio, 60));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horaFin">Hora fin</Label>
              <Combobox
                id="horaFin"
                name="horaFin"
                required
                items={OPCIONES_HORA}
                value={horaFin}
                onValueChange={(valor) => setHoraFin(String(valor ?? ""))}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Agendando..." : "Agendar cita"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
