"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { crearCargo, editarCargo } from "@/lib/parametros/cargos";
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
import { Combobox } from "@/components/ui/combobox";
import { toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { SIN_SELECCION } from "@/lib/forms/opcional";

type Cargo = {
  id: string;
  nombre: string;
  codigo: string | null;
  clase_riesgo_id: string | null;
};

export function CargoDialog({
  clasesRiesgo,
  claseRiesgoDefaultId,
  editando,
  trigger,
}: {
  clasesRiesgo: Opcion[];
  claseRiesgoDefaultId?: string | null;
  editando?: Cargo;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const accion = editando ? editarCargo : crearCargo;
  const [state, formAction, pending] = useActionState(accion, null);
  const itemsClasesRiesgo = toItemsOpcional(clasesRiesgo, SIN_SELECCION, "Sin especificar");
  // Al crear un cargo nuevo, se sugiere el nivel de riesgo por defecto de
  // la clínica (Datos básicos) — nunca pisa el riesgo ya asignado a un
  // cargo existente, por eso solo aplica cuando !editando.
  const claseRiesgoInicial = editando
    ? (editando.clase_riesgo_id ?? SIN_SELECCION)
    : (claseRiesgoDefaultId ?? SIN_SELECCION);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    router.refresh();
    toast.add({ title: editando ? "Cargo actualizado" : "Cargo creado", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar cargo" : "Nuevo cargo"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editando ? <input type="hidden" name="id" value={editando.id} /> : null}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              defaultValue={editando?.nombre}
              required
              placeholder="Ej. Auxiliar de enfermería"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="claseRiesgoId">Clase de riesgo (opcional)</Label>
            <Combobox
              id="claseRiesgoId"
              name="claseRiesgoId"
              items={itemsClasesRiesgo}
              defaultValue={claseRiesgoInicial}
            />
            <p className="text-xs text-muted-foreground">
              Determina el aporte de ARL al generar la nómina — solo aplica en Colombia.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo">Código (opcional)</Label>
            <Input id="codigo" name="codigo" defaultValue={editando?.codigo ?? ""} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear cargo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
