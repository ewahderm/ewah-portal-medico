"use client";

import { useActionState } from "react";
import { crearProveedor, editarProveedor } from "@/lib/parametros/proveedores";
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

type Proveedor = {
  id: string;
  nombre: string;
  tipo_identificacion_id: string | null;
  numero_identificacion: string | null;
  observaciones: string | null;
};

export function ProveedorDialog({
  tiposIdentificacion,
  editando,
  trigger,
}: {
  tiposIdentificacion: Opcion[];
  editando?: Proveedor;
  trigger: React.ReactElement;
}) {
  const accion = editando ? editarProveedor : crearProveedor;
  const [state, formAction, pending] = useActionState(accion, null);
  const itemsTipoIdentificacion = toItemsOpcional(
    tiposIdentificacion,
    SIN_SELECCION,
    "Sin especificar",
  );

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tipoIdentificacionId">Tipo de identificación</Label>
              <Combobox
                id="tipoIdentificacionId"
                name="tipoIdentificacionId"
                items={itemsTipoIdentificacion}
                defaultValue={editando?.tipo_identificacion_id ?? SIN_SELECCION}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numeroIdentificacion">Número de identificación</Label>
              <Input
                id="numeroIdentificacion"
                name="numeroIdentificacion"
                defaultValue={editando?.numero_identificacion ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              defaultValue={editando?.observaciones ?? ""}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear proveedor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
