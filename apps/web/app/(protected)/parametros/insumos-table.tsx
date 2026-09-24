"use client";

import { useState, useTransition } from "react";
import { toggleInsumo } from "@/lib/parametros/insumos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InsumoDialog } from "./insumo-dialog";
import type { Opcion } from "@/lib/forms/opciones";

export type InsumoRow = {
  id: string;
  nombre: string;
  codigo: string | null;
  unidad_medida: string;
  proveedor_id: string | null;
  registro_invima: string | null;
  unidad_medida_invima: string | null;
  fecha_vencimiento_registro_invima: string | null;
  referencia_reportada: string | null;
  presentacion_comercial_reportada: string | null;
  reporte_invima: boolean;
  activo: boolean;
  proveedores: { nombre: string } | null;
};

export function InsumosTable({
  valores,
  proveedores,
  editable,
}: {
  valores: InsumoRow[];
  proveedores: Opcion[];
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [estados, setEstados] = useState(() => new Map(valores.map((v) => [v.id, v.activo])));

  function handleToggle(id: string, next: boolean) {
    setEstados((prev) => new Map(prev).set(id, next));
    setError(null);
    startTransition(async () => {
      try {
        await toggleInsumo(id, next);
      } catch (e) {
        setEstados((prev) => new Map(prev).set(id, !next));
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>INVIMA</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell>{valor.nombre}</TableCell>
              <TableCell className="text-muted-foreground">{valor.unidad_medida}</TableCell>
              <TableCell className="text-muted-foreground">
                {valor.proveedores?.nombre ?? "—"}
              </TableCell>
              <TableCell>
                {valor.reporte_invima ? (
                  <Badge variant="outline">{valor.registro_invima || "Sí"}</Badge>
                ) : (
                  <span className="text-muted-foreground">No aplica</span>
                )}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                {editable ? (
                  <>
                    <InsumoDialog
                      proveedores={proveedores}
                      editando={valor}
                      trigger={
                        <Button variant="outline" size="sm">
                          Editar
                        </Button>
                      }
                    />
                    <Switch
                      checked={estados.get(valor.id) ?? valor.activo}
                      onCheckedChange={(checked) => handleToggle(valor.id, checked)}
                    />
                  </>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
          {valores.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Todavía no hay insumos registrados.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
