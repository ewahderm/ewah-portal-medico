"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { listarMovimientos } from "@/lib/inventario/actions";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA, MOTIVO_LABEL } from "@/lib/inventario/motivos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NuevoMovimientoDialog } from "./nuevo-movimiento-dialog";

type Insumo = { id: string; nombre: string };
type Opcion = { id: string; nombre: string };
type LoteResumen = {
  id: string;
  insumo_id: string;
  numero_lote: string;
  cantidad_actual: number;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};

type Movimiento = {
  id: string;
  tipo: string;
  motivo_movimiento: string | null;
  cantidad: number;
  cantidad_invima: number | null;
  sitio_anatomico: string | null;
  motivo: string | null;
  created_at: string;
  lotes: {
    numero_lote: string;
    insumos: { nombre: string; unidad_medida: string } | null;
    sedes: { nombre: string } | null;
  } | null;
  tratamientos: { fecha: string; pacientes: { primer_nombre: string; primer_apellido: string } | null } | null;
  creador: { nombre: string } | null;
};

const TODOS = "__todos__";

const OPCIONES_TIPO = [
  { value: TODOS, label: "Todos" },
  ...MOTIVOS_ENTRADA.map((m) => ({ value: `entrada:${m}`, label: `Ingreso — ${MOTIVO_LABEL[m]}` })),
  { value: "ajuste", label: "Ajuste" },
  ...MOTIVOS_SALIDA.map((m) => ({ value: `salida:${m}`, label: `Salida — ${MOTIVO_LABEL[m]}` })),
  { value: "salida:consumo_tratamiento", label: "Salida — Consumo en tratamiento" },
  { value: "traslado", label: "Traslado entre sedes" },
];

function parseFiltroTipo(valor: string): { tipo?: string; motivo?: string } {
  if (valor === TODOS) return {};
  if (valor === "ajuste") return { tipo: "ajuste" };
  if (valor === "traslado") return { motivo: "traslado" };
  const [tipo, motivo] = valor.split(":");
  return { tipo, motivo };
}

function labelMovimiento(m: Movimiento) {
  if (m.motivo_movimiento === "traslado") {
    return m.tipo === "entrada" ? "Traslado — recibido" : "Traslado — enviado";
  }
  if (m.motivo_movimiento) {
    const prefijo = m.tipo === "entrada" ? "Ingreso" : "Salida";
    return `${prefijo} — ${MOTIVO_LABEL[m.motivo_movimiento] ?? m.motivo_movimiento}`;
  }
  return m.cantidad >= 0 ? "Ingreso — Ajuste" : "Salida — Ajuste";
}

function varianteMovimiento(m: Movimiento): "default" | "destructive" | "secondary" | "outline" {
  if (m.tipo === "ajuste") return "secondary";
  if (m.motivo_movimiento === "traslado") return "outline";
  return m.tipo === "entrada" ? "default" : "destructive";
}

export function MovimientosTab({
  insumos,
  sedes,
  lotes,
}: {
  insumos: Insumo[];
  sedes: Opcion[];
  lotes: LoteResumen[];
}) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [insumoId, setInsumoId] = useState(TODOS);
  const [sedeId, setSedeId] = useState(TODOS);
  const [filtroTipo, setFiltroTipo] = useState(TODOS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pending, startTransition] = useTransition();

  function buscar() {
    const { tipo, motivo } = parseFiltroTipo(filtroTipo);
    startTransition(async () => {
      const data = await listarMovimientos({
        insumoId: insumoId === TODOS ? undefined : insumoId,
        sedeId: sedeId === TODOS ? undefined : sedeId,
        tipo,
        motivo,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      setMovimientos(data as unknown as Movimiento[]);
    });
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpiar() {
    setInsumoId(TODOS);
    setSedeId(TODOS);
    setFiltroTipo(TODOS);
    setDesde("");
    setHasta("");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <SearchIcon className="size-4 text-primary" /> Filtros de movimientos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Insumo</Label>
              <Combobox
                items={[{ value: TODOS, label: "Todos" }, ...insumos.map((i) => ({ value: i.id, label: i.nombre }))]}
                value={insumoId}
                onValueChange={(v) => setInsumoId(String(v ?? TODOS))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Combobox
                items={[{ value: TODOS, label: "Todas" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                value={sedeId}
                onValueChange={(v) => setSedeId(String(v ?? TODOS))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de movimiento</Label>
              <Combobox items={OPCIONES_TIPO} value={filtroTipo} onValueChange={(v) => setFiltroTipo(String(v ?? TODOS))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={limpiar}>
              <XIcon /> Limpiar
            </Button>
            <Button onClick={buscar} disabled={pending}>
              <SearchIcon /> {pending ? "Buscando..." : "Buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">
            Historial de movimientos {movimientos.length > 0 ? `(${movimientos.length})` : ""}
          </CardTitle>
          <NuevoMovimientoDialog insumos={insumos} lotes={lotes} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Insumo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("es-CO")}
                  </TableCell>
                  <TableCell className="font-medium">{m.lotes?.insumos?.nombre ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={varianteMovimiento(m)}>{labelMovimiento(m)}</Badge>
                  </TableCell>
                  <TableCell className={m.tipo === "salida" ? "text-destructive" : ""}>
                    {m.tipo === "salida" ? "-" : "+"}
                    {Math.abs(m.cantidad)} {m.lotes?.insumos?.unidad_medida ?? ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.lotes?.numero_lote ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.lotes?.sedes?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.tratamientos?.pacientes
                      ? `${m.tratamientos.pacientes.primer_nombre} ${m.tratamientos.pacientes.primer_apellido}`
                      : (m.motivo ?? m.sitio_anatomico ?? "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.creador?.nombre ?? "—"}</TableCell>
                </TableRow>
              ))}
              {movimientos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {pending ? "Buscando..." : "Sin movimientos para estos filtros."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
