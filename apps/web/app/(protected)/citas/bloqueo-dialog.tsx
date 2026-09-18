"use client";

import { useActionState, useMemo, useState } from "react";
import { crearBloqueo } from "@/lib/citas/actions";
import { opcionesHora, sumarMinutos } from "@/lib/citas/horarios";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toItems, toItemsOpcional, type Opcion } from "@/lib/forms/opciones";

type Consultorio = { id: string; nombre: string; sede_id: string };

const OPCIONES_HORA = opcionesHora();
const TODAS_LAS_SEDES = "__todas_las_sedes__";

function consultoriosOpcionales(opciones: Opcion[]) {
  return toItemsOpcional(opciones, SIN_SELECCION, "Sin consultorio específico");
}

export function BloqueoDialog({
  profesionales,
  consultorios,
  sedes,
  fechaSeleccionada,
  trigger,
}: {
  profesionales: Opcion[];
  consultorios: Consultorio[];
  sedes: Opcion[];
  fechaSeleccionada: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearBloqueo, null);
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState(sumarMinutos("09:00", 60));
  const [todoElDia, setTodoElDia] = useState(false);
  const [sedeId, setSedeId] = useState(TODAS_LAS_SEDES);
  const [profesionalesSeleccionados, setProfesionalesSeleccionados] = useState<Set<string>>(
    new Set(),
  );

  const consultoriosDisponibles = useMemo(
    () => (sedeId === TODAS_LAS_SEDES ? consultorios : consultorios.filter((c) => c.sede_id === sedeId)),
    [consultorios, sedeId],
  );

  function toggleProfesional(id: string, marcado: boolean) {
    setProfesionalesSeleccionados((prev) => {
      const copia = new Set(prev);
      if (marcado) copia.add(id);
      else copia.delete(id);
      return copia;
    });
  }

  const todosSeleccionados = profesionales.length > 0 && profesionalesSeleccionados.size === profesionales.length;

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
              Usa esto para vacaciones, incapacidades, almuerzo o capacitaciones — bloquea
              la agenda de uno o varios profesionales sin asociar un paciente.
            </AlertDescription>
          </Alert>

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Profesionales</Label>
              <button
                type="button"
                className="text-xs text-accent-foreground hover:underline"
                onClick={() =>
                  setProfesionalesSeleccionados(
                    todosSeleccionados ? new Set() : new Set(profesionales.map((p) => p.id)),
                  )
                }
              >
                {todosSeleccionados ? "Ninguno" : "Todos"}
              </button>
            </div>
            <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-input p-3">
              {profesionales.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="profesionalIds"
                    value={p.id}
                    checked={profesionalesSeleccionados.has(p.id)}
                    onCheckedChange={(marcado) => toggleProfesional(p.id, marcado === true)}
                  />
                  {p.nombre}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="sedeIdFiltro">Sede</Label>
              <Combobox
                id="sedeIdFiltro"
                items={[{ value: TODAS_LAS_SEDES, label: "Todas las sedes" }, ...toItems(sedes)]}
                value={sedeId}
                onValueChange={(valor) => setSedeId(String(valor ?? TODAS_LAS_SEDES))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consultorioId">Consultorio (opcional)</Label>
              <Combobox
                key={sedeId}
                id="consultorioId"
                name="consultorioId"
                items={consultoriosOpcionales(consultoriosDisponibles)}
                defaultValue={SIN_SELECCION}
              />
            </div>
          </div>

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

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="todoElDia"
              checked={todoElDia}
              onCheckedChange={(marcado) => setTodoElDia(marcado === true)}
            />
            Todo el día
          </label>

          {!todoElDia ? (
            <div className="grid grid-cols-2 gap-6">
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
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea id="motivo" name="motivo" rows={2} placeholder="Ej: vacaciones" />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={pending || profesionalesSeleccionados.size === 0}
          >
            {pending ? "Guardando..." : "Bloquear horario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
