"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { PlusIcon } from "lucide-react";
import { registrarMovimiento } from "@/lib/inventario/actions";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA, MOTIVO_LABEL } from "@/lib/inventario/motivos";
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
import { CrearLoteDialog } from "./crear-lote-dialog";
import type { Opcion } from "@/lib/forms/opciones";

type Lote = {
  id: string;
  insumo_id: string;
  numero_lote: string;
  cantidad_actual: number;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};
type Insumo = { id: string; nombre: string };

const ITEMS_MOTIVO = [
  ...MOTIVOS_ENTRADA.map((m) => ({ value: m, label: `Ingreso — ${MOTIVO_LABEL[m]}` })),
  ...MOTIVOS_SALIDA.map((m) => ({ value: m, label: `Salida — ${MOTIVO_LABEL[m]}` })),
];

export function NuevoMovimientoDialog({
  insumos,
  lotes,
  sedes,
}: {
  insumos: Insumo[];
  lotes: Lote[];
  sedes: Opcion[];
}) {
  const [open, setOpen] = useState(false);
  const [insumoId, setInsumoId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [state, formAction, pending] = useActionState(registrarMovimiento, null);

  const lotesDelInsumo = useMemo(
    () => lotes.filter((l) => l.insumo_id === insumoId),
    [lotes, insumoId],
  );

  // Un warning (ej. stock negativo) SÍ guardó el movimiento — la lista ya
  // quedó revalidada server-side — pero no cierra solo: la persona necesita
  // leer la advertencia antes de que el diálogo desaparezca. Sin error ni
  // warning, cierra y avisa con un toast (mismo patrón que el resto de la
  // app: cita agendada, solicitud de plan, etc.).
  useCerrarAlExito(pending, !state?.error && !state?.warning, () => {
    setOpen(false);
    setInsumoId("");
    setLoteId("");
    toast.add({ title: "Movimiento registrado", type: "success" });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setInsumoId("");
          setLoteId("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Nuevo movimiento
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo movimiento de inventario</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {state?.warning ? (
            <Alert>
              <AlertDescription>Registrado, pero: {state.warning}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="insumoIdMovimiento">Insumo</Label>
            <Combobox
              id="insumoIdMovimiento"
              items={insumos.map((i) => ({ value: i.id, label: i.nombre }))}
              value={insumoId}
              onValueChange={(valor) => {
                setInsumoId(String(valor ?? ""));
                setLoteId("");
              }}
              placeholder="Escriba para buscar insumo..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivoMovimiento">Tipo de movimiento</Label>
            <Combobox
              id="motivoMovimiento"
              name="motivoMovimiento"
              required
              items={ITEMS_MOTIVO}
              placeholder="Escriba tipo de movimiento..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="loteId">Lote</Label>
              {/* Salida del callejón sin salida: si el insumo todavía no tiene
                  lotes, antes el campo quedaba deshabilitado y tocaba salirse
                  a la pestaña de Recepción. Ahora el lote se crea aquí mismo y
                  queda seleccionado. */}
              {insumoId ? (
                <CrearLoteDialog
                  insumos={insumos}
                  sedes={sedes}
                  insumoIdFijo={insumoId}
                  onCreado={(nuevoLoteId) => setLoteId(nuevoLoteId)}
                />
              ) : null}
            </div>
            <Combobox
              id="loteId"
              name="loteId"
              required
              disabled={lotesDelInsumo.length === 0}
              value={loteId}
              onValueChange={(valor) => setLoteId(String(valor ?? ""))}
              items={lotesDelInsumo.map((l) => ({
                value: l.id,
                label: `${l.numero_lote} — ${l.sedes?.nombre ?? "—"} (stock: ${l.cantidad_actual})`,
              }))}
              placeholder={!insumoId ? "Primero seleccione un insumo" : "Selecciona"}
            />
            {insumoId && lotesDelInsumo.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Este insumo todavía no tiene lotes. Crea uno con el botón de arriba para poder
                registrar el movimiento.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cantidadMovimiento">Cantidad</Label>
            <Input id="cantidadMovimiento" name="cantidad" type="number" min="0" step="0.01" required placeholder="0.00" />
            <p className="text-xs text-muted-foreground">
              Ingresa siempre la cantidad positiva; el signo se aplica automáticamente según el tipo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea id="observaciones" name="observaciones" rows={2} placeholder="Observaciones adicionales" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
