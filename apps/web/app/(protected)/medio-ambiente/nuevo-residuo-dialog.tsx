"use client";

import { useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearResiduo } from "@/lib/medio-ambiente/actions";
import { datetimeLocalAhora } from "@/lib/medio-ambiente/fecha-local";
import { TIPOS_RESIDUO } from "@/lib/medio-ambiente/constantes";
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

const ITEMS_TIPO_RESIDUO = TIPOS_RESIDUO.map((t) => ({
  value: t.value,
  label: `${t.caneca === "roja" ? "Roja" : t.caneca === "blanca" ? "Blanca" : "Negra"} — ${t.label}`,
}));

export function NuevoResiduoDialog({
  sedes,
  onCreado,
}: {
  sedes: Opcion[];
  onCreado: () => void;
}) {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (prevState: Awaited<ReturnType<typeof crearResiduo>>, formData: FormData) => {
      const local = String(formData.get("registradoEnLocal") ?? "");
      if (local) formData.set("registradoEn", new Date(local).toISOString());
      return crearResiduo(prevState, formData);
    },
    null,
  );

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onCreado();
    toast.add({ title: "Registro guardado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Nuevo registro
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Peso de residuos</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="sedeId">Sede</Label>
            <Combobox id="sedeId" name="sedeId" required items={toItems(sedes)} placeholder="Buscar sede..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipoResiduo">Tipo de residuo / caneca</Label>
            <Combobox
              id="tipoResiduo"
              name="tipoResiduo"
              required
              items={ITEMS_TIPO_RESIDUO}
              placeholder="Escriba para buscar tipo..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pesoKg">Peso (kg)</Label>
              <Input id="pesoKg" name="pesoKg" type="number" step="0.001" min="0" required placeholder="0.000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registradoEnLocal">Fecha y hora</Label>
              <Input
                id="registradoEnLocal"
                name="registradoEnLocal"
                type="datetime-local"
                required
                defaultValue={datetimeLocalAhora()}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea id="observaciones" name="observaciones" rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
