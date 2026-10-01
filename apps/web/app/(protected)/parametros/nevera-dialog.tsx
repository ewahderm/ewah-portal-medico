"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { crearNevera, editarNevera } from "@/lib/parametros/neveras";
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

type Nevera = {
  id: string;
  nombre: string;
  sede_id: string;
  codigo: string | null;
};

export function NeveraDialog({
  sedes,
  editando,
  trigger,
}: {
  sedes: Opcion[];
  editando?: Nevera;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const accion = editando ? editarNevera : crearNevera;
  const [state, formAction, pending] = useActionState(accion, null);
  const itemsSedes = toItems(sedes);

  // Esta tabla no mantiene su propio estado de cliente (a diferencia de los
  // listados de Medio Ambiente) — los valores llegan como prop desde el
  // Server Component de /parametros, así que router.refresh() es lo que
  // hace que la tabla muestre el cambio sin recargar la página a mano.
  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    router.refresh();
    toast.add({ title: editando ? "Nevera actualizada" : "Nevera creada", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar nevera" : "Nueva nevera"}</DialogTitle>
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
            <Input
              id="nombre"
              name="nombre"
              defaultValue={editando?.nombre}
              required
              placeholder="Ej. Nevera principal"
            />
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
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear nevera"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
