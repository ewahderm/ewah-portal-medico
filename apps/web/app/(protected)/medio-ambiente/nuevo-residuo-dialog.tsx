"use client";

import { useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearResiduo } from "@/lib/medio-ambiente/actions";
import { TIPOS_RESIDUO_NUEVOS, etiquetaOpcionResiduo } from "@/lib/medio-ambiente/constantes";
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
import { toItems, toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { FechaJornadaFields } from "./fecha-jornada-fields";

// Sin el "quimico" histórico: un pesaje nuevo elige la característica.
const ITEMS_TIPO_RESIDUO = TIPOS_RESIDUO_NUEVOS.map((t) => ({
  value: t.value,
  label: etiquetaOpcionResiduo(t),
}));

export function NuevoResiduoDialog({
  sedes,
  empleados,
  onCreado,
}: {
  sedes: Opcion[];
  empleados: Opcion[];
  onCreado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const itemsEmpleados = toItemsOpcional(empleados, SIN_SELECCION, "Sin especificar");

  const [state, formAction, pending] = useActionState(crearResiduo, null);

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

          <div className="space-y-2">
            <Label htmlFor="pesoKg">Peso (kg)</Label>
            <Input id="pesoKg" name="pesoKg" type="number" step="0.001" min="0" max="99999.999" required placeholder="0.000" />
          </div>

          <FechaJornadaFields />

          <div className="space-y-2">
            <Label htmlFor="empleadoId">Empleado que pesó el residuo (opcional)</Label>
            <Combobox
              id="empleadoId"
              name="empleadoId"
              items={itemsEmpleados}
              defaultValue={SIN_SELECCION}
              placeholder="Buscar empleado..."
            />
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
