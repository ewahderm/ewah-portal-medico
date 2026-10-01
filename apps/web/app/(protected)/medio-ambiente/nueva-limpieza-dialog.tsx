"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { crearLimpieza } from "@/lib/medio-ambiente/actions";
import { datetimeLocalAhora } from "@/lib/medio-ambiente/fecha-local";
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
import { toItems, type Opcion } from "@/lib/forms/opciones";

type Consultorio = { id: string; nombre: string; sede_id: string };

const ITEMS_AREA = AREAS_LIMPIEZA.map((a) => ({ value: a.value, label: a.label }));

export function NuevaLimpiezaDialog({
  sedes,
  consultorios,
  nombreUsuario,
  onCreado,
}: {
  sedes: Opcion[];
  consultorios: Consultorio[];
  nombreUsuario: string;
  onCreado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sedeId, setSedeId] = useState("");
  const [areaTipo, setAreaTipo] = useState<string>("");

  const consultoriosDeLaSede = useMemo(
    () => consultorios.filter((c) => c.sede_id === sedeId),
    [consultorios, sedeId],
  );

  const [state, formAction, pending] = useActionState(
    async (prevState: Awaited<ReturnType<typeof crearLimpieza>>, formData: FormData) => {
      const local = String(formData.get("registradoEnLocal") ?? "");
      if (local) formData.set("registradoEn", new Date(local).toISOString());
      return crearLimpieza(prevState, formData);
    },
    null,
  );

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

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea id="observaciones" name="observaciones" rows={2} />
          </div>

          <p className="text-xs text-muted-foreground">
            Vas a registrar esta limpieza como responsable: <strong>{nombreUsuario}</strong>.
          </p>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
