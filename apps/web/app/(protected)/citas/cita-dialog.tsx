"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import { crearCita } from "@/lib/citas/actions";
import { opcionesHora, sumarMinutos } from "@/lib/citas/horarios";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
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
import { PacienteRapidoDialog } from "../pacientes/paciente-rapido-dialog";

type Consultorio = { id: string; nombre: string; sede_id: string };
type DesdePaciente = { id: string };

const OPCIONES_HORA = opcionesHora();

export function CitaDialog({
  pacientes,
  profesionales,
  consultorios,
  sedes,
  tiposTratamiento,
  fechaSeleccionada,
  horaInicioSeleccionada,
  sedeInicial,
  desdePaciente,
  pacientesPendientes = new Set(),
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
  sedeInicial?: string;
  desdePaciente?: DesdePaciente;
  pacientesPendientes?: Set<string>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInterno, setOpenInterno] = useState(false);
  const open = openControlado ?? openInterno;
  const setOpen = onOpenChangeControlado ?? setOpenInterno;
  const [forzar, setForzar] = useState(false);
  const [conflictoDescartado, setConflictoDescartado] = useState(false);
  const [state, formAction, pending] = useActionState(crearCita.bind(null, forzar), null);
  const conflicto = state?.conflicto && !conflictoDescartado ? state.conflicto : null;
  const [horaInicio, setHoraInicio] = useState(horaInicioSeleccionada ?? "09:00");
  const [horaFin, setHoraFin] = useState(sumarMinutos(horaInicioSeleccionada ?? "09:00", 60));
  const [sedeId, setSedeId] = useState(sedeInicial ?? "");
  const [pacientesLocal, setPacientesLocal] = useState(pacientes);
  const [pacienteId, setPacienteId] = useState(desdePaciente?.id ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  const consultoriosDeLaSede = useMemo(
    () => consultorios.filter((c) => c.sede_id === sedeId),
    [consultorios, sedeId],
  );

  const itemsPaciente = useMemo(
    () =>
      pacientesLocal.map((p) => ({
        value: p.id,
        label: pacientesPendientes.has(p.id) ? `${p.nombre} — Información pendiente` : p.nombre,
      })),
    [pacientesLocal, pacientesPendientes],
  );

  useCerrarAlExito(pending, !state?.error && !state?.conflicto, () => {
    setOpen(false);
    setForzar(false);
    setConflictoDescartado(false);
    toast.add({ title: "Cita agendada", type: "success" });
  });

  // El botón "Agendar de todas formas" solo marca forzar=true; el submit
  // real ocurre en este efecto, una vez que el formAction ligado (bind)
  // ya quedó actualizado con el nuevo valor — si se llamara requestSubmit()
  // en el mismo clic, todavía se enviaría con el forzar viejo.
  useEffect(() => {
    if (forzar && state?.conflicto) {
      formRef.current?.requestSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forzar]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setForzar(false);
          setConflictoDescartado(false);
        }
      }}
    >
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          action={formAction}
          className="space-y-5"
          onSubmit={() => setConflictoDescartado(false)}
        >
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {conflicto ? (
            <Alert variant="destructive">
              <AlertDescription className="space-y-3">
                <p>{conflicto}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForzar(false);
                      setConflictoDescartado(true);
                    }}
                  >
                    Cambiar horario
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => setForzar(true)}
                  >
                    Agendar de todas formas
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pacienteId">Paciente</Label>
              <PacienteRapidoDialog
                onCreado={(nuevo) => {
                  setPacientesLocal((actual) => [...actual, nuevo]);
                  setPacienteId(nuevo.id);
                }}
              />
            </div>
            <Combobox
              id="pacienteId"
              name="pacienteId"
              required
              items={itemsPaciente}
              value={pacienteId}
              onValueChange={(valor) => setPacienteId(String(valor ?? ""))}
              placeholder="Selecciona un paciente"
            />
            {pacienteId && pacientesPendientes.has(pacienteId) ? (
              <p className="text-xs text-amber-600">
                Este paciente tiene información obligatoria pendiente — no podrá recibir
                tratamientos hasta que se complete en su ficha.
              </p>
            ) : null}
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

          {!conflicto ? (
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Agendando..." : "Agendar cita"}
            </Button>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
