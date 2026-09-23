"use client";

import { useActionState, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { crearPacienteRapido } from "@/lib/pacientes/actions";
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

// Creación mínima de paciente, pensada para agendar una cita mientras se
// habla por teléfono o WhatsApp: solo nombre, apellido, correo y teléfono.
// El documento de identidad se deja pendiente a propósito — se completa
// en el consultorio en la primera visita (ver lib/pacientes/completitud.ts,
// que bloquea crear tratamientos para un paciente con datos pendientes).
export function PacienteRapidoDialog({
  onCreado,
}: {
  onCreado: (paciente: { id: string; nombre: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearPacienteRapido, null);

  useCerrarAlExito(pending, !!state?.creado, () => {
    if (state?.creado) onCreado(state.creado);
    setOpen(false);
    toast.add({
      title: "Paciente creado",
      description: "Recuerda completar su documento de identidad en el consultorio.",
      type: "success",
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <UserPlusIcon /> Nuevo paciente
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo paciente</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <Alert>
            <AlertDescription>
              Solo lo esencial para agendar. El documento de identidad y los demás
              datos se completan en el consultorio.
            </AlertDescription>
          </Alert>

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="primerNombreRapido">Nombre</Label>
              <Input id="primerNombreRapido" name="primerNombre" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="primerApellidoRapido">Apellido</Label>
              <Input id="primerApellidoRapido" name="primerApellido" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emailRapido">Correo</Label>
            <Input id="emailRapido" name="email" type="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefono1Rapido">Teléfono</Label>
            <Input id="telefono1Rapido" name="telefono1" required />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creando..." : "Crear paciente"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
