"use client";

import { useActionState } from "react";
import { crearCampana, actualizarCampana } from "@/lib/campanas/actions";
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
import { toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { SIN_SELECCION } from "@/lib/forms/opcional";

type Campana = {
  id: string;
  nombre: string;
  canal_captacion_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto: number | null;
  objetivo: string | null;
};

export function CampanaDialog({
  canalesCaptacion,
  campana,
  trigger,
}: {
  canalesCaptacion: Opcion[];
  campana?: Campana;
  trigger: React.ReactNode;
}) {
  const action = campana ? actualizarCampana : crearCampana;
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <Dialog>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{campana ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {campana ? <input type="hidden" name="id" value={campana.id} /> : null}

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              required
              defaultValue={campana?.nombre}
              placeholder="Ej: Promo Botox marzo — Instagram"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="canalCaptacionId">Canal (opcional)</Label>
            <Combobox
              id="canalCaptacionId"
              name="canalCaptacionId"
              items={toItemsOpcional(canalesCaptacion, SIN_SELECCION, "Selecciona una opción")}
              defaultValue={campana?.canal_captacion_id ?? SIN_SELECCION}
              placeholder="Selecciona"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="fechaInicio">Fecha de inicio (opcional)</Label>
              <Input
                id="fechaInicio"
                name="fechaInicio"
                type="date"
                defaultValue={campana?.fecha_inicio ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFin">Fecha de fin (opcional)</Label>
              <Input
                id="fechaFin"
                name="fechaFin"
                type="date"
                defaultValue={campana?.fecha_fin ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="presupuesto">Presupuesto (opcional)</Label>
            <Input
              id="presupuesto"
              name="presupuesto"
              type="number"
              min="0"
              step="1000"
              defaultValue={campana?.presupuesto ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="objetivo">Objetivo (opcional)</Label>
            <Textarea
              id="objetivo"
              name="objetivo"
              rows={3}
              placeholder="Qué se busca lograr con esta campaña"
              defaultValue={campana?.objetivo ?? ""}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : campana ? "Guardar cambios" : "Crear campaña"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
