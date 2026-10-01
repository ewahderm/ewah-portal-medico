"use client";

import { useState } from "react";
import { useActionState } from "react";
import { crearExtintor, editarExtintor } from "@/lib/medio-ambiente/actions";
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

type Extintor = {
  id: string;
  sede_id: string;
  tipo_extintor_id: string;
  ubicacion: string;
  numero_serie: string | null;
  capacidad: string | null;
  fecha_adquisicion: string | null;
  fecha_ultima_recarga: string | null;
  fecha_vencimiento: string;
  observaciones: string | null;
};

export function ExtintorDialog({
  sedes,
  tiposExtintor,
  editando,
  trigger,
  onGuardado,
}: {
  sedes: Opcion[];
  tiposExtintor: Opcion[];
  editando?: Extintor;
  trigger: React.ReactElement;
  onGuardado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const accion = editando ? editarExtintor : crearExtintor;
  const [state, formAction, pending] = useActionState(accion, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onGuardado();
    toast.add({ title: editando ? "Extintor actualizado" : "Extintor creado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar extintor" : "Nuevo extintor"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editando ? <input type="hidden" name="id" value={editando.id} /> : null}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox
                id="sedeId"
                name="sedeId"
                required
                items={toItems(sedes)}
                defaultValue={editando?.sede_id}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipoExtintorId">Tipo de extintor</Label>
              <Combobox
                id="tipoExtintorId"
                name="tipoExtintorId"
                required
                items={toItems(tiposExtintor)}
                defaultValue={editando?.tipo_extintor_id}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ubicacion">Ubicación</Label>
            <Input
              id="ubicacion"
              name="ubicacion"
              required
              defaultValue={editando?.ubicacion}
              placeholder="Ej. Pasillo principal, Recepción..."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="numeroSerie">N° de serie (opcional)</Label>
              <Input id="numeroSerie" name="numeroSerie" defaultValue={editando?.numero_serie ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacidad">Capacidad (opcional)</Label>
              <Input id="capacidad" name="capacidad" defaultValue={editando?.capacidad ?? ""} placeholder="Ej. 10 lbs" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fechaAdquisicion">Adquisición</Label>
              <Input
                id="fechaAdquisicion"
                name="fechaAdquisicion"
                type="date"
                defaultValue={editando?.fecha_adquisicion ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaUltimaRecarga">Última recarga</Label>
              <Input
                id="fechaUltimaRecarga"
                name="fechaUltimaRecarga"
                type="date"
                defaultValue={editando?.fecha_ultima_recarga ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaVencimiento">Vencimiento</Label>
              <Input
                id="fechaVencimiento"
                name="fechaVencimiento"
                type="date"
                required
                defaultValue={editando?.fecha_vencimiento}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Fecha de vencimiento: la próxima recarga o prueba hidrostática, según el sticker
            físico del extintor. No se calcula sola — varía según tipo y norma.
          </p>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea id="observaciones" name="observaciones" rows={2} defaultValue={editando?.observaciones ?? ""} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear extintor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
