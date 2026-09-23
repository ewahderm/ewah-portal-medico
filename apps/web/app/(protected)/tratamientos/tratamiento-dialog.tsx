"use client";

import { cloneElement, useActionState, useState } from "react";
import { crearTratamiento, editarTratamiento } from "@/lib/tratamientos/actions";
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
import { hoy } from "@/lib/format";

type Correccion = {
  id: string;
  paciente_id: string;
  tipo_tratamiento_id: string;
  profesional_id: string;
  sede_id: string;
  medio_pago_id: string;
  fecha: string;
  costo: number | null;
  notas: string | null;
  cufe: string | null;
};

type DesdeCita = {
  id: string;
  paciente_id: string;
  profesional_id: string;
  tipo_tratamiento_id: string | null;
  sede_id?: string;
  fecha: string;
};

type DesdePaciente = {
  id: string;
};

export function TratamientoDialog({
  pacientes,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
  corrigiendo,
  editando,
  desdeCita,
  desdePaciente,
  pacientesPendientes = new Set(),
  trigger,
}: {
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  sedes: Opcion[];
  mediosPago: Opcion[];
  usuarioActualId: string;
  corrigiendo?: Correccion;
  editando?: Correccion;
  desdeCita?: DesdeCita;
  desdePaciente?: DesdePaciente;
  pacientesPendientes?: Set<string>;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    editando ? editarTratamiento : crearTratamiento,
    null,
  );
  // Corregir (registro ya anulado) y Editar (atajo anular+corregir) parten
  // de la misma forma de tratamiento — solo difieren en qué campo oculto
  // envían y en qué acción de servidor invocan.
  const prefill = corrigiendo ?? editando;
  const pacienteInicial = prefill?.paciente_id ?? desdeCita?.paciente_id ?? desdePaciente?.id ?? "";
  const pacienteFijo = Boolean(prefill || desdeCita || desdePaciente);
  const [pacienteId, setPacienteId] = useState(pacienteInicial);
  const pacientePendiente = pacientesPendientes.has(pacienteId);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    toast.add({
      title: corrigiendo
        ? "Tratamiento corregido"
        : editando
          ? "Tratamiento editado"
          : "Tratamiento registrado",
      type: "success",
    });
  });

  // El paciente ya viene fijo (ficha del paciente, "Atender" desde una
  // cita, o Editar/Corregir de un tratamiento existente) y tiene
  // información obligatoria pendiente: ni se abre el diálogo, el botón
  // queda deshabilitado con una pista de por qué. El title va en un
  // <span> que envuelve el botón, no en el botón mismo — un botón
  // disabled trae pointer-events:none (ver components/ui/button.tsx),
  // así que un title puesto directamente ahí nunca llega a dispararse.
  if (pacienteFijo && pacientesPendientes.has(pacienteInicial)) {
    return (
      <span
        className="inline-block"
        title="Este paciente tiene información obligatoria pendiente — complétala en su ficha primero."
      >
        {cloneElement(trigger, { disabled: true } as Record<string, unknown>)}
      </span>
    );
  }

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
            {corrigiendo
              ? "Corregir tratamiento"
              : editando
                ? "Editar tratamiento"
                : desdeCita
                  ? "Atender cita"
                  : "Nuevo tratamiento"}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {corrigiendo ? (
            <input type="hidden" name="corrigeA" value={corrigiendo.id} />
          ) : null}
          {editando ? <input type="hidden" name="editaId" value={editando.id} /> : null}
          {desdeCita ? <input type="hidden" name="citaId" value={desdeCita.id} /> : null}

          {corrigiendo ? (
            <Alert>
              <AlertDescription>
                Este registro anulado no se modifica. Al guardar se crea un tratamiento
                nuevo que lo corrige.
              </AlertDescription>
            </Alert>
          ) : null}
          {editando ? (
            <Alert>
              <AlertDescription>
                El registro actual se anulará y se creará uno nuevo con estos datos — un
                tratamiento nunca se edita in-place.
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
            <Combobox
              id="pacienteId"
              name="pacienteId"
              required
              items={toItems(pacientes)}
              value={pacienteId}
              onValueChange={(valor) => setPacienteId(String(valor ?? ""))}
              placeholder="Selecciona un paciente"
            />
            {pacientePendiente ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Este paciente tiene información obligatoria pendiente. Complétala en su
                  ficha antes de registrar un tratamiento.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipoTratamientoId">Tipo de tratamiento</Label>
            <Combobox
              id="tipoTratamientoId"
              name="tipoTratamientoId"
              required
              items={toItems(tiposTratamiento)}
              defaultValue={prefill?.tipo_tratamiento_id ?? desdeCita?.tipo_tratamiento_id ?? undefined}
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
                defaultValue={prefill?.profesional_id ?? desdeCita?.profesional_id ?? usuarioActualId}
                placeholder="Selecciona"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                name="fecha"
                type="date"
                required
                defaultValue={prefill?.fecha ?? desdeCita?.fecha ?? hoy()}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox
                id="sedeId"
                name="sedeId"
                required
                items={toItems(sedes)}
                defaultValue={prefill?.sede_id ?? desdeCita?.sede_id}
                placeholder="Selecciona"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medioPagoId">Medio de pago</Label>
              <Combobox
                id="medioPagoId"
                name="medioPagoId"
                required
                items={toItems(mediosPago)}
                defaultValue={prefill?.medio_pago_id}
                placeholder="Selecciona"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="costo">Valor</Label>
            <Input
              id="costo"
              name="costo"
              type="number"
              min="0"
              step="1000"
              placeholder="0"
              required
              defaultValue={prefill?.costo ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas">Observaciones (opcional)</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={4}
              placeholder="Evolución, indicaciones, reacciones..."
              defaultValue={prefill?.notas ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cufe">CUFE (opcional)</Label>
            <Input
              id="cufe"
              name="cufe"
              placeholder="Código Único de Facturación Electrónica"
              defaultValue={prefill?.cufe ?? ""}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending || pacientePendiente}>
            {pending
              ? "Guardando..."
              : corrigiendo
                ? "Guardar corrección"
                : editando
                  ? "Guardar edición"
                  : desdeCita
                    ? "Registrar y marcar como atendida"
                    : "Registrar tratamiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
