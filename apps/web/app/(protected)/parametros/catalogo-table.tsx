"use client";

import { useState, useTransition } from "react";
import { toggleValorCatalogo } from "@/lib/parametros/actions";
import { Badge } from "@/components/ui/badge";
import { formatoPorcentaje } from "@/lib/format";
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

type ValorCatalogo = {
  id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  extra?: number | null;
};

export function CatalogoTable({
  tabla,
  valores,
  columnaExtra,
  editable,
}: {
  tabla: string;
  valores: ValorCatalogo[];
  columnaExtra?: { etiqueta: string; formato: "porcentaje" };
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
        await toggleValorCatalogo(tabla, id, next);
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
            {columnaExtra ? <TableHead>{columnaExtra.etiqueta}</TableHead> : null}
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
              {columnaExtra ? (
                <TableCell className="font-medium tabular-nums">{formatoPorcentaje(valor.extra ?? null)}</TableCell>
              ) : null}
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
              <TableCell colSpan={columnaExtra ? 4 : 3} className="text-center text-muted-foreground">
                Todavía no hay valores registrados en este catálogo.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
