"use client";

import { useEffect, useState, useTransition } from "react";
import { SearchIcon, XIcon, PlusIcon } from "lucide-react";
import { listarExtintores, toggleExtintor } from "@/lib/medio-ambiente/actions";
import { totalPaginas as calcularTotalPaginas } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { ExtintorDialog } from "./extintor-dialog";
import type { Opcion } from "@/lib/forms/opciones";

const TODOS = "__todos__";

type Extintor = {
  id: string;
  sede_id: string;
  tipo_extintor_id: string;
  ubicacion: string;
  numero_serie: string | null;
  capacidad: string | null;
  fecha_adquisicion: string | null;
  fecha_ultima_recarga: string | null;
  fecha_vencimiento: string;
  observaciones: string | null;
  activo: boolean;
  sedes: { nombre: string } | null;
  tipos_extintor: { nombre: string } | null;
};

const HOY = new Date().toISOString().slice(0, 10);

export function ExtintoresTab({
  sedes,
  tiposExtintor,
  puedeCrear,
  puedeEditar,
}: {
  sedes: Opcion[];
  tiposExtintor: Opcion[];
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [registros, setRegistros] = useState<Extintor[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [sedeId, setSedeId] = useState(TODOS);
  const [tipoExtintorId, setTipoExtintorId] = useState(TODOS);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [errorToggle, setErrorToggle] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startToggle] = useTransition();

  function buscar(paginaDestino = 1) {
    startTransition(async () => {
      const { registros: data, total: totalEncontrado, pagina: paginaReal } = await listarExtintores({
        sedeId: sedeId === TODOS ? undefined : sedeId,
        tipoExtintorId: tipoExtintorId === TODOS ? undefined : tipoExtintorId,
        incluirInactivos,
        pagina: paginaDestino,
      });
      setRegistros(data as unknown as Extintor[]);
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
    setTipoExtintorId(TODOS);
    setIncluirInactivos(false);
  }

  function handleToggle(id: string, next: boolean) {
    setErrorToggle(null);
    startToggle(async () => {
      try {
        await toggleExtintor(id, next);
        buscar(pagina);
      } catch (e) {
        setErrorToggle(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Combobox
                items={[{ value: TODOS, label: "Todas" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                value={sedeId}
                onValueChange={(v) => setSedeId(String(v ?? TODOS))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de extintor</Label>
              <Combobox
                items={[{ value: TODOS, label: "Todos" }, ...tiposExtintor.map((t) => ({ value: t.id, label: t.nombre }))]}
                value={tipoExtintorId}
                onValueChange={(v) => setTipoExtintorId(String(v ?? TODOS))}
              />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={incluirInactivos} onCheckedChange={setIncluirInactivos} />
              <Label>Incluir dados de baja</Label>
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
            Extintores {total > 0 ? `(${total})` : ""}
          </CardTitle>
          {puedeCrear ? (
            <ExtintorDialog
              sedes={sedes}
              tiposExtintor={tiposExtintor}
              onGuardado={() => buscar()}
              trigger={
                <Button>
                  <PlusIcon /> Nuevo extintor
                </Button>
              }
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {errorToggle ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{errorToggle}</AlertDescription>
            </Alert>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ubicación</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>N° serie</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((e) => {
                const vencido = e.fecha_vencimiento < HOY;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.ubicacion}</TableCell>
                    <TableCell className="text-muted-foreground">{e.sedes?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.tipos_extintor?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.numero_serie ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {e.fecha_vencimiento}
                        {vencido && e.activo ? <Badge variant="destructive">Vencido</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.activo ? "default" : "outline"}>
                        {e.activo ? "En servicio" : "Dado de baja"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex justify-end gap-2 text-right">
                      {puedeEditar ? (
                        <>
                          <ExtintorDialog
                            sedes={sedes}
                            tiposExtintor={tiposExtintor}
                            editando={e}
                            onGuardado={() => buscar(pagina)}
                            trigger={
                              <Button variant="outline" size="sm">
                                Editar
                              </Button>
                            }
                          />
                          <Switch checked={e.activo} onCheckedChange={(next) => handleToggle(e.id, next)} />
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {pending ? "Buscando..." : "Todavía no hay extintores registrados."}
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
