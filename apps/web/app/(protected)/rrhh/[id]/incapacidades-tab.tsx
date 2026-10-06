"use client";

import { useEffect, useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  crearIncapacidad,
  eliminarIncapacidad,
  listarIncapacidadesEmpleado,
} from "@/lib/rrhh/incapacidades";
import { ORIGEN_INCAPACIDAD } from "@/lib/rrhh/constantes";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Incapacidad = Awaited<ReturnType<typeof listarIncapacidadesEmpleado>>[number];

function NuevaIncapacidadDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [origen, setOrigen] = useState("enfermedad_general");

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await crearIncapacidad(empleadoId, formData);
        onCreado();
        toast.add({ title: "Incapacidad registrada", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><PlusIcon /> Nueva incapacidad</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar incapacidad</DialogTitle></DialogHeader>
        <form action={handleGuardar} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaInicio">Fecha de inicio</Label>
              <Input id="fechaInicio" name="fechaInicio" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dias">Días</Label>
              <Input id="dias" name="dias" type="number" min="1" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="origen">Origen</Label>
            <Combobox id="origen" name="origen" items={[...ORIGEN_INCAPACIDAD]} value={origen} onValueChange={(v) => setOrigen(String(v))} />
          </div>
          {origen === "laboral" ? (
            <p className="text-xs text-muted-foreground">
              Si ya registraste el accidente en la pestaña &quot;Accidentes laborales&quot; de RRHH, no hace falta duplicar la información aquí.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Días 1-2 los paga el empleador (66,66%), del 3 al 90 la EPS (66,66%), del 91 al 180 la
              EPS (50%).
            </p>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="gestionadaEps" name="gestionadaEps" />
            <Label htmlFor="gestionadaEps" className="font-normal">Gestionada con la EPS</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="epsPago" name="epsPago" />
            <Label htmlFor="epsPago" className="font-normal">La EPS ya pagó</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fechaPago">Fecha de pago (opcional)</Label>
            <Input id="fechaPago" name="fechaPago" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="soporte" className="font-semibold">Soporte (opcional)</Label>
            <FileInput id="soporte" name="soporte" accept="application/pdf,image/jpeg,image/png" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IncapacidadesTab({ empleadoId, puedeCrear }: { empleadoId: string; puedeCrear: boolean }) {
  const [registros, setRegistros] = useState<Incapacidad[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      setRegistros(await listarIncapacidadesEmpleado(empleadoId));
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
      await eliminarIncapacidad(id, empleadoId);
      cargar();
      toast.add({ title: "Incapacidad eliminada", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo eliminar.", type: "error" });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Incapacidades ({registros.length})</CardTitle>
        {puedeCrear ? <NuevaIncapacidadDialog empleadoId={empleadoId} onCreado={cargar} /> : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inicio</TableHead>
              <TableHead>Días</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="hidden md:table-cell">EPS</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{r.fecha_inicio}</TableCell>
                <TableCell>{r.dias}</TableCell>
                <TableCell>
                  <Badge variant={r.origen === "laboral" ? "destructive" : "outline"}>
                    {r.origen === "laboral" ? "Laboral" : "Enfermedad general"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {r.gestionada_eps ? (r.eps_pago ? "Gestionada y pagada" : "Gestionada, sin pagar") : "Sin gestionar"}
                </TableCell>
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
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin incapacidades registradas.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
