"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { crearMotivoMovimiento, editarMotivoMovimiento } from "@/lib/parametros/motivos-movimiento";
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

const CATEGORIAS = [
  { value: "entrada", label: "Entrada (suma stock)" },
  { value: "salida", label: "Salida (resta stock)" },
];

type Motivo = {
  id: string;
  nombre: string;
  categoria: "entrada" | "salida";
  codigo: string;
};

export function MotivoMovimientoDialog({
  editando,
  trigger,
}: {
  editando?: Motivo;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const accion = editando ? editarMotivoMovimiento : crearMotivoMovimiento;
  const [state, formAction, pending] = useActionState(accion, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    router.refresh();
    toast.add({ title: editando ? "Motivo actualizado" : "Motivo creado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar motivo" : "Nuevo motivo de movimiento"}</DialogTitle>
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
              placeholder="Ej. Obsequio de proveedor"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoria">Categoría</Label>
            <Combobox
              id="categoria"
              name="categoria"
              items={CATEGORIAS}
              defaultValue={editando?.categoria}
              required
            />
            <p className="text-xs text-muted-foreground">
              Define si este motivo suma o resta del stock del lote. No se puede cambiar después
              de usarse en un movimiento.
            </p>
          </div>

          {editando ? (
            <div className="space-y-2">
              <Label>Código</Label>
              <Input value={editando.codigo} disabled />
              <p className="text-xs text-muted-foreground">
                El código queda fijo porque es lo que guarda el historial de movimientos ya
                registrados.
              </p>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear motivo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
