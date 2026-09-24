"use client";

import { useActionState, useState } from "react";
import { solicitarCambioPlan } from "@/lib/suscripcion/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
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

export function SolicitarPlanDialog({
  planCodigo,
  planNombre,
  trigger,
}: {
  planCodigo: string;
  planNombre: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(solicitarCambioPlan, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    toast.add({
      title: "Solicitud enviada",
      description: "EWAH te contactará pronto para coordinar el cambio de plan.",
      type: "success",
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar plan {planNombre}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="planCodigo" value={planCodigo} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Todavía no tenemos pagos en línea habilitados para Colombia. Al enviar esta
            solicitud, el equipo de EWAH te contactará para coordinar la actualización de
            tu plan.
          </p>

          <div className="space-y-2">
            <Label htmlFor="mensaje">Mensaje (opcional)</Label>
            <Textarea id="mensaje" name="mensaje" placeholder="Cuéntanos qué necesitas..." />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enviando..." : "Enviar solicitud"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
