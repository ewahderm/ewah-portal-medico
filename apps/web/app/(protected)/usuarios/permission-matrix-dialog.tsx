"use client";

import { useState, useTransition } from "react";
import { toggleRolPermiso } from "@/lib/rbac/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Modulo = { id: string; nombre: string };
type Permiso = { id: string; codigo: string };
type Grant = { rol_id: string; modulo_id: string; permiso_id: string };

function key(moduloId: string, permisoId: string) {
  return `${moduloId}:${permisoId}`;
}

export function PermissionMatrixDialog({
  rolId,
  rolNombre,
  modulos,
  permisos,
  grants,
}: {
  rolId: string;
  rolNombre: string;
  modulos: Modulo[];
  permisos: Permiso[];
  grants: Grant[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(grants.map((g) => key(g.modulo_id, g.permiso_id))),
  );
  const [, startTransition] = useTransition();

  function handleToggle(moduloId: string, permisoId: string, next: boolean) {
    const k = key(moduloId, permisoId);
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(k);
      else copy.delete(k);
      return copy;
    });
    setError(null);

    startTransition(async () => {
      try {
        await toggleRolPermiso(rolId, moduloId, permisoId, next);
      } catch (e) {
        setChecked((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(k);
          else copy.add(k);
          return copy;
        });
        setError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Editar permisos
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permisos de {rolNombre}</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              {permisos.map((permiso) => (
                <TableHead key={permiso.id} className="text-center">
                  {permiso.codigo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.map((modulo) => (
              <TableRow key={modulo.id}>
                <TableCell className="font-medium">{modulo.nombre}</TableCell>
                {permisos.map((permiso) => (
                  <TableCell key={permiso.id} className="text-center">
                    <Checkbox
                      checked={checked.has(key(modulo.id, permiso.id))}
                      onCheckedChange={(value) =>
                        handleToggle(modulo.id, permiso.id, value === true)
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
