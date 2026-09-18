"use client";

import { useState, useTransition } from "react";
import { CalendarRangeIcon } from "lucide-react";
import { calcularCorteInventario, type CorteInventarioFila } from "@/lib/inventario/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Opcion = { id: string; nombre: string };

const TODAS = "__todas__";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function CortesMensualesTab({ sedes }: { sedes: Opcion[] }) {
  const [fechaCorte, setFechaCorte] = useState(hoyISO());
  const [sedeId, setSedeId] = useState(TODAS);
  const [filas, setFilas] = useState<CorteInventarioFila[] | null>(null);
  const [pending, startTransition] = useTransition();

  function calcular() {
    startTransition(async () => {
      const data = await calcularCorteInventario(fechaCorte, sedeId === TODAS ? undefined : sedeId);
      setFilas(data);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarRangeIcon className="size-4 text-primary" /> Seleccionar corte
          </CardTitle>
          <CardDescription>
            Es solo un reporte: suma los movimientos hasta la fecha elegida, no modifica ni cierra nada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fechaCorte">Fecha de corte</Label>
              <Input
                id="fechaCorte"
                type="date"
                value={fechaCorte}
                onChange={(e) => setFechaCorte(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Combobox
                items={[{ value: TODAS, label: "Todas las sedes" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                value={sedeId}
                onValueChange={(v) => setSedeId(String(v ?? TODAS))}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={calcular} disabled={pending || !fechaCorte}>
              {pending ? "Calculando..." : "Calcular inventario a corte"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Inventario a corte</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Ingresos</TableHead>
                <TableHead>Egresos</TableHead>
                <TableHead>Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas === null ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Seleccione una fecha y haga clic en &quot;Calcular&quot;.
                  </TableCell>
                </TableRow>
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Sin movimientos hasta esa fecha.
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((f) => (
                  <TableRow key={f.insumoId}>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{f.unidadMedida}</TableCell>
                    <TableCell>{f.ingresos}</TableCell>
                    <TableCell>{f.egresos}</TableCell>
                    <TableCell className={f.saldo < 0 ? "text-destructive font-medium" : "font-medium"}>
                      {f.saldo}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
