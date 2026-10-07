"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatoMoneda } from "@/lib/format";
import { formatoFecha } from "@/lib/medio-ambiente/fecha-local";
import { obtenerComisionesNomina } from "@/lib/reportes/actions-regulatorios";
import { etiquetaTipoPeriodo } from "@/lib/reportes/formato";
import type { ComisionNomina } from "@/lib/reportes/nomina";
import { exigirExito } from "@/lib/forms/resultado";

export function ComisionesReport({ fechaInicial, fechaFinal }: { fechaInicial: string; fechaFinal: string }) {
  const [desde, setDesde] = useState(fechaInicial);
  const [hasta, setHasta] = useState(fechaFinal);
  const [filas, setFilas] = useState<ComisionNomina[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        setFilas(exigirExito(await obtenerComisionesNomina(desde, hasta)));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudieron consultar las comisiones de nómina.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comisiones registradas en nómina</CardTitle>
        <CardDescription>
          Totales registrados por empleado y periodo de pago en comprobantes aprobados. No son
          comisiones calculadas por tratamiento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={consultar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="comisiones-desde">Desde</Label>
            <Input id="comisiones-desde" type="date" value={desde} onDateChange={setDesde} required className="sm:w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comisiones-hasta">Hasta</Label>
            <Input id="comisiones-hasta" type="date" value={hasta} onDateChange={setHasta} required className="sm:w-40" />
          </div>
          <Button type="submit" disabled={cargando}>
            {cargando ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> : null}
            {cargando ? "Consultando..." : "Consultar nómina"}
          </Button>
        </form>
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {filas ? (
          filas.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo de periodo</TableHead>
                  <TableHead className="hidden md:table-cell">Periodo</TableHead>
                  <TableHead className="text-right">Comisiones registradas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila, index) => (
                  <TableRow key={`${fila.empleadoNombre}-${fila.tipoPeriodo}-${fila.fechaInicio}-${index}`}>
                    <TableCell className="font-medium whitespace-normal">{fila.empleadoNombre}</TableCell>
                    <TableCell className="hidden md:table-cell">{etiquetaTipoPeriodo(fila.tipoPeriodo)}</TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">
                      {formatoFecha(fila.fechaInicio)} – {formatoFecha(fila.fechaFin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatoMoneda(fila.comisiones)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay comisiones de nómina registradas para ese rango.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Elige el periodo y consulta los comprobantes aprobados que no estén anulados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
