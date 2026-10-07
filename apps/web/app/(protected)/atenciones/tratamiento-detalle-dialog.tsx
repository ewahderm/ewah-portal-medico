"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { obtenerTratamientoDetalle, type TratamientoDetalle } from "@/lib/tratamientos/actions";
import { formatoMoneda } from "@/lib/format";

// Consulta de solo lectura de un tratamiento — se usa desde una evolución
// que lo referencia, incluso si se hizo en una atención anterior.
export function TratamientoDetalleDialog({ tratamientoId }: { tratamientoId: string }) {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<TratamientoDetalle | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    obtenerTratamientoDetalle(tratamientoId).then((d) => {
      if (!cancelado) setDetalle(d);
    });
    return () => {
      cancelado = true;
    };
  }, [open, tratamientoId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>Ver tratamiento</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle del tratamiento</DialogTitle>
        </DialogHeader>
        {detalle === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : detalle === null ? (
          <p className="text-sm text-muted-foreground">No se pudo cargar el tratamiento.</p>
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Tratamiento</dt>
              <dd className="font-medium">
                {detalle.tipos_tratamiento?.nombre ?? "—"}
                {detalle.anulado ? (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Anulado
                  </Badge>
                ) : null}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd>{detalle.fecha}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Profesional</dt>
                <dd>{detalle.profesional?.nombre ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sede</dt>
                <dd>{detalle.sedes?.nombre ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor</dt>
                <dd>{formatoMoneda(detalle.costo)}</dd>
              </div>
            </div>
            {detalle.anulado && detalle.anulado_motivo ? (
              <div>
                <dt className="text-xs text-muted-foreground">Motivo de anulación</dt>
                <dd className="whitespace-normal break-words">{detalle.anulado_motivo}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">Observaciones</dt>
              <dd className="whitespace-pre-wrap break-words">{detalle.notas || "—"}</dd>
            </div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
