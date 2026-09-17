"use client";

import { useMemo, useState, useTransition } from "react";
import { registrarConsumo, listarConsumoTratamiento } from "@/lib/inventario/actions";
import type { InventarioActionState } from "@/lib/inventario/actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  created_at: string;
  lotes: { numero_lote: string | null; insumos: { nombre: string; unidad_medida: string } | null } | null;
};

export function InsumosDialog({
  tratamientoId,
  sedeId,
  insumos,
  lotes,
  puedeRegistrar,
}: {
  tratamientoId: string;
  sedeId: string;
  insumos: Insumo[];
  lotes: Lote[];
  puedeRegistrar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [consumos, setConsumos] = useState<Consumo[]>([]);
  const [insumoId, setInsumoId] = useState("");
  const [state, setState] = useState<InventarioActionState>(null);
  const [pending, startTransition] = useTransition();

  const lotesDelInsumo = useMemo(
    () => lotes.filter((l) => l.insumo_id === insumoId && l.sede_id === sedeId),
    [lotes, insumoId, sedeId],
  );

  function cargar() {
    startTransition(async () => {
      const data = await listarConsumoTratamiento(tratamientoId);
      setConsumos(data as unknown as Consumo[]);
    });
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

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Sitio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consumos.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.lotes?.insumos?.nombre ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.lotes?.numero_lote ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.cantidad} {c.lotes?.insumos?.unidad_medida ?? ""}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.sitio_anatomico ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {consumos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
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

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="insumoIdConsumo">Insumo</Label>
                <Combobox
                  id="insumoIdConsumo"
                  items={insumos.map((i) => ({ value: i.id, label: i.nombre }))}
                  value={insumoId}
                  onValueChange={(valor) => setInsumoId(String(valor ?? ""))}
                  placeholder="Selecciona"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loteId">Lote</Label>
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

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Guardando..." : "Registrar consumo"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
