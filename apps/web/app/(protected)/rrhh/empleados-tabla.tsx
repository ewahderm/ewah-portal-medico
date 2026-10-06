"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { toggleEmpleado } from "@/lib/rrhh/empleados";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmpleadoDialog } from "./empleado-dialog";
import type { Opcion } from "@/lib/forms/opciones";

type EmpleadoRow = {
  id: string;
  nombre: string;
  numero_identificacion: string | null;
  activo: boolean;
  categoria_contrato: string | null;
  tipos_contrato: { nombre: string } | null;
  tipos_identificacion: { nombre: string } | null;
};

export function EmpleadosTabla({
  empleados,
  tiposIdentificacion,
  tiposContrato,
  fondosPension,
  fondosCesantias,
  arls,
  bancos,
  tiposCuentaBancaria,
  epsActivas,
  usuarios,
  puedeCrear,
  puedeEditar,
}: {
  empleados: EmpleadoRow[];
  tiposIdentificacion: Opcion[];
  tiposContrato: { id: string; nombre: string; categoria: string }[];
  fondosPension: Opcion[];
  fondosCesantias: Opcion[];
  arls: Opcion[];
  bancos: Opcion[];
  tiposCuentaBancaria: Opcion[];
  epsActivas: Opcion[];
  usuarios: Opcion[];
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [estados, setEstados] = useState(() => new Map(empleados.map((e) => [e.id, e.activo])));

  function handleToggle(id: string, next: boolean) {
    setEstados((prev) => new Map(prev).set(id, next));
    setError(null);
    startTransition(async () => {
      try {
        await toggleEmpleado(id, next);
      } catch (e) {
        setEstados((prev) => new Map(prev).set(id, !next));
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  const catalogos = { tiposIdentificacion, tiposContrato, fondosPension, fondosCesantias, arls, bancos, tiposCuentaBancaria, epsActivas, usuarios };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Empleados ({empleados.length})</CardTitle>
        {puedeCrear ? (
          <EmpleadoDialog
            {...catalogos}
            trigger={
              <Button>
                <PlusIcon /> Nuevo empleado
              </Button>
            }
          />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden md:table-cell">Identificación</TableHead>
              <TableHead className="hidden md:table-cell">Tipo de contrato</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empleados.map((empleado) => (
              <TableRow key={empleado.id}>
                <TableCell className="font-medium">
                  <Link href={`/rrhh/${empleado.id}`} className="hover:underline">
                    {empleado.nombre}
                  </Link>
                  {empleado.categoria_contrato === "servicios" ? (
                    <Badge variant="outline" className="ml-2">
                      Servicios
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {empleado.tipos_identificacion?.nombre && empleado.numero_identificacion
                    ? `${empleado.tipos_identificacion.nombre} ${empleado.numero_identificacion}`
                    : "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {empleado.tipos_contrato?.nombre ?? "—"}
                </TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/rrhh/${empleado.id}`} />}>
                    Ver
                  </Button>
                  {puedeEditar ? (
                    <Switch
                      checked={estados.get(empleado.id) ?? empleado.activo}
                      onCheckedChange={(checked) => handleToggle(empleado.id, checked)}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {empleados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Todavía no hay empleados registrados.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
