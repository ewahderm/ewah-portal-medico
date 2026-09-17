"use client";

import { useActionState, useState } from "react";
import { inviteStaff } from "@/lib/rbac/actions";
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

type Rol = { id: string; nombre: string };

export function InviteDialog({ roles }: { roles: Rol[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(inviteStaff, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Invitar usuario</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
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
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rolId">Rol</Label>
            <Combobox
              id="rolId"
              name="rolId"
              required
              items={roles.map((rol) => ({ value: rol.id, label: rol.nombre }))}
              placeholder="Selecciona un rol"
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enviando invitación..." : "Enviar invitación"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
