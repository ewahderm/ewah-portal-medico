"use client";

import { useActionState, useState } from "react";
import { createRol } from "@/lib/rbac/actions";
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

export function CreateRolDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createRol, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Crear rol</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear rol</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del rol</Label>
            <Input id="nombre" name="nombre" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción (opcional)</Label>
            <Input id="descripcion" name="descripcion" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creando..." : "Crear rol"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
