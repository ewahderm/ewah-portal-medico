"use client";

import { useState, useTransition } from "react";
import { toggleProveedor } from "@/lib/parametros/proveedores";
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
import { ProveedorDialog } from "./proveedor-dialog";
import type { Opcion } from "@/lib/forms/opciones";

export type ProveedorRow = {
  id: string;
  nombre: string;
  tipo_identificacion_id: string | null;
  numero_identificacion: string | null;
  observaciones: string | null;
  activo: boolean;
  tipos_identificacion: { nombre: string } | null;
};

export function ProveedoresTable({
  valores,
  tiposIdentificacion,
  editable,
}: {
  valores: ProveedorRow[];
  tiposIdentificacion: Opcion[];
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
        await toggleProveedor(id, next);
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
            <TableHead>Tipo ID</TableHead>
            <TableHead>Número de identificación</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell>{valor.nombre}</TableCell>
              <TableCell className="text-muted-foreground">
                {valor.tipos_identificacion?.nombre ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {valor.numero_identificacion ?? "—"}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                {editable ? (
                  <>
                    <ProveedorDialog
                      tiposIdentificacion={tiposIdentificacion}
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
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Todavía no hay proveedores registrados.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
