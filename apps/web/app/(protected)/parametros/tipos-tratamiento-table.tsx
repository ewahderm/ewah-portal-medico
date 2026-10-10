"use client";

import { useState, useTransition } from "react";
import { toggleTipoTratamiento } from "@/lib/parametros/tipos-tratamiento";
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
import { TipoTratamientoDialog } from "./tipo-tratamiento-dialog";
import { PreciosTratamientoDialog, type PrecioConAutor } from "./precios-tratamiento-dialog";
import type { Opcion } from "@/lib/forms/opciones";
import {
  describirCodigosPorSede,
  type CodigoPorSede,
} from "@/lib/clinicas/servicios-habilitados-tipos";
import { exigirExito } from "@/lib/forms/resultado";

type CupsOpcion = { id: string; codigo: string; descripcion: string };

export type TipoTratamientoRow = {
  id: string;
  nombre: string;
  codigo: string | null;
  practica_medica_id: string | null;
  practicas_medicas: {
    nombre: string;
    clinica_servicios_habilitados: CodigoPorSede[];
  } | null;
  cups_id: string | null;
  activo: boolean;
  cups: { codigo: string; descripcion: string } | null;
};

export function TiposTratamientoTable({
  valores,
  precios,
  cups,
  servicios,
  editable,
}: {
  valores: TipoTratamientoRow[];
  precios: PrecioConAutor[];
  cups: CupsOpcion[];
  servicios: Opcion[];
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
        exigirExito(await toggleTipoTratamiento(id, next));
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
            <TableHead>Precio vigente</TableHead>
            <TableHead className="hidden md:table-cell">Código</TableHead>
            <TableHead className="hidden md:table-cell">Servicio · cód. por sede</TableHead>
            <TableHead className="hidden md:table-cell">CUPS</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell>{valor.nombre}</TableCell>
              <TableCell>
                <PreciosTratamientoDialog tipoId={valor.id} tipoNombre={valor.nombre} precios={precios} editable={editable} />
              </TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {valor.codigo ?? "—"}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                {valor.practicas_medicas ? (
                  <>
                    <span className="block">{valor.practicas_medicas.nombre}</span>
                    <span className="block font-mono">
                      {describirCodigosPorSede(valor.practicas_medicas.clinica_servicios_habilitados) ||
                        "No habilitado en ninguna sede"}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {valor.cups ? `${valor.cups.codigo} — ${valor.cups.descripcion}` : "—"}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                {editable ? (
                  <>
                    <TipoTratamientoDialog
                      cups={cups}
                      servicios={servicios}
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
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Todavía no hay tipos de tratamiento registrados.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
