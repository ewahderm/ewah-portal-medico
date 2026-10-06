"use client";

import { useState, useTransition } from "react";
import { toggleCargo } from "@/lib/parametros/cargos";
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
import { CargoDialog } from "./cargo-dialog";
import type { Opcion } from "@/lib/forms/opciones";

export type CargoRow = {
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  clase_riesgo_id: string | null;
  clases_riesgo: { nombre: string } | null;
};

export function CargosTable({
  valores,
  clasesRiesgo,
  editable,
}: {
  valores: CargoRow[];
  clasesRiesgo: Opcion[];
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
        await toggleCargo(id, next);
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
            <TableHead className="hidden md:table-cell">Clase de riesgo</TableHead>
            <TableHead className="hidden md:table-cell">Código</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell>{valor.nombre}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {valor.clases_riesgo?.nombre ?? "—"}
              </TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {valor.codigo ?? "—"}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                {editable ? (
                  <>
                    <CargoDialog
                      clasesRiesgo={clasesRiesgo}
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
                Todavía no hay cargos registrados.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
