"use client";

import { useEffect, useState, useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { listarTemperaturasNevera } from "@/lib/medio-ambiente/actions";
import { totalPaginas as calcularTotalPaginas } from "@/lib/pagination";
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
import { NuevaTemperaturaNeveraDialog } from "./nueva-temperatura-nevera-dialog";
import type { Opcion } from "@/lib/forms/opciones";

const TODOS = "__todos__";

type Registro = {
  id: string;
  registrado_en: string;
  nevera: string;
  temperatura_celsius: number;
  observaciones: string | null;
  sedes: { nombre: string } | null;
  creador: { nombre: string } | null;
};

export function TemperaturaNeveraTab({ sedes, puedeCrear }: { sedes: Opcion[]; puedeCrear: boolean }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [sedeId, setSedeId] = useState(TODOS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pending, startTransition] = useTransition();

  function buscar(paginaDestino = 1) {
    startTransition(async () => {
      const { registros: data, total: totalEncontrado, pagina: paginaReal } =
        await listarTemperaturasNevera({
          sedeId: sedeId === TODOS ? undefined : sedeId,
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
              <Label>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
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
          {puedeCrear ? <NuevaTemperaturaNeveraDialog sedes={sedes} onCreado={() => buscar()} /> : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y hora</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Nevera</TableHead>
                <TableHead>Temperatura</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.registrado_en).toLocaleString("es-CO")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.sedes?.nombre ?? "—"}</TableCell>
                  <TableCell className="font-medium">{r.nevera}</TableCell>
                  <TableCell>{r.temperatura_celsius} °C</TableCell>
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
