"use client";

import { useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearAccidenteTrabajo } from "@/lib/rrhh/accidentes";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
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
import { toItems, type Opcion } from "@/lib/forms/opciones";

export function AccidenteDialog({ empleados, onCreado }: { empleados: Opcion[]; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearAccidenteTrabajo, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onCreado();
    toast.add({ title: "Accidente registrado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Registrar accidente
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo accidente laboral</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="empleadoId">Empleado</Label>
            <Combobox id="empleadoId" name="empleadoId" required items={toItems(empleados)} placeholder="Buscar empleado..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" name="fecha" type="date" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resumen">Resumen de lo sucedido</Label>
            <Textarea id="resumen" name="resumen" rows={3} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="causa">Causa (opcional)</Label>
            <Textarea id="causa" name="causa" rows={2} />
          </div>

          <Alert>
            <AlertDescription>
              Tienes 2 días hábiles para reportarlo a la ARL (Decreto 1072/2015) — el resto del
              seguimiento se registra después, editando este accidente.
            </AlertDescription>
          </Alert>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Registrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
