"use client";

import { useMemo, useState } from "react";
import { AlertTriangleIcon, BoxesIcon, CalendarClockIcon, WalletIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AjusteDialog } from "./ajuste-dialog";
import { TrasladoDialog } from "./traslado-dialog";
import type { Opcion } from "@/lib/forms/opciones";
import { formatoMoneda } from "@/lib/format";

type LoteRow = {
  id: string;
  numero_lote: string;
  fecha_vencimiento: string | null;
  cantidad_actual: number;
  costo_unitario: number | null;
  proveedor: string | null;
  sede_id: string;
  activo: boolean;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};

const TODAS = "__todas__";

function diasParaVencer(fecha: string | null) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function InventarioActualTab({
  lotes,
  sedes,
  puedeAjustar,
  puedeTrasladar,
}: {
  lotes: LoteRow[];
  sedes: Opcion[];
  puedeAjustar: boolean;
  puedeTrasladar: boolean;
}) {
  const [sedeId, setSedeId] = useState(TODAS);

  const lotesFiltrados = useMemo(
    () => (sedeId === TODAS ? lotes : lotes.filter((l) => l.sede_id === sedeId)),
    [lotes, sedeId],
  );

  const kpis = useMemo(() => {
    const porVencer = lotesFiltrados.filter((l) => {
      const dias = diasParaVencer(l.fecha_vencimiento);
      return dias !== null && dias <= 30;
    }).length;
    const negativos = lotesFiltrados.filter((l) => l.cantidad_actual < 0).length;
    const valorTotal = lotesFiltrados.reduce(
      (acc, l) => acc + (l.costo_unitario ?? 0) * Math.max(l.cantidad_actual, 0),
      0,
    );
    return { total: lotesFiltrados.length, porVencer, negativos, valorTotal };
  }, [lotesFiltrados]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <BoxesIcon className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{kpis.total}</p>
              <p className="text-xs text-muted-foreground">Lotes activos</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--ewah-cyan-dark),transparent_85%)] text-[var(--ewah-cyan-dark)]">
              <CalendarClockIcon className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{kpis.porVencer}</p>
              <p className="text-xs text-muted-foreground">Por vencer (≤30 días)</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <WalletIcon className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{formatoMoneda(kpis.valorTotal)}</p>
              <p className="text-xs text-muted-foreground">Valor estimado en stock</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Lotes activos</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Sede</Label>
            <Combobox
              className="w-48"
              items={[{ value: TODAS, label: "Todas las sedes" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
              value={sedeId}
              onValueChange={(v) => setSedeId(String(v ?? TODAS))}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Stock actual</TableHead>
                <TableHead>Costo unitario</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotesFiltrados.map((l) => {
                const dias = diasParaVencer(l.fecha_vencimiento);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.insumos?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.sedes?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.numero_lote}</TableCell>
                    <TableCell>
                      {l.fecha_vencimiento ? (
                        <Badge variant={dias !== null && dias <= 30 ? "destructive" : "outline"}>
                          {l.fecha_vencimiento}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={l.cantidad_actual < 0 ? "text-destructive font-medium" : ""}>
                      {l.cantidad_actual < 0 ? <AlertTriangleIcon className="mr-1 inline size-3.5" /> : null}
                      {l.cantidad_actual} {l.insumos?.unidad_medida ?? ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatoMoneda(l.costo_unitario)}</TableCell>
                    <TableCell className="flex justify-end gap-2 text-right">
                      {puedeTrasladar ? (
                        <TrasladoDialog
                          loteId={l.id}
                          insumoNombre={l.insumos?.nombre ?? "Insumo"}
                          numeroLote={l.numero_lote}
                          sedeOrigenNombre={l.sedes?.nombre ?? "—"}
                          sedesDestino={sedes.filter((s) => s.id !== l.sede_id)}
                        />
                      ) : null}
                      {puedeAjustar ? <AjusteDialog loteId={l.id} /> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {lotesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Todavía no hay lotes registrados.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
