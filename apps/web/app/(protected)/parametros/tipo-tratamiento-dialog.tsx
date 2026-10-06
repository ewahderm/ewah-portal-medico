"use client";

import { useActionState } from "react";
import { crearTipoTratamiento, editarTipoTratamiento } from "@/lib/parametros/tipos-tratamiento";
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

type CupsOpcion = { id: string; codigo: string; descripcion: string };

type TipoTratamiento = {
  id: string;
  nombre: string;
  codigo: string | null;
  servicio_habilitado_id: string | null;
  cups_id: string | null;
};

export function TipoTratamientoDialog({
  cups,
  servicios,
  editando,
  trigger,
}: {
  cups: CupsOpcion[];
  servicios: Opcion[];
  editando?: TipoTratamiento;
  trigger: React.ReactElement;
}) {
  const accion = editando ? editarTipoTratamiento : crearTipoTratamiento;
  const [state, formAction, pending] = useActionState(accion, null);
  const opcionesCups: Opcion[] = cups.map((c) => ({ id: c.id, nombre: `${c.codigo} — ${c.descripcion}` }));
  const itemsCups = toItemsOpcional(opcionesCups, SIN_SELECCION, "Sin especificar");
  const itemsServicios = toItemsOpcional(servicios, SIN_SELECCION, "Sin especificar");

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar tipo de tratamiento" : "Nuevo tipo de tratamiento"}</DialogTitle>
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
            <Input id="nombre" name="nombre" defaultValue={editando?.nombre} required placeholder="Ej. Botox" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo">Código (opcional)</Label>
            <Input id="codigo" name="codigo" defaultValue={editando?.codigo ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="servicioHabilitadoId">Código de habilitación (opcional)</Label>
            <Combobox
              id="servicioHabilitadoId"
              name="servicioHabilitadoId"
              items={itemsServicios}
              defaultValue={editando?.servicio_habilitado_id ?? SIN_SELECCION}
              placeholder="Buscar..."
            />
            <p className="text-xs text-muted-foreground">
              {servicios.length === 0
                ? "Tu clínica todavía no tiene servicios habilitados. Agrégalos en Datos básicos de la clínica (botón arriba a la derecha) y aparecerán aquí."
                : "Servicio habilitado (REPS) con el que tu clínica presta este tratamiento. Los códigos se administran en Datos básicos de la clínica."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cupsId">CUPS (opcional)</Label>
            <Combobox
              id="cupsId"
              name="cupsId"
              items={itemsCups}
              defaultValue={editando?.cups_id ?? SIN_SELECCION}
              placeholder="Buscar..."
            />
            <p className="text-xs text-muted-foreground">
              {cups.length === 0
                ? "Tu clínica todavía no ha activado ningún CUPS. Actívalos en la pestaña CUPS (junto a esta) y aparecerán aquí."
                : "Solo aparecen los CUPS activados por tu clínica. Para agregar otros, actívalos en la pestaña CUPS."}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear tipo de tratamiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
