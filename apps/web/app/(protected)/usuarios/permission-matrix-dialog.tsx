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

// "Activar" es VIEW renombrado: es la casilla que decide si el rol ve el
// módulo siquiera, y las demás (salvo Aprobar/Anular, que son acciones
// aparte sobre datos ya existentes) no tienen sentido sin ella.
const ORDEN_PERMISOS = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "VOID"];
const LABEL_PERMISO: Record<string, string> = {
  VIEW: "Activar",
  CREATE: "Crear",
  EDIT: "Editar",
  DELETE: "Eliminar",
  APPROVE: "Aprobar",
  VOID: "Anular",
};
const CODIGOS_DEPENDIENTES_DE_VIEW = ["CREATE", "EDIT", "DELETE"];

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

  const permisosOrdenados = [...permisos].sort(
    (a, b) => ORDEN_PERMISOS.indexOf(a.codigo) - ORDEN_PERMISOS.indexOf(b.codigo),
  );
  const permisoView = permisos.find((p) => p.codigo === "VIEW");
  const permisosDependientes = permisos.filter((p) => CODIGOS_DEPENDIENTES_DE_VIEW.includes(p.codigo));

  function persistir(moduloId: string, permisoId: string, next: boolean) {
    const k = key(moduloId, permisoId);
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

  function handleToggle(moduloId: string, permisoId: string, next: boolean) {
    setError(null);
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key(moduloId, permisoId));
      else copy.delete(key(moduloId, permisoId));
      return copy;
    });
    persistir(moduloId, permisoId, next);

    // Al desactivar "Activar" (VIEW), las casillas que dependen de ella
    // (Crear/Editar/Eliminar) quedan sin sentido — se destildan y se
    // revocan también, para no dejar permisos huérfanos guardados.
    if (!next && permisoId === permisoView?.id) {
      for (const dep of permisosDependientes) {
        const depKey = key(moduloId, dep.id);
        if (checked.has(depKey)) {
          setChecked((prev) => {
            const copy = new Set(prev);
            copy.delete(depKey);
            return copy;
          });
          persistir(moduloId, dep.id, false);
        }
      }
    }
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
              {permisosOrdenados.map((permiso) => (
                <TableHead key={permiso.id} className="text-center">
                  {LABEL_PERMISO[permiso.codigo] ?? permiso.codigo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.map((modulo) => {
              const activo = permisoView ? checked.has(key(modulo.id, permisoView.id)) : true;
              return (
                <TableRow key={modulo.id}>
                  <TableCell className="font-medium">{modulo.nombre}</TableCell>
                  {permisosOrdenados.map((permiso) => {
                    const dependeDeActivar = CODIGOS_DEPENDIENTES_DE_VIEW.includes(permiso.codigo);
                    return (
                      <TableCell key={permiso.id} className="text-center">
                        <Checkbox
                          checked={checked.has(key(modulo.id, permiso.id))}
                          disabled={dependeDeActivar && !activo}
                          onCheckedChange={(value) =>
                            handleToggle(modulo.id, permiso.id, value === true)
                          }
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
