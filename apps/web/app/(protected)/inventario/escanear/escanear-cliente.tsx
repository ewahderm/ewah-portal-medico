"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { buscarLotePorId, registrarMovimiento } from "@/lib/inventario/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import type { Opcion } from "@/lib/forms/opciones";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { LoteScanner, type LoteEscaneado } from "../../_components/lote-scanner";

export function EscanearCliente({
  puedeRegistrar,
  motivosEntrada,
  motivosSalida,
}: {
  puedeRegistrar: boolean;
  motivosEntrada: Opcion[];
  motivosSalida: Opcion[];
}) {
  const [lote, setLote] = useState<LoteEscaneado | null>(null);
  const [, startRefresco] = useTransition();

  // Tras registrar un movimiento hay que volver a traer el lote — el
  // objeto que ya se tiene en pantalla quedó con el stock viejo.
  function refrescar() {
    if (!lote) return;
    startRefresco(async () => {
      const actualizado = await buscarLotePorId(lote.id);
      if (actualizado) setLote(actualizado);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Escanear código</CardTitle>
        </CardHeader>
        <CardContent>
          <LoteScanner onEncontrado={setLote} />
        </CardContent>
      </Card>

      {lote ? (
        <LoteEncontradoCard
          lote={lote}
          puedeRegistrar={puedeRegistrar}
          onActualizado={refrescar}
          motivosEntrada={motivosEntrada}
          motivosSalida={motivosSalida}
        />
      ) : null}
    </div>
  );
}

function LoteEncontradoCard({
  lote,
  puedeRegistrar,
  onActualizado,
  motivosEntrada,
  motivosSalida,
}: {
  lote: LoteEscaneado;
  puedeRegistrar: boolean;
  onActualizado: () => void;
  motivosEntrada: Opcion[];
  motivosSalida: Opcion[];
}) {
  const [state, formAction, pending] = useActionState(registrarMovimiento, null);
  const itemsMotivo = useMemo(
    () => [
      ...motivosEntrada.map((m) => ({ value: m.id, label: `Ingreso — ${m.nombre}` })),
      ...motivosSalida.map((m) => ({ value: m.id, label: `Salida — ${m.nombre}` })),
    ],
    [motivosEntrada, motivosSalida],
  );

  useCerrarAlExito(pending, !state?.error, () => {
    toast.add({ title: "Movimiento registrado", type: "success" });
    onActualizado();
  });

  return (
    <Card className="border-primary">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{lote.insumos?.nombre ?? "—"}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Lote: {lote.numero_lote ?? "—"} · {lote.sedes?.nombre ?? "—"}
          </p>
        </div>
        {!lote.activo ? <Badge variant="outline">Inactivo</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Stock actual</p>
            <p className={`font-medium ${lote.cantidad_actual < 0 ? "text-destructive" : ""}`}>
              {lote.cantidad_actual} {lote.insumos?.unidad_medida ?? ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Vencimiento</p>
            <p className="font-medium">{lote.fecha_vencimiento ?? "—"}</p>
          </div>
        </div>

        {puedeRegistrar ? (
          <form action={formAction} className="space-y-3 border-t pt-4">
            <input type="hidden" name="loteId" value={lote.id} />
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="motivoMovimientoEscaneo">Tipo de movimiento</Label>
                <Combobox
                  id="motivoMovimientoEscaneo"
                  name="motivoMovimiento"
                  required
                  items={itemsMotivo}
                  placeholder="Selecciona..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidadEscaneo">Cantidad</Label>
                <Input
                  id="cantidadEscaneo"
                  name="cantidad"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacionesEscaneo">Observaciones (opcional)</Label>
              <Textarea id="observacionesEscaneo" name="observaciones" rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Registrando..." : "Registrar movimiento"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
