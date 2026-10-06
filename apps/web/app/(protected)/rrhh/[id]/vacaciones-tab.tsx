"use client";

import { useEffect, useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  crearVacaciones,
  eliminarVacaciones,
  listarVacacionesEmpleado,
  calcularDiasAcumuladosVacaciones,
} from "@/lib/rrhh/vacaciones";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Vacaciones = Awaited<ReturnType<typeof listarVacacionesEmpleado>>[number];
type Acumulado = Awaited<ReturnType<typeof calcularDiasAcumuladosVacaciones>>;

function NuevasVacacionesDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await crearVacaciones(empleadoId, formData);
        onCreado();
        toast.add({ title: "Vacaciones registradas", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><PlusIcon /> Registrar vacaciones</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar vacaciones</DialogTitle></DialogHeader>
        <form action={handleGuardar} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaInicio">Fecha de inicio</Label>
              <Input id="fechaInicio" name="fechaInicio" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFin">Fecha de fin</Label>
              <Input id="fechaFin" name="fechaFin" type="date" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="diasTomados">Días hábiles tomados</Label>
            <Input id="diasTomados" name="diasTomados" type="number" min="1" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cartaSolicitud">Carta de solicitud (opcional)</Label>
            <input id="cartaSolicitud" name="cartaSolicitud" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VacacionesTab({ empleadoId, puedeCrear }: { empleadoId: string; puedeCrear: boolean }) {
  const [registros, setRegistros] = useState<Vacaciones[]>([]);
  const [acumulado, setAcumulado] = useState<Acumulado>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const [r, a] = await Promise.all([
        listarVacacionesEmpleado(empleadoId),
        calcularDiasAcumuladosVacaciones(empleadoId),
      ]);
      setRegistros(r);
      setAcumulado(a);
    });
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function eliminar(id: string) {
    if (confirmandoId !== id) {
      setConfirmandoId(id);
      return;
    }
    setConfirmandoId(null);
    try {
      await eliminarVacaciones(id, empleadoId);
      cargar();
      toast.add({ title: "Registro eliminado", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo eliminar.", type: "error" });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-medium">Vacaciones</CardTitle>
          {acumulado ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Generados: {acumulado.diasGenerados} · Tomados: {acumulado.diasTomados} ·{" "}
              <span className="font-medium text-foreground">Disponibles: {acumulado.diasDisponibles}</span>
            </p>
          ) : null}
        </div>
        {puedeCrear ? <NuevasVacacionesDialog empleadoId={empleadoId} onCreado={cargar} /> : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Días tomados</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{r.fecha_inicio} — {r.fecha_fin}</TableCell>
                <TableCell>{r.dias_tomados}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={confirmandoId === r.id ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => eliminar(r.id)}
                    onBlur={() => setConfirmandoId((prev) => (prev === r.id ? null : prev))}
                  >
                    <Trash2Icon />
                    {confirmandoId === r.id ? <span className="hidden md:inline">¿Eliminar?</span> : null}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {registros.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin vacaciones registradas.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
