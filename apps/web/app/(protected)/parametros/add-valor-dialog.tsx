"use client";

import { useActionState, useState } from "react";
import { crearValorCatalogo } from "@/lib/parametros/actions";
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

export function AddValorDialog({ tabla, nombre }: { tabla: string; nombre: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearValorCatalogo, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Agregar valor</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo valor en {nombre}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="tabla" value={tabla} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo">Código (opcional)</Label>
            <Input id="codigo" name="codigo" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Agregar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
