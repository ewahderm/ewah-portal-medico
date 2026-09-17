"use client";

import { useState, useTransition } from "react";
import { listarMovimientosLote } from "@/lib/inventario/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type Movimiento = {
  id: string;
  tipo: string;
  cantidad: number;
  cantidad_invima: number | null;
  sitio_anatomico: string | null;
  motivo: string | null;
  created_at: string;
  tratamientos: { fecha: string; pacientes: { primer_nombre: string; primer_apellido: string } | null } | null;
  creador: { nombre: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  salida_consumo: "Consumo",
  ajuste: "Ajuste",
};

const TIPO_VARIANT: Record<string, "secondary" | "outline"> = {
  entrada: "secondary",
  salida_consumo: "outline",
  ajuste: "outline",
};

export function MovimientosDialog({ loteId }: { loteId: string }) {
  const [open, setOpen] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarMovimientosLote(loteId);
      setMovimientos(data as unknown as Movimiento[]);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) cargar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Movimientos
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimientos del lote</DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Quién</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString("es-CO")}
                </TableCell>
                <TableCell>
                  <Badge variant={TIPO_VARIANT[m.tipo]}>{TIPO_LABEL[m.tipo] ?? m.tipo}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{m.cantidad}</TableCell>
                <TableCell className="text-muted-foreground">
                  {m.tratamientos?.pacientes
                    ? `${m.tratamientos.pacientes.primer_nombre} ${m.tratamientos.pacientes.primer_apellido}`
                    : (m.motivo ?? m.sitio_anatomico ?? "—")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.creador?.nombre ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {movimientos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin movimientos todavía.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
