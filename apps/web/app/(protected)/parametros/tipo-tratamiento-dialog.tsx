"use client";

import { useActionState } from "react";
import { crearTipoTratamiento, editarTipoTratamiento } from "@/lib/parametros/tipos-tratamiento";
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
import { toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { SIN_SELECCION } from "@/lib/forms/opcional";

type CupsOpcion = { id: string; codigo: string; descripcion: string };

type TipoTratamiento = {
  id: string;
  nombre: string;
  codigo: string | null;
  codigo_habilitacion: string | null;
  cups_id: string | null;
};

export function TipoTratamientoDialog({
  cups,
  editando,
  trigger,
}: {
  cups: CupsOpcion[];
  editando?: TipoTratamiento;
  trigger: React.ReactElement;
}) {
  const accion = editando ? editarTipoTratamiento : crearTipoTratamiento;
  const [state, formAction, pending] = useActionState(accion, null);
  const opcionesCups: Opcion[] = cups.map((c) => ({ id: c.id, nombre: `${c.codigo} — ${c.descripcion}` }));
  const itemsCups = toItemsOpcional(opcionesCups, SIN_SELECCION, "Sin especificar");

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar tipo de tratamiento" : "Nuevo tipo de tratamiento"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editando ? <input type="hidden" name="id" value={editando.id} /> : null}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" defaultValue={editando?.nombre} required placeholder="Ej. Botox" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo">Código (opcional)</Label>
            <Input id="codigo" name="codigo" defaultValue={editando?.codigo ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigoHabilitacion">Código de habilitación (opcional)</Label>
            <Input
              id="codigoHabilitacion"
              name="codigoHabilitacion"
              defaultValue={editando?.codigo_habilitacion ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Código del servicio habilitado (REPS) con el que tu clínica presta este tratamiento.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cupsId">CUPS (opcional)</Label>
            <Combobox
              id="cupsId"
              name="cupsId"
              items={itemsCups}
              defaultValue={editando?.cups_id ?? SIN_SELECCION}
              placeholder={cups.length === 0 ? "Todavía no hay CUPS cargados" : "Buscar..."}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear tipo de tratamiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
