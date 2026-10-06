"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckIcon, DownloadIcon, Trash2Icon } from "lucide-react";
import {
  listarComprobantesNomina,
  eliminarComprobanteNomina,
  aprobarComprobanteNomina,
  obtenerComprobanteNomina,
} from "@/lib/rrhh/nomina";
import {
  listarComprobantesHonorarios,
  eliminarComprobanteHonorarios,
  aprobarComprobanteHonorarios,
  obtenerComprobanteHonorarios,
} from "@/lib/rrhh/honorarios";
import { obtenerClinicaParaPdf } from "@/lib/clinicas/actions";
import { generarPdfComprobanteNomina, generarPdfComprobanteHonorarios } from "@/lib/rrhh/pdf";
import { formatoMoneda } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GenerarNominaDialog,
  EditarNominaDialog,
  GenerarHonorariosDialog,
  EditarHonorariosDialog,
  AnularComprobanteDialog,
} from "./nomina-dialogs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function NominaEmpleadoTab({
  empleadoId,
  esLaboral,
  puedeCrear,
  puedeEditar,
  puedeAnular,
}: {
  empleadoId: string;
  esLaboral: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAnular: boolean;
}) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      if (esLaboral) {
        const { registros: r } = await listarComprobantesNomina({ empleadoId });
        setRegistros(r);
      } else {
        const { registros: r } = await listarComprobantesHonorarios({ empleadoId });
        setRegistros(r);
      }
    });
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aprobar(id: string) {
    try {
      if (esLaboral) await aprobarComprobanteNomina(id, empleadoId);
      else await aprobarComprobanteHonorarios(id, empleadoId);
      cargar();
      toast.add({ title: "Comprobante aprobado — ya no se puede editar", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo aprobar.", type: "error" });
    }
  }

  async function eliminar(id: string) {
    if (confirmandoId !== id) {
      setConfirmandoId(id);
      return;
    }
    setConfirmandoId(null);
    try {
      if (esLaboral) await eliminarComprobanteNomina(id, empleadoId);
      else await eliminarComprobanteHonorarios(id, empleadoId);
      cargar();
      toast.add({ title: "Borrador eliminado", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo eliminar.", type: "error" });
    }
  }

  async function descargarPdf(id: string) {
    try {
      const clinica = await obtenerClinicaParaPdf();
      if (esLaboral) {
        const comprobante = await obtenerComprobanteNomina(id);
        if (!comprobante) throw new Error("No se encontró el comprobante.");
        const empleado = comprobante.empleados as unknown as {
          nombre: string;
          numero_identificacion: string | null;
          tipos_identificacion: { nombre: string } | null;
        } | null;
        await generarPdfComprobanteNomina({
          clinica,
          empleado: {
            nombre: empleado?.nombre ?? "—",
            identificacion: empleado?.numero_identificacion
              ? `${empleado.tipos_identificacion?.nombre ?? ""} ${empleado.numero_identificacion}`.trim()
              : null,
          },
          comprobante,
        });
      } else {
        const comprobante = await obtenerComprobanteHonorarios(id);
        if (!comprobante) throw new Error("No se encontró el comprobante.");
        const empleado = comprobante.empleados as unknown as {
          nombre: string;
          numero_identificacion: string | null;
          tipos_identificacion: { nombre: string } | null;
        } | null;
        await generarPdfComprobanteHonorarios({
          clinica,
          empleado: {
            nombre: empleado?.nombre ?? "—",
            identificacion: empleado?.numero_identificacion
              ? `${empleado.tipos_identificacion?.nombre ?? ""} ${empleado.numero_identificacion}`.trim()
              : null,
          },
          comprobante,
        });
      }
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo generar el PDF.", type: "error" });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">{esLaboral ? "Nómina" : "Honorarios"} ({registros.length})</CardTitle>
        {puedeCrear ? (
          esLaboral ? (
            <GenerarNominaDialog empleadoId={empleadoId} onCreado={cargar} />
          ) : (
            <GenerarHonorariosDialog empleadoId={empleadoId} onCreado={cargar} />
          )
        ) : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Neto a pagar</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r) => {
              const esBorrador = !r.aprobado && !r.anulado;
              return (
                <TableRow key={r.id as string}>
                  <TableCell className="text-muted-foreground">
                    {r.fecha_inicio as string} — {r.fecha_fin as string}
                  </TableCell>
                  <TableCell className="font-medium">{formatoMoneda(r.neto_pagar as number)}</TableCell>
                  <TableCell>
                    {r.anulado ? (
                      <Badge variant="destructive">Anulado: {r.anulado_motivo as string}</Badge>
                    ) : r.aprobado ? (
                      <Badge variant="outline">Aprobado</Badge>
                    ) : (
                      <Badge>Borrador</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex flex-wrap justify-end gap-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => descargarPdf(r.id as string)}>
                      <DownloadIcon />
                      <span className="hidden md:inline">PDF</span>
                    </Button>
                    {esBorrador && puedeEditar ? (
                      <>
                        {esLaboral ? (
                          <EditarNominaDialog
                            comprobante={r as never}
                            empleadoId={empleadoId}
                            onGuardado={cargar}
                          />
                        ) : (
                          <EditarHonorariosDialog
                            comprobante={r as never}
                            empleadoId={empleadoId}
                            onGuardado={cargar}
                          />
                        )}
                        <Button variant="outline" size="sm" onClick={() => aprobar(r.id as string)}>
                          <CheckIcon />
                          <span className="hidden md:inline">Aprobar</span>
                        </Button>
                        <Button
                          variant={confirmandoId === r.id ? "destructive" : "outline"}
                          size="sm"
                          onClick={() => eliminar(r.id as string)}
                          onBlur={() => setConfirmandoId((prev) => (prev === r.id ? null : prev))}
                        >
                          <Trash2Icon />
                          {confirmandoId === r.id ? <span className="hidden md:inline">¿Eliminar?</span> : null}
                        </Button>
                      </>
                    ) : null}
                    {r.aprobado && !r.anulado && puedeAnular ? (
                      <AnularComprobanteDialog
                        esLaboral={esLaboral}
                        id={r.id as string}
                        empleadoId={empleadoId}
                        onAnulado={cargar}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {registros.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Todavía no hay comprobantes.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
