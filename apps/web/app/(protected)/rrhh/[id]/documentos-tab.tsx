"use client";

import { useEffect, useState, useTransition } from "react";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { listarDocumentosEmpleado, eliminarDocumentoEmpleado, urlFirmadaDocumentoRrhh } from "@/lib/rrhh/documentos";
import { labelTipoDocumento } from "@/lib/rrhh/constantes";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DocumentoUploadDialog } from "./documento-upload-dialog";
import type { Opcion } from "@/lib/forms/opciones";
import { hoy } from "@/lib/format";
import { exigirExito } from "@/lib/forms/resultado";

type Documento = {
  id: string;
  tipo: string;
  nombre_personalizado: string | null;
  storage_path: string;
  nombre_archivo: string;
  fecha_evento: string | null;
  fecha_vencimiento: string | null;
  tipos_vacuna: { nombre: string } | null;
  tipos_examen_ocupacional: { nombre: string } | null;
};

export function DocumentosTab({
  empleadoId,
  tiposVacuna,
  tiposExamen,
  puedeCrear,
}: {
  empleadoId: string;
  tiposVacuna: Opcion[];
  tiposExamen: Opcion[];
  puedeCrear: boolean;
}) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const hoyFecha = hoy();

  function cargar() {
    startTransition(async () => {
      const data = await listarDocumentosEmpleado(empleadoId);
      setDocumentos(data as unknown as Documento[]);
    });
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function descargar(storagePath: string) {
    const resultado = await urlFirmadaDocumentoRrhh(storagePath);
    if ("error" in resultado) {
      toast.add({ title: resultado.error, type: "error" });
      return;
    }
    window.open(resultado.url, "_blank");
  }

  async function eliminar(id: string) {
    if (confirmandoId !== id) {
      setConfirmandoId(id);
      return;
    }
    setConfirmandoId(null);
    try {
      exigirExito(await eliminarDocumentoEmpleado(id, empleadoId));
      cargar();
      toast.add({ title: "Documento eliminado", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo eliminar.", type: "error" });
    }
  }

  function descripcion(d: Documento) {
    if (d.tipo === "vacuna") return d.tipos_vacuna?.nombre ?? "—";
    if (d.tipo === "examen_ocupacional") return d.tipos_examen_ocupacional?.nombre ?? "—";
    if (d.nombre_personalizado) return d.nombre_personalizado;
    return d.nombre_archivo;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Documentos ({documentos.length})</CardTitle>
        {puedeCrear ? <DocumentoUploadDialog empleadoId={empleadoId} tiposVacuna={tiposVacuna} tiposExamen={tiposExamen} onSubido={cargar} /> : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead className="hidden md:table-cell">Vigencia</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentos.map((d) => {
              const vencida = d.fecha_vencimiento ? d.fecha_vencimiento < hoyFecha : false;
              return (
                <TableRow key={d.id}>
                  <TableCell className="text-muted-foreground">{labelTipoDocumento(d.tipo)}</TableCell>
                  <TableCell className="font-medium">{descripcion(d)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {d.fecha_vencimiento ? (
                      <Badge variant={vencida ? "destructive" : "outline"}>
                        {vencida ? "Vencida" : "Vigente"} ({d.fecha_vencimiento})
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => descargar(d.storage_path)}>
                      <DownloadIcon />
                      <span className="hidden md:inline">Descargar</span>
                    </Button>
                    <Button
                      variant={confirmandoId === d.id ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => eliminar(d.id)}
                      onBlur={() => setConfirmandoId((prev) => (prev === d.id ? null : prev))}
                    >
                      <Trash2Icon />
                      {confirmandoId === d.id ? <span className="hidden md:inline">¿Eliminar?</span> : null}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {documentos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Todavía no hay documentos cargados.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
