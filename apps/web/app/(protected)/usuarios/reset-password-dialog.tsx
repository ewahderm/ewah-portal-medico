"use client";

import { useActionState, useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { restablecerPassword } from "@/lib/rbac/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ResetPasswordDialog({
  usuarioId,
  nombre,
}: {
  usuarioId: string;
  nombre: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(restablecerPassword, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    toast.add({ title: "Contraseña restablecida", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRoundIcon /> Contraseña
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Defines una contraseña nueva para {nombre} y se la entregas. Si la cuenta estaba
            bloqueada por intentos fallidos, también queda desbloqueada.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <input type="hidden" name="usuarioId" value={usuarioId} />

          <div className="space-y-2">
            <Label htmlFor={`password-${usuarioId}`}>Contraseña nueva</Label>
            <Input
              id={`password-${usuarioId}`}
              name="password"
              type="text"
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
            />
            <p className="text-xs text-muted-foreground">
              Se muestra en pantalla para que puedas copiarla. No queda guardada en ningún lado
              legible: se cifra al instante.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Restablecer contraseña"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
