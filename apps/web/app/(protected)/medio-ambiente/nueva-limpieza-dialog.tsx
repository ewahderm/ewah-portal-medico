"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearLimpieza } from "@/lib/medio-ambiente/actions";
import { AREAS_LIMPIEZA } from "@/lib/medio-ambiente/constantes";
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

type Consultorio = { id: string; nombre: string; sede_id: string };

const ITEMS_AREA = AREAS_LIMPIEZA.map((a) => ({ value: a.value, label: a.label }));

export function NuevaLimpiezaDialog({
  sedes,
  consultorios,
  empleados,
  nombreUsuario,
  onCreado,
}: {
  sedes: Opcion[];
  consultorios: Consultorio[];
  empleados: Opcion[];
  nombreUsuario: string;
  onCreado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sedeId, setSedeId] = useState("");
  const [areaTipo, setAreaTipo] = useState<string>("");
  const itemsEmpleados = toItemsOpcional(empleados, SIN_SELECCION, "Sin especificar");

  const consultoriosDeLaSede = useMemo(
    () => consultorios.filter((c) => c.sede_id === sedeId),
    [consultorios, sedeId],
  );

  const [state, formAction, pending] = useActionState(crearLimpieza, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    setSedeId("");
    setAreaTipo("");
    onCreado();
    toast.add({ title: "Registro guardado", type: "success" });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSedeId("");
          setAreaTipo("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Nuevo registro
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Limpieza de consultorio o baño</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox
                id="sedeId"
                name="sedeId"
                required
                items={toItems(sedes)}
                value={sedeId}
                onValueChange={(v) => {
                  setSedeId(String(v ?? ""));
                }}
                placeholder="Buscar sede..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="areaTipo">Área</Label>
              <Combobox
                id="areaTipo"
                name="areaTipo"
                required
                items={ITEMS_AREA}
                value={areaTipo}
                onValueChange={(v) => setAreaTipo(String(v ?? ""))}
                placeholder="Consultorio o baño..."
              />
            </div>
          </div>

          {areaTipo === "consultorio" ? (
            <div className="space-y-2">
              <Label htmlFor="consultorioId">Consultorio</Label>
              <Combobox
                id="consultorioId"
                name="consultorioId"
                required
                disabled={!sedeId}
                items={toItems(consultoriosDeLaSede)}
                placeholder={!sedeId ? "Primero elige la sede" : "Buscar consultorio..."}
              />
            </div>
          ) : null}

          {areaTipo === "bano" ? (
            <div className="space-y-2">
              <Label htmlFor="areaNombre">¿Cuál baño?</Label>
              <Input id="areaNombre" name="areaNombre" required placeholder="Ej. Baño de pacientes" />
            </div>
          ) : null}

          <FechaJornadaFields />

          <div className="space-y-2">
            <Label htmlFor="empleadoId">Empleado que hizo la limpieza (opcional)</Label>
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

          <p className="text-xs text-muted-foreground">
            Vas a digitalizar este registro con tu usuario: <strong>{nombreUsuario}</strong>.
          </p>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
