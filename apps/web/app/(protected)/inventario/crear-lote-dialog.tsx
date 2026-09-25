"use client";

import { useActionState, useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { crearLote } from "@/lib/inventario/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoteCampos } from "./lote-campos";
import type { Opcion } from "@/lib/forms/opciones";

/**
 * Crea un lote sin salir de donde estés. Reusa `crearLote` (la misma rutina
 * de la pestaña "Recepción de lotes": crea el lote Y su entrada inicial) y
 * los mismos campos, así que no hay una segunda definición que mantener.
 *
 * Se abre desde el diálogo de nuevo movimiento, que ya es un <form>: por eso
 * el disparador es un <Button type="button"> — sin eso enviaría el formulario
 * contenedor. El <form> propio de este diálogo no queda anidado en el otro
 * porque DialogContent se renderiza en un Portal, fuera del DOM del padre.
 */
export function CrearLoteDialog({
  insumos,
  sedes,
  insumoIdFijo,
  onCreado,
}: {
  insumos: Opcion[];
  sedes: Opcion[];
  insumoIdFijo?: string;
  onCreado?: (loteId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearLote, null);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    if (state?.loteId) onCreado?.(state.loteId);
    toast.add({ title: "Lote creado", type: "success" });
  });

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PackagePlusIcon /> Crear lote nuevo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear lote nuevo</DialogTitle>
            <DialogDescription>
              Registra la llegada del lote y su entrada inicial de stock. Al guardar queda
              seleccionado para el movimiento que estabas registrando.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-5">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <LoteCampos
              insumos={insumos}
              sedes={sedes}
              insumoIdFijo={insumoIdFijo}
              columnas={1}
            />

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Guardando..." : "Crear lote"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
