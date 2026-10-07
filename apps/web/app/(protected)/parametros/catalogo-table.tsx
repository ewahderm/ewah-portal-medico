"use client";

import { useState, useTransition } from "react";
import { toggleValorCatalogo } from "@/lib/parametros/actions";
import { Badge } from "@/components/ui/badge";
import { formatoPorcentaje } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ColumnaExtra } from "@/lib/parametros/registry";
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
import { exigirExito } from "@/lib/forms/resultado";

type ValorCatalogo = {
  id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  extras?: Record<string, string | number | null>;
};

export function CatalogoTable({
  tabla,
  valores,
  columnasExtra = [],
  editable,
}: {
  tabla: string;
  valores: ValorCatalogo[];
  columnasExtra?: ColumnaExtra[];
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [estados, setEstados] = useState(
    () => new Map(valores.map((v) => [v.id, v.activo])),
  );

  function handleToggle(id: string, next: boolean) {
    setEstados((prev) => new Map(prev).set(id, next));
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await toggleValorCatalogo(tabla, id, next));
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
            <TableHead className="hidden md:table-cell">Código</TableHead>
            <TableHead>Nombre</TableHead>
            {columnasExtra.map((c) => (
              <TableHead key={c.campo} className={c.ocultarEnMovil ? "hidden lg:table-cell" : undefined}>
                {c.etiqueta}
              </TableHead>
            ))}
            <TableHead className="text-right">Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {valor.codigo ?? "—"}
              </TableCell>
              <TableCell>{valor.nombre}</TableCell>
              {columnasExtra.map((c) => {
                const v = valor.extras?.[c.campo] ?? null;
                return (
                  <TableCell
                    key={c.campo}
                    className={cn(
                      c.formato === "porcentaje" ? "font-medium tabular-nums" : "max-w-xs text-xs whitespace-normal",
                      c.ocultarEnMovil && "hidden lg:table-cell",
                    )}
                  >
                    {c.formato === "porcentaje" ? formatoPorcentaje(v === null ? null : Number(v)) : (v ?? "—")}
                  </TableCell>
                );
              })}
              <TableCell className="text-right">
                {editable ? (
                  <Switch
                    checked={estados.get(valor.id) ?? valor.activo}
                    onCheckedChange={(checked) => handleToggle(valor.id, checked)}
                  />
                ) : (
                  <Badge variant={valor.activo ? "secondary" : "outline"}>
                    {valor.activo ? "Activo" : "Inactivo"}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
          {valores.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3 + columnasExtra.length} className="text-center text-muted-foreground">
                Todavía no hay valores registrados en este catálogo.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
