"use client";

import { useEffect, useState, useTransition } from "react";
import { PlusIcon, BanIcon } from "lucide-react";
import { generarComprobanteNomina, anularComprobanteNomina, listarComprobantesNomina } from "@/lib/rrhh/nomina";
import { generarComprobanteHonorarios, anularComprobanteHonorarios, listarComprobantesHonorarios } from "@/lib/rrhh/honorarios";
import { formatoMoneda } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { TIPO_PERIODO_NOMINA } from "@/lib/rrhh/constantes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function GenerarNominaDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tipoPeriodo, setTipoPeriodo] = useState("mensual");

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await generarComprobanteNomina(empleadoId, formData);
        onCreado();
        toast.add({ title: "Comprobante generado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el comprobante.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><PlusIcon /> Generar comprobante de nómina</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Generar comprobante de nómina</DialogTitle></DialogHeader>
        <form action={handleGuardar} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="space-y-2">
            <Label htmlFor="tipoPeriodo">Tipo de período</Label>
            <Combobox id="tipoPeriodo" name="tipoPeriodo" items={[...TIPO_PERIODO_NOMINA]} value={tipoPeriodo} onValueChange={(v) => setTipoPeriodo(String(v))} />
          </div>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="comisiones">Comisiones (opcional)</Label>
              <Input id="comisiones" name="comisiones" type="number" min="0" step="1000" defaultValue={0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="otrasDeducciones">Otras deducciones (opcional)</Label>
              <Input id="otrasDeducciones" name="otrasDeducciones" type="number" min="0" step="1000" defaultValue={0} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="comisionesIncluidasIbc" name="comisionesIncluidasIbc" />
            <Label htmlFor="comisionesIncluidasIbc" className="font-normal">Las comisiones hacen parte del salario base (IBC)</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="retencionFuente">Retención en la fuente (manual, opcional)</Label>
            <Input id="retencionFuente" name="retencionFuente" type="number" min="0" step="1000" defaultValue={0} />
            <p className="text-xs text-muted-foreground">Ajústala con tu contador — no se calcula automáticamente.</p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Generando..." : "Generar y calcular"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerarHonorariosDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await generarComprobanteHonorarios(empleadoId, formData);
        onCreado();
        toast.add({ title: "Comprobante generado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el comprobante.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><PlusIcon /> Generar comprobante de honorarios</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Generar comprobante de honorarios</DialogTitle></DialogHeader>
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
            <Label htmlFor="valorBruto">Valor bruto pactado</Label>
            <Input id="valorBruto" name="valorBruto" type="number" min="0" step="1000" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="soporteSeguridadSocial">Soporte de pago de seguridad social (recomendado)</Label>
            <input id="soporteSeguridadSocial" name="soporteSeguridadSocial" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
            <p className="text-xs text-muted-foreground">
              Buena práctica frente a una auditoría de la UGPP — no bloquea el pago si falta.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Generando..." : "Generar y calcular"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnularComprobanteDialog({
  esLaboral,
  id,
  empleadoId,
  onAnulado,
}: {
  esLaboral: boolean;
  id: string;
  empleadoId: string;
  onAnulado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAnular(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (esLaboral) await anularComprobanteNomina(id, empleadoId, formData);
        else await anularComprobanteHonorarios(id, empleadoId, formData);
        onAnulado();
        toast.add({ title: "Comprobante anulado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo anular.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><BanIcon /> Anular</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular comprobante</DialogTitle>
        </DialogHeader>
        <form action={handleAnular} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo de anulación</Label>
            <Textarea id="motivo" name="motivo" rows={2} required />
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Anulando..." : "Anular comprobante"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NominaEmpleadoTab({
  empleadoId,
  esLaboral,
  puedeCrear,
  puedeAnular,
}: {
  empleadoId: string;
  esLaboral: boolean;
  puedeCrear: boolean;
  puedeAnular: boolean;
}) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      if (esLaboral) {
        const { registros: r } = await listarComprobantesNomina({ empleadoId });
        setRegistros(r);
      } else {
        const { registros: r } = await listarComprobantesHonorarios({ empleadoId });
        setRegistros(r);
      }
    });
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">{esLaboral ? "Nómina" : "Honorarios"} ({registros.length})</CardTitle>
        {puedeCrear ? (
          esLaboral ? (
            <GenerarNominaDialog empleadoId={empleadoId} onCreado={cargar} />
          ) : (
            <GenerarHonorariosDialog empleadoId={empleadoId} onCreado={cargar} />
          )
        ) : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Neto a pagar</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r) => (
              <TableRow key={r.id as string}>
                <TableCell className="text-muted-foreground">
                  {r.fecha_inicio as string} — {r.fecha_fin as string}
                </TableCell>
                <TableCell className="font-medium">{formatoMoneda(r.neto_pagar as number)}</TableCell>
                <TableCell>
                  {r.anulado ? (
                    <Badge variant="destructive">Anulado: {r.anulado_motivo as string}</Badge>
                  ) : (
                    <Badge variant="outline">Vigente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {puedeAnular && !r.anulado ? (
                    <AnularComprobanteDialog
                      esLaboral={esLaboral}
                      id={r.id as string}
                      empleadoId={empleadoId}
                      onAnulado={cargar}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {registros.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Todavía no hay comprobantes.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
