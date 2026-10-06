"use client";

import { useEffect, useState, useTransition } from "react";
import { BanIcon, CalculatorIcon, CheckIcon, DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  calcularPrestacionesPreview,
  generarLiquidacionPrestaciones,
  aprobarLiquidacionPrestaciones,
  eliminarLiquidacionPrestaciones,
  anularLiquidacionPrestaciones,
  listarLiquidacionesPrestaciones,
  obtenerLiquidacionPrestaciones,
  type DesglosePrestaciones,
} from "@/lib/rrhh/prestaciones";
import { obtenerClinicaParaPdf } from "@/lib/clinicas/actions";
import { generarPdfLiquidacionPrestaciones } from "@/lib/rrhh/pdf";
import { TIPOS_LIQUIDACION_PRESTACIONES, labelTipoLiquidacion } from "@/lib/rrhh/constantes";
import { formatoMoneda } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function CampoNumero({ id, label, valor }: { id: string; label: string; valor: number }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} name={id} type="number" step="1" defaultValue={valor} />
    </div>
  );
}

function LiquidarPrestacionesDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const anioActual = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState("fin_de_anio");
  const [anio, setAnio] = useState(String(anioActual));
  const [desglose, setDesglose] = useState<DesglosePrestaciones | null>(null);
  const [pendingCalculo, startCalculo] = useTransition();
  const [pendingGuardar, startGuardar] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTipo("fin_de_anio");
      setAnio(String(anioActual));
      setDesglose(null);
      setError(null);
    }
  }

  function handleCalcular(formData: FormData) {
    setError(null);
    startCalculo(async () => {
      try {
        setDesglose(await calcularPrestacionesPreview(empleadoId, formData));
      } catch (e) {
        setDesglose(null);
        setError(e instanceof Error ? e.message : "No se pudo calcular.");
      }
    });
  }

  function handleGuardar(formData: FormData) {
    setError(null);
    startGuardar(async () => {
      try {
        await generarLiquidacionPrestaciones(empleadoId, formData);
        onCreado();
        toast.add({ title: "Liquidación guardada como borrador", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  const esFinDeAnio = desglose?.tipo === "fin_de_anio";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline"><PlusIcon /> Liquidar prestaciones</Button>} />
      <DialogContent className="md:max-w-2xl">
        <DialogHeader><DialogTitle>Liquidar prestaciones sociales</DialogTitle></DialogHeader>

        <form action={handleCalcular} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tipoLiquidacion">Qué se liquida</Label>
              <Combobox
                id="tipoLiquidacion"
                name="tipo"
                items={[...TIPOS_LIQUIDACION_PRESTACIONES]}
                value={tipo}
                onValueChange={(v) => { setTipo(String(v)); setDesglose(null); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="anioLiquidacion">Año</Label>
              <Input id="anioLiquidacion" name="anio" type="number" min="2000" max="2100" value={anio}
                onChange={(e) => { setAnio(e.target.value); setDesglose(null); }} required />
            </div>
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={pendingCalculo}>
            <CalculatorIcon /> {pendingCalculo ? "Calculando..." : "Calcular"}
          </Button>
        </form>

        {desglose ? (
          <form action={handleGuardar} className="space-y-4">
            <input type="hidden" name="tipo" value={desglose.tipo} />
            <input type="hidden" name="anio" value={desglose.anio} />
            <input type="hidden" name="fechaInicio" value={desglose.fechaInicio} />
            <input type="hidden" name="fechaFin" value={desglose.fechaFin} />
            <Card>
              <CardContent className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">
                  Período {desglose.fechaInicio} a {desglose.fechaFin} — puedes ajustar cualquier valor antes de guardar.
                </p>
                {desglose.notas.map((n) => (
                  <p key={n} className="text-xs text-muted-foreground">• {n}</p>
                ))}

                <p className="pt-1 text-xs font-semibold">A pagar al trabajador</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <CampoNumero id="basePrima" label="Base prima" valor={desglose.basePrima} />
                  <CampoNumero id="diasPrima" label="Días prima" valor={desglose.diasPrima} />
                  <CampoNumero id="valorPrima" label="Prima de servicios" valor={desglose.valorPrima} />
                </div>
                {esFinDeAnio ? (
                  <CampoNumero id="valorIntereses" label="Intereses sobre cesantías (12% anual)" valor={desglose.valorIntereses} />
                ) : (
                  <input type="hidden" name="valorIntereses" value={0} />
                )}
                <CampoNumero id="totalPagarTrabajador" label="Total a pagar al trabajador" valor={desglose.totalPagarTrabajador} />

                {esFinDeAnio ? (
                  <>
                    <p className="border-t pt-3 text-xs font-semibold">A consignar en el fondo de cesantías (antes del 14 de febrero)</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <CampoNumero id="baseCesantias" label="Base cesantías" valor={desglose.baseCesantias} />
                      <CampoNumero id="diasCesantias" label="Días cesantías" valor={desglose.diasCesantias} />
                      <CampoNumero id="valorCesantias" label="Cesantías" valor={desglose.valorCesantias} />
                    </div>
                    <CampoNumero id="totalConsignarFondo" label="Total a consignar" valor={desglose.totalConsignarFondo} />
                  </>
                ) : (
                  <>
                    <input type="hidden" name="baseCesantias" value={0} />
                    <input type="hidden" name="diasCesantias" value={0} />
                    <input type="hidden" name="valorCesantias" value={0} />
                    <input type="hidden" name="totalConsignarFondo" value={0} />
                  </>
                )}
              </CardContent>
            </Card>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Button type="submit" className="w-full" disabled={pendingGuardar}>
              {pendingGuardar ? "Guardando..." : "Guardar como borrador"}
            </Button>
          </form>
        ) : error ? (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AnularLiquidacionDialog({ id, empleadoId, onAnulado }: { id: string; empleadoId: string; onAnulado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAnular(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await anularLiquidacionPrestaciones(id, empleadoId, formData);
        onAnulado();
        toast.add({ title: "Liquidación anulada", type: "success" });
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
        <DialogHeader><DialogTitle>Anular liquidación</DialogTitle></DialogHeader>
        <form action={handleAnular} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="space-y-2">
            <Label htmlFor="motivoAnularLiquidacion">Motivo de anulación</Label>
            <Textarea id="motivoAnularLiquidacion" name="motivo" rows={2} required />
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Anulando..." : "Anular liquidación"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PrestacionesCard({
  empleadoId,
  puedeCrear,
  puedeEditar,
  puedeAnular,
}: {
  empleadoId: string;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAnular: boolean;
}) {
  const [registros, setRegistros] = useState<Awaited<ReturnType<typeof listarLiquidacionesPrestaciones>>>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => setRegistros(await listarLiquidacionesPrestaciones(empleadoId)));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aprobar(id: string) {
    try {
      await aprobarLiquidacionPrestaciones(id, empleadoId);
      cargar();
      toast.add({ title: "Liquidación aprobada — ya no se puede editar", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo aprobar.", type: "error" });
    }
  }

  async function eliminar(id: string) {
    if (confirmandoId !== id) {
      setConfirmandoId(id);
      return;
    }
    setConfirmandoId(null);
    try {
      await eliminarLiquidacionPrestaciones(id, empleadoId);
      cargar();
      toast.add({ title: "Borrador eliminado", type: "success" });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo eliminar.", type: "error" });
    }
  }

  async function descargarPdf(id: string) {
    try {
      const [clinica, liquidacion] = await Promise.all([obtenerClinicaParaPdf(), obtenerLiquidacionPrestaciones(id)]);
      if (!liquidacion) throw new Error("No se encontró la liquidación.");
      const empleado = liquidacion.empleados as unknown as {
        nombre: string;
        numero_identificacion: string | null;
        tipos_identificacion: { nombre: string } | null;
        fondos_cesantias: { nombre: string } | null;
      } | null;
      await generarPdfLiquidacionPrestaciones({
        clinica,
        empleado: {
          nombre: empleado?.nombre ?? "—",
          identificacion: empleado?.numero_identificacion
            ? `${empleado.tipos_identificacion?.nombre ?? ""} ${empleado.numero_identificacion}`.trim()
            : null,
          fondoCesantias: empleado?.fondos_cesantias?.nombre ?? null,
        },
        liquidacion,
      });
    } catch (e) {
      toast.add({ title: e instanceof Error ? e.message : "No se pudo generar el PDF.", type: "error" });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Prestaciones sociales ({registros.length})</CardTitle>
        {puedeCrear ? <LiquidarPrestacionesDialog empleadoId={empleadoId} onCreado={cargar} /> : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Liquidación</TableHead>
              <TableHead>A pagar</TableHead>
              <TableHead className="hidden md:table-cell">A consignar</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r) => {
              const esBorrador = !r.aprobado && !r.anulado;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-medium">{r.anio}</span>
                    <span className="block text-xs text-muted-foreground">{labelTipoLiquidacion(r.tipo)}</span>
                  </TableCell>
                  <TableCell className="font-medium">{formatoMoneda(r.total_pagar_trabajador)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {r.total_consignar_fondo ? formatoMoneda(r.total_consignar_fondo) : "—"}
                  </TableCell>
                  <TableCell>
                    {r.anulado ? (
                      <Badge variant="destructive">Anulado: {r.anulado_motivo}</Badge>
                    ) : r.aprobado ? (
                      <Badge variant="outline">Aprobado</Badge>
                    ) : (
                      <Badge>Borrador</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex justify-end gap-2">
                      <Button variant="outline" size="sm" aria-label="Descargar PDF" onClick={() => descargarPdf(r.id)}>
                        <DownloadIcon />
                        <span className="hidden md:inline">PDF</span>
                      </Button>
                      {esBorrador && puedeEditar ? (
                        <>
                          <Button variant="outline" size="sm" aria-label="Aprobar" onClick={() => aprobar(r.id)}>
                            <CheckIcon />
                            <span className="hidden md:inline">Aprobar</span>
                          </Button>
                          <Button
                            variant={confirmandoId === r.id ? "destructive" : "outline"}
                            size="sm"
                            aria-label="Eliminar borrador"
                            onClick={() => eliminar(r.id)}
                            onBlur={() => setConfirmandoId((prev) => (prev === r.id ? null : prev))}
                          >
                            <Trash2Icon />
                            {confirmandoId === r.id ? <span className="hidden md:inline">¿Eliminar?</span> : null}
                          </Button>
                        </>
                      ) : null}
                      {r.aprobado && !r.anulado && puedeAnular ? (
                        <AnularLiquidacionDialog id={r.id} empleadoId={empleadoId} onAnulado={cargar} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {registros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Todavía no hay liquidaciones. La prima se liquida en junio y diciembre; cesantías e intereses al cierre del año.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
