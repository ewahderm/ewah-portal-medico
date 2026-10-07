"use client";

import { useState, useTransition } from "react";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatoFecha } from "@/lib/medio-ambiente/fecha-local";
import { obtenerReporteInvima } from "@/lib/reportes/actions-regulatorios";
import type { InsumoInvima } from "@/lib/reportes/invima";
import { ExportarXlsxLink } from "../../_components/exportar-xlsx-link";

export function InvimaReport({ puedeExportar }: { puedeExportar: boolean }) {
  const [filas, setFilas] = useState<InsumoInvima[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  function cargar() {
    setError(null);
    startTransition(async () => {
      try {
        setFilas(await obtenerReporteInvima());
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudo cargar el reporte INVIMA.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos para reporte INVIMA</CardTitle>
        <CardDescription>
          Aparecen los insumos que marcaste para reporte regulatorio en Inventario, incluso si ya
          no los usas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" onClick={cargar} disabled={cargando}>
            {cargando ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> : null}
            {cargando ? "Consultando..." : filas === null ? "Consultar inventario" : "Actualizar listado"}
          </Button>
          {puedeExportar && filas ? (
            <ExportarXlsxLink href="/api/reportes/invima" label="Descargar Excel" />
          ) : null}
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {filas ? (
          filas.length ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {filas.length === 1 ? "1 producto marcado para reporte." : `${filas.length} productos marcados para reporte.`}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Código</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Registro sanitario</TableHead>
                    <TableHead className="hidden md:table-cell">Vencimiento</TableHead>
                    <TableHead className="hidden md:table-cell">Referencia</TableHead>
                    <TableHead className="hidden md:table-cell">Presentación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((fila, index) => (
                    <TableRow key={`${fila.codigo}-${index}`}>
                      <TableCell className="hidden tabular-nums md:table-cell">{fila.codigo || "—"}</TableCell>
                      <TableCell className="font-medium whitespace-normal">{fila.nombre}</TableCell>
                      <TableCell className="whitespace-normal">{fila.registroSanitario || "—"}</TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">
                        {fila.vencimientoRegistroSanitario ? formatoFecha(fila.vencimientoRegistroSanitario) : "—"}
                      </TableCell>
                      <TableCell className="hidden whitespace-normal md:table-cell">{fila.referenciaReportada || "—"}</TableCell>
                      <TableCell className="hidden whitespace-normal md:table-cell">{fila.presentacionComercial || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay insumos marcados para reporte regulatorio.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
