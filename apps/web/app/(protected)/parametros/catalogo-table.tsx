"use client";

import { useState, useTransition } from "react";
import { toggleValorCatalogo } from "@/lib/parametros/actions";
import { Badge } from "@/components/ui/badge";
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
};

export function CatalogoTable({
  tabla,
  valores,
  editable,
}: {
  tabla: string;
  valores: ValorCatalogo[];
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
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="text-right">Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valores.map((valor) => (
            <TableRow key={valor.id}>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {valor.codigo ?? "—"}
              </TableCell>
              <TableCell>{valor.nombre}</TableCell>
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
        </TableBody>
      </Table>
    </div>
  );
}
