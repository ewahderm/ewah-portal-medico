"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { crearPlanMejora } from "@/lib/habilitacion/autoevaluacion";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { dateLocalHoy } from "@/lib/medio-ambiente/fecha-local";
import { sumarDias } from "@/lib/habilitacion/ruta";
import { MAX_JUSTIFICACION } from "@/lib/habilitacion/constantes";
import type { FilaCriterio, UsuarioClinica } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// HU-4.5: todo "No cumple" debería tener su acción de mejora con
// responsable y fecha compromiso antes de declarar. Se abre solo al marcar
// "No cumple" (AC3 de HU-4.2); se puede posponer.
export function PlanMejoraDialog({
  sedeId,
  fila,
  evaluacionId,
  usuarios,
  usuarioId,
  onCerrar,
}: {
  sedeId: string;
  fila: FilaCriterio;
  evaluacionId: string;
  usuarios: UsuarioClinica[];
  usuarioId: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(crearPlanMejora, null);

  useCerrarAlExito(pending, !state?.error, () => {
    toast.add({ title: "Plan de mejora creado", type: "success" });
    router.refresh();
    onCerrar();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan de mejora para {fila.codigo}</DialogTitle>
          <DialogDescription>
            Marcaste «No cumple». ¿Qué vas a hacer para cumplirlo, quién y para cuándo? Un servicio con un solo criterio
            sin cumplir no se puede declarar en el REPS.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="sedeId" value={sedeId} />
          <input type="hidden" name="criterioId" value={fila.criterio_id} />
          <input type="hidden" name="evaluacionId" value={evaluacionId} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="line-clamp-3 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{fila.texto_literal}</p>
          <div className="space-y-1">
            <Label htmlFor="accion">Acción de mejora</Label>
            <Textarea
              id="accion"
              name="accion"
              required
              minLength={10}
              maxLength={MAX_JUSTIFICACION}
              rows={3}
              autoFocus
              placeholder="Ej.: Solicitar al proveedor el certificado de calibración del tensiómetro y archivarlo en la hoja de vida del equipo."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="responsableId">Responsable</Label>
              <Combobox
                id="responsableId"
                name="responsableId"
                items={usuarios.map((u) => ({ value: u.id, label: u.nombre }))}
                defaultValue={usuarioId}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fechaCompromiso">Fecha compromiso</Label>
              <Input
                id="fechaCompromiso"
                name="fechaCompromiso"
                type="date"
                required
                min={dateLocalHoy()}
                defaultValue={sumarDias(dateLocalHoy(), 30)}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pending}>
              Lo hago después
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Crear plan de mejora"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
