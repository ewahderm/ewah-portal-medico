"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  registrarConsumo,
  listarConsumoTratamiento,
  revertirConsumo,
} from "@/lib/inventario/actions";
import type { InventarioActionState } from "@/lib/inventario/actions";
import { Badge } from "@/components/ui/badge";
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
import { toItems } from "@/lib/forms/opciones";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoteScanner, type LoteEscaneado } from "../_components/lote-scanner";

type Insumo = { id: string; nombre: string };
type Lote = {
  id: string;
  insumo_id: string;
  sede_id: string;
  numero_lote: string | null;
  cantidad_actual: number;
};
type Consumo = {
  id: string;
  cantidad: number;
  cantidad_invima: number | null;
  sitio_anatomico: string | null;
  motivo: string | null;
  motivo_movimiento: string | null;
  revierte_movimiento_id: string | null;
  created_at: string;
  lotes: { numero_lote: string | null; insumos: { nombre: string; unidad_medida: string } | null } | null;
};

export function InsumosDialog({
  tratamientoId,
  sedeId,
  insumos,
  lotes,
  puedeRegistrar,
  puedeRevertir,
}: {
  tratamientoId: string;
  sedeId: string;
  insumos: Insumo[];
  lotes: Lote[];
  puedeRegistrar: boolean;
  puedeRevertir: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [consumos, setConsumos] = useState<Consumo[]>([]);
  const [insumoId, setInsumoId] = useState("");
  // "escaneo" reemplaza los 2 comboboxes por el lector de QR/pistola —
  // útil cuando la etiqueta impresa del vial/caja está a la mano durante
  // la atención. loteEscaneado fuerza la selección del lote (ver key del
  // Combobox más abajo); se limpia al volver a "manual" para no dejar un
  // loteId escaneado colándose en un envío manual.
  const [origen, setOrigen] = useState<"manual" | "escaneo">("manual");
  const [loteEscaneado, setLoteEscaneado] = useState<LoteEscaneado | null>(null);
  const [state, setState] = useState<InventarioActionState>(null);
  const [errorReversa, setErrorReversa] = useState<string | null>(null);
  const [revirtiendoId, setRevirtiendoId] = useState<string | null>(null);
  const [motivoReversa, setMotivoReversa] = useState("");
  const [pending, startTransition] = useTransition();

  const lotesDelInsumo = useMemo(
    () => lotes.filter((l) => l.insumo_id === insumoId && l.sede_id === sedeId),
    [lotes, insumoId, sedeId],
  );

  const consumosRegistrados = useMemo(
    () => consumos.filter((c) => c.motivo_movimiento === "consumo_tratamiento"),
    [consumos],
  );
  const idsRevertidos = useMemo(
    () =>
      new Set(
        consumos
          .filter((c) => c.motivo_movimiento === "reverso_consumo" && c.revierte_movimiento_id)
          .map((c) => c.revierte_movimiento_id as string),
      ),
    [consumos],
  );

  function cargar() {
    startTransition(async () => {
      const data = await listarConsumoTratamiento(tratamientoId);
      setConsumos(data as unknown as Consumo[]);
    });
  }

  function iniciarReversa(id: string) {
    setErrorReversa(null);
    setMotivoReversa("");
    setRevirtiendoId(id);
  }

  function cancelarReversa() {
    setRevirtiendoId(null);
    setMotivoReversa("");
  }

  function confirmarReversa() {
    if (!revirtiendoId || !motivoReversa.trim()) return;
    const id = revirtiendoId;
    const motivo = motivoReversa.trim();
    setErrorReversa(null);
    startTransition(async () => {
      try {
        await revertirConsumo(id, motivo);
        setRevirtiendoId(null);
        setMotivoReversa("");
        const data = await listarConsumoTratamiento(tratamientoId);
        setConsumos(data as unknown as Consumo[]);
      } catch (e) {
        setErrorReversa(e instanceof Error ? e.message : "No se pudo revertir el consumo.");
      }
    });
  }

  function handleEscaneado(lote: LoteEscaneado) {
    setInsumoId(lote.insumo_id);
    setLoteEscaneado(lote);
  }

  function cambiarOrigen(nuevo: "manual" | "escaneo") {
    setOrigen(nuevo);
    setLoteEscaneado(null);
    setInsumoId("");
  }

  function handleRegistrarConsumo(formData: FormData) {
    formData.set("tratamientoId", tratamientoId);
    setState(null);
    startTransition(async () => {
      const resultado = await registrarConsumo(null, formData);
      setState(resultado);
      if (!resultado?.error) {
        const data = await listarConsumoTratamiento(tratamientoId);
        setConsumos(data as unknown as Consumo[]);
        // El siguiente insumo puede ser otro vial/caja distinta — se pide
        // un escaneo fresco en vez de arriesgar reusar el lote anterior
        // con un stock que ya quedó desactualizado en pantalla.
        if (origen === "escaneo") {
          setLoteEscaneado(null);
          setInsumoId("");
        }
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) cargar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Insumos
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insumos usados en este tratamiento</DialogTitle>
        </DialogHeader>

        {errorReversa ? (
          <Alert variant="destructive">
            <AlertDescription>{errorReversa}</AlertDescription>
          </Alert>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Sitio</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {consumosRegistrados.map((c) => {
              const revertido = idsRevertidos.has(c.id);
              return (
                <Fragment key={c.id}>
                  <TableRow>
                    <TableCell className={revertido ? "text-muted-foreground line-through" : ""}>
                      {c.lotes?.insumos?.nombre ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.lotes?.numero_lote ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.cantidad} {c.lotes?.insumos?.unidad_medida ?? ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.sitio_anatomico ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {revertido ? (
                        <Badge variant="outline">Revertido</Badge>
                      ) : puedeRevertir ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => iniciarReversa(c.id)}
                        >
                          Eliminar
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {revirtiendoId === c.id ? (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <div className="space-y-2 py-1">
                          <Label htmlFor={`motivoReversa-${c.id}`}>
                            Motivo de la reversa (obligatorio)
                          </Label>
                          <Textarea
                            id={`motivoReversa-${c.id}`}
                            rows={2}
                            value={motivoReversa}
                            onChange={(e) => setMotivoReversa(e.target.value)}
                            placeholder="Ej: se registró por error, insumo equivocado"
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={cancelarReversa} disabled={pending}>
                              Cancelar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={confirmarReversa}
                              disabled={pending || !motivoReversa.trim()}
                            >
                              {pending ? "Revirtiendo..." : "Confirmar reversa"}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
            {consumosRegistrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin insumos registrados todavía.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        {puedeRegistrar ? (
          <form action={handleRegistrarConsumo} className="space-y-4 border-t pt-4">
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
              <div className="flex items-center justify-between">
                <Label>Insumo usado</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={origen === "manual" ? "default" : "outline"}
                    onClick={() => cambiarOrigen("manual")}
                  >
                    Buscar manualmente
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={origen === "escaneo" ? "default" : "outline"}
                    onClick={() => cambiarOrigen("escaneo")}
                  >
                    Escanear
                  </Button>
                </div>
              </div>

              {origen === "manual" ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="insumoIdConsumo" className="text-xs text-muted-foreground">
                      Insumo
                    </Label>
                    <Combobox
                      id="insumoIdConsumo"
                      items={toItems(insumos)}
                      value={insumoId}
                      onValueChange={(valor) => setInsumoId(String(valor ?? ""))}
                      placeholder="Selecciona"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loteId" className="text-xs text-muted-foreground">
                      Lote
                    </Label>
                    <Combobox
                      key={insumoId}
                      id="loteId"
                      name="loteId"
                      required
                      disabled={lotesDelInsumo.length === 0}
                      items={lotesDelInsumo.map((l) => ({
                        value: l.id,
                        label: `${l.numero_lote ?? "Sin número"} (stock: ${l.cantidad_actual})`,
                      }))}
                      placeholder={
                        !insumoId
                          ? "Elige un insumo primero"
                          : lotesDelInsumo.length === 0
                            ? "Sin lotes en esta sede"
                            : "Selecciona"
                      }
                    />
                  </div>
                </div>
              ) : loteEscaneado ? (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{loteEscaneado.insumos?.nombre ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      Lote {loteEscaneado.numero_lote ?? "—"} · disponible:{" "}
                      {loteEscaneado.cantidad_actual} {loteEscaneado.insumos?.unidad_medida ?? ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLoteEscaneado(null)}
                  >
                    Escanear otro
                  </Button>
                </div>
              ) : (
                <LoteScanner sedeIdEsperada={sedeId} onEncontrado={handleEscaneado} autoFocus />
              )}

              {origen === "escaneo" && loteEscaneado ? (
                <input type="hidden" name="loteId" value={loteEscaneado.id} />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad usada</Label>
                <Input id="cantidad" name="cantidad" type="number" min="0" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidadInvima">Cantidad INVIMA (opcional)</Label>
                <Input id="cantidadInvima" name="cantidadInvima" type="number" min="0" step="0.01" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sitioAnatomico">Sitio anatómico (opcional)</Label>
              <Input id="sitioAnatomico" name="sitioAnatomico" placeholder="Ej: tercio superior" />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={pending || (origen === "escaneo" && !loteEscaneado)}
            >
              {pending ? "Guardando..." : "Registrar consumo"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
