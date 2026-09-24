"use client";

import { useActionState } from "react";
import { crearConsultorio, editarConsultorio } from "@/lib/parametros/consultorios";
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

type Consultorio = {
  id: string;
  nombre: string;
  sede_id: string;
  codigo: string | null;
};

export function ConsultorioDialog({
  sedes,
  editando,
  trigger,
}: {
  sedes: Opcion[];
  editando?: Consultorio;
  trigger: React.ReactElement;
}) {
  const accion = editando ? editarConsultorio : crearConsultorio;
  const [state, formAction, pending] = useActionState(accion, null);
  const itemsSedes = toItems(sedes);

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar consultorio" : "Nuevo consultorio"}</DialogTitle>
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
            <Input id="nombre" name="nombre" defaultValue={editando?.nombre} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sedeId">Sede</Label>
            <Combobox
              id="sedeId"
              name="sedeId"
              items={itemsSedes}
              defaultValue={editando?.sede_id}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo">Código (opcional)</Label>
            <Input id="codigo" name="codigo" defaultValue={editando?.codigo ?? ""} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear consultorio"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
