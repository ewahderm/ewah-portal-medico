"use client";

import { useEffect, useState, useTransition } from "react";
import { listarAccidentesTrabajo } from "@/lib/rrhh/accidentes";
import { totalPaginas as calcularTotalPaginas } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccidenteDialog } from "./accidente-dialog";
import { AccidenteDetalleDialog, type AccidenteRow } from "./accidente-detalle-dialog";

type EmpleadoRow = { id: string; nombre: string };

export function AccidentesTab({
  empleados,
  puedeCrear,
  puedeEditar,
}: {
  empleados: EmpleadoRow[];
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [registros, setRegistros] = useState<AccidenteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [pending, startTransition] = useTransition();

  function buscar(paginaDestino = 1) {
    startTransition(async () => {
      const { registros: data, total: totalEncontrado, pagina: paginaReal } = await listarAccidentesTrabajo({
        pagina: paginaDestino,
      });
      setRegistros(data as unknown as AccidenteRow[]);
      setTotal(totalEncontrado);
      setPagina(paginaReal);
    });
  }

  useEffect(() => {
    buscar();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Accidentes laborales {total > 0 ? `(${total})` : ""}</CardTitle>
        {puedeCrear ? (
          <AccidenteDialog
            empleados={empleados}
            onCreado={() => buscar()}
          />
        ) : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Empleado</TableHead>
              <TableHead className="hidden md:table-cell">Resumen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((a) => {
              const plazoArlVencido = !a.reportado_arl;
              return (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground">{a.fecha}</TableCell>
                  <TableCell className="font-medium">{a.empleados?.nombre ?? "—"}</TableCell>
                  <TableCell className="hidden max-w-xs whitespace-normal break-words text-muted-foreground md:table-cell">
                    {a.resumen}
                  </TableCell>
                  <TableCell>
                    {a.cerrado ? (
                      <Badge variant="outline">Cerrado</Badge>
                    ) : plazoArlVencido ? (
                      <Badge variant="destructive">Sin reportar a la ARL</Badge>
                    ) : (
                      <Badge>En curso</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {puedeEditar ? (
                      <AccidenteDetalleDialog
                        accidente={a}
                        onActualizado={() => buscar(pagina)}
                        trigger={
                          <Button variant="outline" size="sm">
                            Ver / editar
                          </Button>
                        }
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {registros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {pending ? "Cargando..." : "Todavía no hay accidentes registrados."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <Pagination pagina={pagina} totalPaginas={calcularTotalPaginas(total)} onCambiarPagina={(p) => buscar(p)} />
      </CardContent>
    </Card>
  );
}
