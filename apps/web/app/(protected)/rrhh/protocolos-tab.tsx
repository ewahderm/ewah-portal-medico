"use client";

import { useEffect, useState, useTransition } from "react";
import { DownloadIcon } from "lucide-react";
import { listarDocumentosNormativosVigentes } from "@/lib/rrhh/protocolos";
import { urlFirmadaDocumentoRrhh } from "@/lib/rrhh/documentos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProtocoloUploadDialog } from "./protocolo-upload-dialog";
import { toast } from "@/components/ui/toast";

const LABEL_CATEGORIA: Record<string, string> = {
  rrhh: "RRHH",
  sgsst: "SG-SST",
  habilitacion: "Habilitación",
};

type Fila = {
  tipo: { id: string; nombre: string; categoria: string };
  vigente: {
    id: string;
    version: number;
    nombre_archivo: string;
    storage_path: string;
    vigente_desde: string;
  } | null;
};

export function ProtocolosTab({ puedeCrear }: { puedeCrear: boolean }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [pending, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarDocumentosNormativosVigentes();
      setFilas(data as unknown as Fila[]);
    });
  }

  useEffect(() => {
    cargar();
  }, []);

  async function descargar(storagePath: string) {
    const resultado = await urlFirmadaDocumentoRrhh(storagePath);
    if ("error" in resultado) {
      toast.add({ title: resultado.error, type: "error" });
      return;
    }
    window.open(resultado.url, "_blank");
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="hidden md:table-cell">Versión vigente</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(({ tipo, vigente }) => (
              <TableRow key={tipo.id}>
                <TableCell className="font-medium">{tipo.nombre}</TableCell>
                <TableCell>
                  <Badge variant="outline">{LABEL_CATEGORIA[tipo.categoria] ?? tipo.categoria}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {vigente ? `v${vigente.version} — ${vigente.vigente_desde}` : "Sin cargar"}
                </TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  {vigente ? (
                    <Button variant="outline" size="sm" onClick={() => descargar(vigente.storage_path)}>
                      <DownloadIcon /> Descargar
                    </Button>
                  ) : null}
                  {puedeCrear ? (
                    <ProtocoloUploadDialog
                      tipoDocumentoId={tipo.id}
                      nombre={tipo.nombre}
                      esNuevaVersion={!!vigente}
                      onSubido={cargar}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {pending ? "Cargando..." : "No hay tipos de documento configurados."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
