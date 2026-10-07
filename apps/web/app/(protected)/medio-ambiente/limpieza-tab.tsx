"use client";

import { useEffect, useState, useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { listarLimpiezas } from "@/lib/medio-ambiente/actions";
import { formatoFechaHoraJornada } from "@/lib/medio-ambiente/fecha-local";
import { totalPaginas as calcularTotalPaginas } from "@/lib/pagination";
import { AREAS_LIMPIEZA } from "@/lib/medio-ambiente/constantes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NuevaLimpiezaDialog } from "./nueva-limpieza-dialog";
import type { Opcion } from "@/lib/forms/opciones";

const TODOS = "__todos__";
type Consultorio = { id: string; nombre: string; sede_id: string };

const ITEMS_AREA = [{ value: TODOS, label: "Todas" }, ...AREAS_LIMPIEZA.map((a) => ({ value: a.value, label: a.label }))];

type Registro = {
  id: string;
  fecha: string;
  hora: string | null;
  jornada: string;
  area_tipo: string;
  area_nombre: string | null;
  observaciones: string | null;
  sedes: { nombre: string } | null;
  consultorios: { nombre: string } | null;
  empleados: { nombre: string } | null;
  creador: { nombre: string } | null;
};

export function LimpiezaTab({
  sedes,
  consultorios,
  empleados,
  puedeCrear,
  nombreUsuario,
}: {
  sedes: Opcion[];
  consultorios: Consultorio[];
  empleados: Opcion[];
  puedeCrear: boolean;
  nombreUsuario: string;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [sedeId, setSedeId] = useState(TODOS);
  const [areaTipo, setAreaTipo] = useState(TODOS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pending, startTransition] = useTransition();

  function buscar(paginaDestino = 1) {
    startTransition(async () => {
      const { registros: data, total: totalEncontrado, pagina: paginaReal } = await listarLimpiezas({
        sedeId: sedeId === TODOS ? undefined : sedeId,
        areaTipo: areaTipo === TODOS ? undefined : areaTipo,
        desde: desde || undefined,
        hasta: hasta || undefined,
        pagina: paginaDestino,
      });
      setRegistros(data as unknown as Registro[]);
      setTotal(totalEncontrado);
      setPagina(paginaReal);
    });
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpiar() {
    setSedeId(TODOS);
    setAreaTipo(TODOS);
    setDesde("");
    setHasta("");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <SearchIcon className="size-4 text-primary" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Combobox
                items={[{ value: TODOS, label: "Todas" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                value={sedeId}
                onValueChange={(v) => setSedeId(String(v ?? TODOS))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Combobox items={ITEMS_AREA} value={areaTipo} onValueChange={(v) => setAreaTipo(String(v ?? TODOS))} />
            </div>
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="date" value={desde} onDateChange={setDesde} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onDateChange={setHasta} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={limpiar}>
              <XIcon /> Limpiar
            </Button>
            <Button onClick={() => buscar()} disabled={pending}>
              <SearchIcon /> {pending ? "Buscando..." : "Buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">
            Registros {total > 0 ? `(${total})` : ""}
          </CardTitle>
          {puedeCrear ? (
            <NuevaLimpiezaDialog
              sedes={sedes}
              consultorios={consultorios}
              empleados={empleados}
              nombreUsuario={nombreUsuario}
              onCreado={() => buscar()}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y hora</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Digitalizado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">
                    {formatoFechaHoraJornada(r.fecha, r.hora, r.jornada)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.sedes?.nombre ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    {r.area_tipo === "consultorio" ? r.consultorios?.nombre ?? "—" : `Baño — ${r.area_nombre}`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.empleados?.nombre ?? "—"}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal break-words text-muted-foreground">
                    {r.observaciones ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.creador?.nombre ?? "—"}</TableCell>
                </TableRow>
              ))}
              {registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {pending ? "Buscando..." : "Todavía no hay registros."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <Pagination
            pagina={pagina}
            totalPaginas={calcularTotalPaginas(total)}
            onCambiarPagina={(p) => buscar(p)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
