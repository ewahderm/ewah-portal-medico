"use client";

import { useActionState, useMemo, useState } from "react";
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
import { toItems, type Opcion } from "@/lib/forms/opciones";

type Consultorio = { id: string; nombre: string; sede_id: string };

const OPCIONES_HORA = opcionesHora();

export function CitaDialog({
  pacientes,
  profesionales,
  consultorios,
  sedes,
  tiposTratamiento,
  fechaSeleccionada,
  horaInicioSeleccionada,
  trigger,
  open: openControlado,
  onOpenChange: onOpenChangeControlado,
}: {
  pacientes: Opcion[];
  profesionales: Opcion[];
  consultorios: Consultorio[];
  sedes: Opcion[];
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
  const [sedeId, setSedeId] = useState("");

  const consultoriosDeLaSede = useMemo(
    () => consultorios.filter((c) => c.sede_id === sedeId),
    [consultorios, sedeId],
  );

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

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox
                id="sedeId"
                items={toItems(sedes)}
                value={sedeId}
                onValueChange={(valor) => setSedeId(String(valor ?? ""))}
                placeholder="Selecciona"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consultorioId">Consultorio</Label>
              <Combobox
                key={sedeId}
                id="consultorioId"
                name="consultorioId"
                required
                disabled={consultoriosDeLaSede.length === 0}
                items={toItems(consultoriosDeLaSede)}
                placeholder={
                  !sedeId
                    ? "Elige una sede primero"
                    : consultoriosDeLaSede.length === 0
                      ? "Sin consultorios en esta sede"
                      : "Selecciona"
                }
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
