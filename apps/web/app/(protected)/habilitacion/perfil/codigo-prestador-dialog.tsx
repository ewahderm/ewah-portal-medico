"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarCodigoPrestador } from "@/lib/habilitacion/perfil";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function CodigoPrestadorDialog({ codigoActual, trigger }: { codigoActual: string; trigger: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(actualizarCodigoPrestador, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    router.refresh();
    toast.add({ title: "Código del prestador guardado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Código del prestador</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="codigo">Código de habilitación del prestador</Label>
            <Input id="codigo" name="codigo" defaultValue={codigoActual} maxLength={50} placeholder="Ej. 110010000001" />
            <p className="text-xs text-muted-foreground">
              Te lo asigna el REPS al inscribirte. Es el mismo campo de Parámetros → Datos básicos. Déjalo vacío si
              todavía no lo tienes.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar código"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
