"use client";

import { useState, useTransition } from "react";
import { toggleConsultorio } from "@/lib/parametros/consultorios";
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
import { ConsultorioDialog } from "./consultorio-dialog";
import type { Opcion } from "@/lib/forms/opciones";

export type ConsultorioRow = {
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  sede_id: string;
  sedes: { nombre: string } | null;
};

export function ConsultoriosTable({
  valores,
  sedes,
  editable,
}: {
  valores: ConsultorioRow[];
  sedes: Opcion[];
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
        await toggleConsultorio(id, next);
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
            <TableHead>Sede</TableHead>
            <TableHead>Código</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell>{valor.nombre}</TableCell>
              <TableCell className="text-muted-foreground">{valor.sedes?.nombre ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {valor.codigo ?? "—"}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                {editable ? (
                  <>
                    <ConsultorioDialog
                      sedes={sedes}
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
                Todavía no hay consultorios registrados.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
