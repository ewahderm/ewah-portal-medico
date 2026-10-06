"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { subirComprobantePlanilla } from "@/lib/rrhh/planilla";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PlanillaDialog({ onSubido }: { onSubido: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hoy = new Date();

  function handleSubir(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await subirComprobantePlanilla(formData);
        onSubido();
        toast.add({ title: "Comprobante guardado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el comprobante.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PlusIcon /> Subir comprobante de planilla
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comprobante de pago de planilla (PILA)</DialogTitle>
        </DialogHeader>
        <form action={handleSubir} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="periodoMes">Mes</Label>
              <Input id="periodoMes" name="periodoMes" type="number" min="1" max="12" defaultValue={hoy.getMonth() + 1} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodoAnio">Año</Label>
              <Input id="periodoAnio" name="periodoAnio" type="number" defaultValue={hoy.getFullYear()} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fechaPago">Fecha de pago</Label>
            <Input id="fechaPago" name="fechaPago" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="archivo" className="font-semibold">Archivo (PDF)</Label>
            <FileInput id="archivo" name="archivo" accept="application/pdf" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Subiendo..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
