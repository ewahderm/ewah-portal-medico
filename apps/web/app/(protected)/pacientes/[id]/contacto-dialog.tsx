"use client";

import { useActionState, useState } from "react";
import { crearContacto } from "@/lib/contactos/actions";
import { SIN_SELECCION } from "@/lib/forms/opcional";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIPOS = [
  { value: "llamada", label: "Llamada" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Correo" },
  { value: "presencial", label: "Presencial" },
];

const RESULTADOS = [
  { value: SIN_SELECCION, label: "Selecciona una opción" },
  { value: "agendo_cita", label: "Agendó cita" },
  { value: "no_contesto", label: "No contestó" },
  { value: "rechazo", label: "Rechazó" },
  { value: "pendiente", label: "Pendiente" },
  { value: "otro", label: "Otro" },
];

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export function ContactoDialog({ pacienteId }: { pacienteId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearContacto, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Nuevo contacto</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="pacienteId" value={pacienteId} />

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de contacto</Label>
              <Select name="tipo" required items={TIPOS}>
                <SelectTrigger id="tipo" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" name="fecha" type="date" required defaultValue={hoy()} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nota">Nota</Label>
            <Textarea
              id="nota"
              name="nota"
              rows={3}
              required
              placeholder="¿De qué se habló con el paciente?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resultado">Resultado (opcional)</Label>
            <Select name="resultado" items={RESULTADOS} defaultValue={SIN_SELECCION}>
              <SelectTrigger id="resultado" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTADOS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="proximaAccionFecha">Próxima acción (opcional)</Label>
              <Input id="proximaAccionFecha" name="proximaAccionFecha" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proximaAccionNota">¿Qué hacer? (opcional)</Label>
              <Input
                id="proximaAccionNota"
                name="proximaAccionNota"
                placeholder="Ej: volver a llamar"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Registrar contacto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
