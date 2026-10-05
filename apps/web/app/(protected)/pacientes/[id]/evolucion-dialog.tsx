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
  atencionId,
  profesionales,
  usuarioActualId,
  tratamientos,
  tipo = "seguimiento",
  trigger,
  onGuardado,
}: {
  pacienteId: string;
  /** Toda evolución/epicrisis cuelga de una atención — el detalle de la
   * atención es el único lugar desde donde se abre este diálogo. */
  atencionId: string;
  profesionales: Opcion[];
  usuarioActualId: string;
  /** Tratamientos previos de este paciente, para ligar opcionalmente la
   * evolución a uno de ellos (seguimiento de un procedimiento concreto,
   * incluso de una atención anterior). */
  tratamientos?: Opcion[];
  /** "epicrisis_atencion" cierra solo esta atención; "epicrisis_general"
   * cierra todo el historial de tratamientos del paciente — cambia el
   * título/botón, misma tabla y mismo permiso en los tres casos. */
  tipo?: "seguimiento" | "epicrisis_atencion" | "epicrisis_general";
  trigger: React.ReactElement;
  onGuardado?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearEvolucion, null);
  const esEpicrisis = tipo !== "seguimiento";
  const tituloEpicrisis =
    tipo === "epicrisis_general" ? "Registrar epicrisis general" : "Registrar epicrisis de esta atención";

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
          <DialogTitle>{esEpicrisis ? tituloEpicrisis : "Registrar evolución"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="pacienteId" value={pacienteId} />
          <input type="hidden" name="atencionId" value={atencionId} />
          <input type="hidden" name="tipo" value={tipo} />

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
                tipo === "epicrisis_general"
                  ? "Resumen de cierre de todo el historial de tratamientos del paciente: diagnóstico, procedimientos realizados a lo largo del tiempo, resultado y recomendaciones..."
                  : tipo === "epicrisis_atencion"
                    ? "Resumen de cierre de esta atención: diagnóstico, procedimientos realizados hoy, resultado y recomendaciones..."
                    : "¿Cómo evolucionó el paciente? Hallazgos, complicaciones, plan..."
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proximoControlFecha">Próximo control (opcional)</Label>
            <Input id="proximoControlFecha" name="proximoControlFecha" type="date" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : esEpicrisis ? tituloEpicrisis : "Registrar evolución"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
