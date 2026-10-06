"use client";

import { useEffect, useState, useTransition } from "react";
import { DownloadIcon } from "lucide-react";
import { listarComprobantesNomina } from "@/lib/rrhh/nomina";
import { listarComprobantesHonorarios } from "@/lib/rrhh/honorarios";
import { listarComprobantesPlanilla } from "@/lib/rrhh/planilla";
import { urlFirmadaDocumentoRrhh } from "@/lib/rrhh/documentos";
import { formatoMoneda } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlanillaDialog } from "./planilla-dialog";

export function NominaTab() {
  const [nomina, setNomina] = useState<Awaited<ReturnType<typeof listarComprobantesNomina>>["registros"]>([]);
  const [honorarios, setHonorarios] = useState<Awaited<ReturnType<typeof listarComprobantesHonorarios>>["registros"]>([]);
  const [planilla, setPlanilla] = useState<Awaited<ReturnType<typeof listarComprobantesPlanilla>>>([]);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const [n, h, p] = await Promise.all([
        listarComprobantesNomina({}),
        listarComprobantesHonorarios({}),
        listarComprobantesPlanilla(),
      ]);
      setNomina(n.registros);
      setHonorarios(h.registros);
      setPlanilla(p);
    });
  }

  useEffect(() => {
    cargar();
  }, []);

  async function descargar(storagePath: string) {
    const url = await urlFirmadaDocumentoRrhh(storagePath);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Planilla de seguridad social (PILA)</CardTitle>
          <PlanillaDialog onSubido={cargar} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead className="hidden md:table-cell">Fecha de pago</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planilla.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.periodo_mes}/{p.periodo_anio}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{p.fecha_pago ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => descargar(p.storage_path)}>
                      <DownloadIcon /> Descargar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {planilla.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Todavía no hay comprobantes de planilla.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Comprobantes de pago</CardTitle>
          <p className="text-sm text-muted-foreground">
            Para generar un comprobante nuevo, entra a la ficha del empleado.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="nomina">
            <TabsList>
              <TabsTrigger value="nomina">Nómina (laboral)</TabsTrigger>
              <TabsTrigger value="honorarios">Honorarios (servicios)</TabsTrigger>
            </TabsList>
            <TabsContent value="nomina" className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Neto a pagar</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nomina.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {(c.empleados as unknown as { nombre: string } | null)?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.fecha_inicio} — {c.fecha_fin}
                      </TableCell>
                      <TableCell>{formatoMoneda(c.neto_pagar)}</TableCell>
                      <TableCell>
                        {c.anulado ? <Badge variant="destructive">Anulado</Badge> : <Badge variant="outline">Vigente</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {nomina.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Todavía no hay comprobantes de nómina.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="honorarios" className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Neto a pagar</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {honorarios.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {(c.empleados as unknown as { nombre: string } | null)?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.fecha_inicio} — {c.fecha_fin}
                      </TableCell>
                      <TableCell>{formatoMoneda(c.neto_pagar)}</TableCell>
                      <TableCell>
                        {c.anulado ? <Badge variant="destructive">Anulado</Badge> : <Badge variant="outline">Vigente</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {honorarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Todavía no hay comprobantes de honorarios.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
