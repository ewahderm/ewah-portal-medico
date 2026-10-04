"use client";

import { useActionState, useState } from "react";
import { crearEvolucion } from "@/lib/pacientes/evoluciones";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { SIN_SELECCION } from "@/lib/forms/opcional";
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
import { toItems, toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { hoy } from "@/lib/format";

export function EvolucionDialog({
  pacienteId,
  citaId,
  profesionales,
  usuarioActualId,
  tratamientos,
  tipo = "seguimiento",
  trigger,
  onGuardado,
}: {
  pacienteId: string;
  /** Presente cuando se abre desde el detalle de una cita — al guardar,
   * esa cita se marca "atendida" aunque no se registre ningún tratamiento. */
  citaId?: string;
  profesionales: Opcion[];
  usuarioActualId: string;
  /** Tratamientos previos de este paciente, para ligar opcionalmente la
   * evolución a uno de ellos (seguimiento de un procedimiento concreto).
   * Se omite desde el detalle de una cita: ese flujo es para un control
   * sin procedimiento, por eso solo aparece en la ficha del paciente. */
  tratamientos?: Opcion[];
  /** "epicrisis" solo se usa desde la pestaña Evoluciones de la ficha del
   * paciente — cambia el título/botón y marca la fila para distinguirla
   * de un control normal, pero es la misma tabla y el mismo permiso. */
  tipo?: "seguimiento" | "epicrisis";
  trigger: React.ReactElement;
  onGuardado?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearEvolucion, null);
  const esEpicrisis = tipo === "epicrisis";

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onGuardado?.();
    toast.add({ title: esEpicrisis ? "Epicrisis registrada" : "Evolución registrada", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEpicrisis ? "Registrar epicrisis" : "Registrar evolución"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="pacienteId" value={pacienteId} />
          <input type="hidden" name="tipo" value={tipo} />
          {citaId ? <input type="hidden" name="citaId" value={citaId} /> : null}

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" name="fecha" type="date" required defaultValue={hoy()} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profesionalId">Profesional</Label>
              <Combobox
                id="profesionalId"
                name="profesionalId"
                required
                items={toItems(profesionales)}
                defaultValue={usuarioActualId}
                placeholder="Selecciona"
              />
            </div>
          </div>

          {tratamientos && tratamientos.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="tratamientoId">Tratamiento al que hace seguimiento (opcional)</Label>
              <Combobox
                id="tratamientoId"
                name="tratamientoId"
                items={toItemsOpcional(tratamientos, SIN_SELECCION, "Ninguno — control general")}
                defaultValue={SIN_SELECCION}
                placeholder="Selecciona"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="evolucion">{esEpicrisis ? "Epicrisis" : "Evolución"}</Label>
            <Textarea
              id="evolucion"
              name="evolucion"
              rows={5}
              required
              placeholder={
                esEpicrisis
                  ? "Resumen de cierre: diagnóstico, procedimientos realizados, resultado y recomendaciones..."
                  : "¿Cómo evolucionó el paciente? Hallazgos, complicaciones, plan..."
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proximoControlFecha">Próximo control (opcional)</Label>
            <Input id="proximoControlFecha" name="proximoControlFecha" type="date" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : esEpicrisis ? "Registrar epicrisis" : "Registrar evolución"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
