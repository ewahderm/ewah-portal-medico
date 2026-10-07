"use client";

import { useState, useTransition } from "react";
import { PlusIcon, CalculatorIcon, PencilIcon, BanIcon } from "lucide-react";
import {
  calcularComprobanteNominaPreview,
  generarComprobanteNomina,
  editarComprobanteNomina,
  anularComprobanteNomina,
  type DesgloseNomina,
} from "@/lib/rrhh/nomina";
import {
  calcularComprobanteHonorariosPreview,
  generarComprobanteHonorarios,
  editarComprobanteHonorarios,
  anularComprobanteHonorarios,
  type DesgloseHonorarios,
} from "@/lib/rrhh/honorarios";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { TIPO_PERIODO_NOMINA } from "@/lib/rrhh/constantes";
import { formatoPorcentaje } from "@/lib/format";
import { exigirExito } from "@/lib/forms/resultado";

// ============================================================
// Nómina — desglose editable (compartido entre "generar" y "editar")
// ============================================================
function CamposDesgloseNomina({ desglose }: { desglose: DesgloseNomina }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <p className="text-xs font-semibold text-muted-foreground">
          Detalle del pago — puedes ajustar cualquier valor antes de guardar
        </p>
        <input type="hidden" name="salarioIntegral" value={desglose.salarioIntegral ? "on" : ""} />
        {desglose.salarioIntegral ? (
          <Alert>
            <AlertDescription className="text-xs">
              Salario integral: los aportes y parafiscales se calculan sobre el 70% del salario, no hay
              auxilio de transporte ni exoneración, y no causa prima, cesantías ni intereses.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="salarioBase" className="text-xs">Salario básico del período</Label>
            <Input id="salarioBase" name="salarioBase" type="number" step="1" defaultValue={desglose.salarioBase} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auxilioTransporte" className="text-xs">Auxilio de transporte</Label>
            <Input id="auxilioTransporte" name="auxilioTransporte" type="number" step="1" defaultValue={desglose.auxilioTransporte} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comisiones" className="text-xs">Comisiones</Label>
            <Input id="comisiones" name="comisiones" type="number" step="1" defaultValue={desglose.comisiones} />
          </div>
          <div className="flex items-end pb-1.5">
            <div className="flex items-center gap-2">
              <Checkbox id="comisionesIncluidasIbc" name="comisionesIncluidasIbc" defaultChecked={desglose.comisionesIncluidasIbc} />
              <Label htmlFor="comisionesIncluidasIbc" className="text-xs font-normal">Comisiones hacen parte del IBC</Label>
            </div>
          </div>
          {desglose.esColombia ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="deduccionSalud" className="text-xs">Deducción salud (4%)</Label>
                <Input id="deduccionSalud" name="deduccionSalud" type="number" step="1" defaultValue={desglose.deduccionSalud} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="deduccionPension" className="text-xs">Deducción pensión (4%)</Label>
                <Input id="deduccionPension" name="deduccionPension" type="number" step="1" defaultValue={desglose.deduccionPension} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="deduccionFsp" className="text-xs">
                  Fondo de Solidaridad Pensional
                  {desglose.porcentajeFsp ? ` (${formatoPorcentaje(desglose.porcentajeFsp)})` : ""}
                </Label>
                <Input id="deduccionFsp" name="deduccionFsp" type="number" step="1" defaultValue={desglose.deduccionFsp} />
                <p className="text-xs text-muted-foreground">
                  Aplica desde 4 salarios mínimos de base de cotización (Ley 797 de 2003). Si no aplica, queda en 0.
                </p>
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="deduccionSalud" value={desglose.deduccionSalud} />
              <input type="hidden" name="deduccionPension" value={desglose.deduccionPension} />
              <input type="hidden" name="deduccionFsp" value={desglose.deduccionFsp} />
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="retencionFuente" className="text-xs">Retención en la fuente (manual)</Label>
            <Input id="retencionFuente" name="retencionFuente" type="number" step="1" defaultValue={desglose.retencionFuente} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="otrasDeducciones" className="text-xs">Otras deducciones</Label>
            <Input id="otrasDeducciones" name="otrasDeducciones" type="number" step="1" defaultValue={desglose.otrasDeducciones} />
          </div>
        </div>

        {desglose.esColombia ? (
          <>
            <p className="pt-2 text-xs font-semibold text-muted-foreground">
              Aportes patronales (informativo, a cargo de la clínica)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="aportePatronalSalud" className="text-xs">Salud (8.5%)</Label>
                <Input id="aportePatronalSalud" name="aportePatronalSalud" type="number" step="1" defaultValue={desglose.aportePatronalSalud} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="aportePatronalPension" className="text-xs">Pensión (12%)</Label>
                <Input id="aportePatronalPension" name="aportePatronalPension" type="number" step="1" defaultValue={desglose.aportePatronalPension} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="aporteArl" className="text-xs">ARL</Label>
                <Input id="aporteArl" name="aporteArl" type="number" step="1" defaultValue={desglose.aporteArl} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="aporteParafiscales" className="text-xs">Parafiscales</Label>
                <Input id="aporteParafiscales" name="aporteParafiscales" type="number" step="1" defaultValue={desglose.aporteParafiscales} />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="exoneradoAportes" name="exoneradoAportes" defaultChecked={desglose.exoneradoAportes} />
              <Label htmlFor="exoneradoAportes" className="text-xs font-normal">Clínica exonerada de aportes (Ley 1607/2012)</Label>
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name="aportePatronalSalud" value={desglose.aportePatronalSalud} />
            <input type="hidden" name="aportePatronalPension" value={desglose.aportePatronalPension} />
            <input type="hidden" name="aporteArl" value={desglose.aporteArl} />
            <input type="hidden" name="aporteParafiscales" value={desglose.aporteParafiscales} />
            <input type="hidden" name="exoneradoAportes" value="" />
          </>
        )}

        <div className="space-y-1 border-t pt-3">
          <Label htmlFor="netoPagar" className="text-sm font-semibold">Neto a pagar</Label>
          <Input id="netoPagar" name="netoPagar" type="number" step="1" defaultValue={desglose.netoPagar} className="font-semibold" />
        </div>
      </CardContent>
    </Card>
  );
}

export function GenerarNominaDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCalculo, startCalculo] = useTransition();
  const [pendingGuardar, startGuardar] = useTransition();
  const [tipoPeriodo, setTipoPeriodo] = useState("mensual");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [desglose, setDesglose] = useState<DesgloseNomina | null>(null);

  function handleCalcular(formData: FormData) {
    setError(null);
    startCalculo(async () => {
      try {
        const resultado = exigirExito(await calcularComprobanteNominaPreview(empleadoId, formData));
        setDesglose(resultado);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo calcular.");
      }
    });
  }

  function handleGuardar(formData: FormData) {
    setError(null);
    startGuardar(async () => {
      try {
        exigirExito(await generarComprobanteNomina(empleadoId, formData));
        onCreado();
        toast.add({ title: "Comprobante guardado como borrador", type: "success" });
        setOpen(false);
        setDesglose(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  // Este diálogo nunca se desmonta entre aperturas (solo su contenido se
  // oculta) — sin resetear aquí, reabrir "Generar comprobante" conservaba
  // el período/fechas de la vez anterior (mismo gotcha ya corregido en
  // EmpleadoDialog).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTipoPeriodo("mensual");
      setFechaInicio("");
      setFechaFin("");
      setDesglose(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button><PlusIcon /> Generar comprobante de nómina</Button>} />
      <DialogContent className="md:max-w-2xl">
        <DialogHeader><DialogTitle>Generar comprobante de nómina</DialogTitle></DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <form action={handleCalcular} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipoPeriodo">Tipo de período</Label>
            <Combobox id="tipoPeriodo" name="tipoPeriodo" items={[...TIPO_PERIODO_NOMINA]} value={tipoPeriodo} onValueChange={(v) => setTipoPeriodo(String(v))} />
            {tipoPeriodo === "quincenal" ? (
              <p className="text-xs text-muted-foreground">El salario y el auxilio de transporte se calculan por la mitad del mes.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaInicio">Fecha de inicio</Label>
              <Input id="fechaInicio" name="fechaInicio" type="date" required value={fechaInicio} onDateChange={setFechaInicio} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFin">Fecha de fin</Label>
              <Input id="fechaFin" name="fechaFin" type="date" required value={fechaFin} onDateChange={setFechaFin} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="comisionesCalculo">Comisiones de este período (opcional)</Label>
            <Input id="comisionesCalculo" name="comisiones" type="number" min="0" step="1000" defaultValue={0} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="comisionesIncluidasIbcCalculo" name="comisionesIncluidasIbc" />
            <Label htmlFor="comisionesIncluidasIbcCalculo" className="font-normal">Las comisiones hacen parte del salario base (IBC)</Label>
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={pendingCalculo}>
            <CalculatorIcon /> {pendingCalculo ? "Calculando..." : "Calcular"}
          </Button>
        </form>

        {desglose ? (
          <form action={handleGuardar} className="space-y-4">
            <input type="hidden" name="tipoPeriodo" value={tipoPeriodo} />
            <input type="hidden" name="fechaInicio" value={fechaInicio} />
            <input type="hidden" name="fechaFin" value={fechaFin} />
            <CamposDesgloseNomina desglose={desglose} />
            <Button type="submit" className="w-full" disabled={pendingGuardar}>
              {pendingGuardar ? "Guardando..." : "Guardar como borrador"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type ComprobanteNominaRow = {
  id: string;
  tipo_periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
  salario_base: number;
  auxilio_transporte: number;
  comisiones: number;
  comisiones_incluidas_ibc: boolean;
  deduccion_salud: number;
  deduccion_pension: number;
  deduccion_fsp: number;
  salario_integral: boolean;
  aporte_patronal_salud: number;
  aporte_patronal_pension: number;
  aporte_arl: number;
  aporte_parafiscales: number;
  exonerado_aportes: boolean;
  retencion_fuente: number;
  otras_deducciones: number;
  neto_pagar: number;
};

export function EditarNominaDialog({ comprobante, empleadoId, onGuardado }: { comprobante: ComprobanteNominaRow; empleadoId: string; onGuardado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tipoPeriodo, setTipoPeriodo] = useState(comprobante.tipo_periodo);

  const desglose: DesgloseNomina = {
    esColombia: true,
    salarioIntegral: comprobante.salario_integral,
    salarioBase: comprobante.salario_base,
    auxilioTransporte: comprobante.auxilio_transporte,
    comisiones: comprobante.comisiones,
    comisionesIncluidasIbc: comprobante.comisiones_incluidas_ibc,
    deduccionSalud: comprobante.deduccion_salud,
    deduccionPension: comprobante.deduccion_pension,
    deduccionFsp: comprobante.deduccion_fsp,
    porcentajeFsp: 0,
    aportePatronalSalud: comprobante.aporte_patronal_salud,
    aportePatronalPension: comprobante.aporte_patronal_pension,
    aporteArl: comprobante.aporte_arl,
    aporteParafiscales: comprobante.aporte_parafiscales,
    exoneradoAportes: comprobante.exonerado_aportes,
    retencionFuente: comprobante.retencion_fuente,
    otrasDeducciones: comprobante.otras_deducciones,
    netoPagar: comprobante.neto_pagar,
  };

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await editarComprobanteNomina(comprobante.id, empleadoId, formData));
        onGuardado();
        toast.add({ title: "Borrador actualizado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><PencilIcon /> Editar</Button>} />
      <DialogContent className="md:max-w-2xl">
        <DialogHeader><DialogTitle>Editar comprobante de nómina (borrador)</DialogTitle></DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form action={handleGuardar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipoPeriodoEditar">Tipo de período</Label>
            <Combobox id="tipoPeriodoEditar" name="tipoPeriodo" items={[...TIPO_PERIODO_NOMINA]} value={tipoPeriodo} onValueChange={(v) => setTipoPeriodo(String(v))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaInicioEditar">Fecha de inicio</Label>
              <Input id="fechaInicioEditar" name="fechaInicio" type="date" defaultValue={comprobante.fecha_inicio} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFinEditar">Fecha de fin</Label>
              <Input id="fechaFinEditar" name="fechaFin" type="date" defaultValue={comprobante.fecha_fin} required />
            </div>
          </div>
          <CamposDesgloseNomina desglose={desglose} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Honorarios
// ============================================================
function CamposDesgloseHonorarios({ desglose }: { desglose: DesgloseHonorarios }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <p className="text-xs font-semibold text-muted-foreground">
          Detalle del pago — puedes ajustar cualquier valor antes de guardar
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="valorBruto" className="text-xs">Valor bruto pactado</Label>
            <Input id="valorBruto" name="valorBruto" type="number" step="1" defaultValue={desglose.valorBruto} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tarifaRetencion" className="text-xs">Tarifa de retención (%)</Label>
            <Input id="tarifaRetencion" name="tarifaRetencion" type="number" step="0.1" defaultValue={desglose.tarifaRetencion} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="retencionFuenteHonorarios" className="text-xs">Retención en la fuente</Label>
            <Input id="retencionFuenteHonorarios" name="retencionFuente" type="number" step="1" defaultValue={desglose.retencionFuente} />
          </div>
          <div className="flex items-end pb-1.5">
            <div className="flex items-center gap-2">
              <Checkbox id="requiereFacturaElectronica" name="requiereFacturaElectronica" defaultChecked={desglose.requiereFacturaElectronica} />
              <Label htmlFor="requiereFacturaElectronica" className="text-xs font-normal">Requiere factura electrónica (umbral DIAN)</Label>
            </div>
          </div>
        </div>
        <div className="space-y-1 border-t pt-3">
          <Label htmlFor="netoPagarHonorarios" className="text-sm font-semibold">Neto a pagar</Label>
          <Input id="netoPagarHonorarios" name="netoPagar" type="number" step="1" defaultValue={desglose.netoPagar} className="font-semibold" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="soporteSeguridadSocial" className="text-sm font-semibold">Soporte de pago de seguridad social (recomendado)</Label>
          <FileInput id="soporteSeguridadSocial" name="soporteSeguridadSocial" accept="application/pdf,image/jpeg,image/png" />
        </div>
      </CardContent>
    </Card>
  );
}

export function GenerarHonorariosDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCalculo, startCalculo] = useTransition();
  const [pendingGuardar, startGuardar] = useTransition();
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [desglose, setDesglose] = useState<DesgloseHonorarios | null>(null);

  function handleCalcular(formData: FormData) {
    setError(null);
    startCalculo(async () => {
      try {
        const resultado = exigirExito(await calcularComprobanteHonorariosPreview(empleadoId, formData));
        setDesglose(resultado);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo calcular.");
      }
    });
  }

  function handleGuardar(formData: FormData) {
    setError(null);
    startGuardar(async () => {
      try {
        exigirExito(await generarComprobanteHonorarios(empleadoId, formData));
        onCreado();
        toast.add({ title: "Comprobante guardado como borrador", type: "success" });
        setOpen(false);
        setDesglose(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFechaInicio("");
      setFechaFin("");
      setDesglose(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button><PlusIcon /> Generar comprobante de honorarios</Button>} />
      <DialogContent className="md:max-w-2xl">
        <DialogHeader><DialogTitle>Generar comprobante de honorarios</DialogTitle></DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <form action={handleCalcular} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaInicioHon">Fecha de inicio</Label>
              <Input id="fechaInicioHon" name="fechaInicio" type="date" required value={fechaInicio} onDateChange={setFechaInicio} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFinHon">Fecha de fin</Label>
              <Input id="fechaFinHon" name="fechaFin" type="date" required value={fechaFin} onDateChange={setFechaFin} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valorBrutoCalculo">Valor bruto pactado</Label>
            <Input id="valorBrutoCalculo" name="valorBruto" type="number" min="0" step="1000" required />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={pendingCalculo}>
            <CalculatorIcon /> {pendingCalculo ? "Calculando..." : "Calcular"}
          </Button>
        </form>

        {desglose ? (
          <form action={handleGuardar} className="space-y-4">
            <input type="hidden" name="fechaInicio" value={fechaInicio} />
            <input type="hidden" name="fechaFin" value={fechaFin} />
            <input type="hidden" name="declaranteRenta" value={desglose.declaranteRenta ? "on" : ""} />
            <CamposDesgloseHonorarios desglose={desglose} />
            <Button type="submit" className="w-full" disabled={pendingGuardar}>
              {pendingGuardar ? "Guardando..." : "Guardar como borrador"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type ComprobanteHonorariosRow = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  valor_bruto: number;
  declarante_renta: boolean;
  tarifa_retencion: number;
  retencion_fuente: number;
  neto_pagar: number;
  requiere_factura_electronica: boolean;
};

export function EditarHonorariosDialog({ comprobante, empleadoId, onGuardado }: { comprobante: ComprobanteHonorariosRow; empleadoId: string; onGuardado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const desglose: DesgloseHonorarios = {
    valorBruto: comprobante.valor_bruto,
    declaranteRenta: comprobante.declarante_renta,
    tarifaRetencion: comprobante.tarifa_retencion,
    retencionFuente: comprobante.retencion_fuente,
    netoPagar: comprobante.neto_pagar,
    requiereFacturaElectronica: comprobante.requiere_factura_electronica,
  };

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await editarComprobanteHonorarios(comprobante.id, empleadoId, formData));
        onGuardado();
        toast.add({ title: "Borrador actualizado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><PencilIcon /> Editar</Button>} />
      <DialogContent className="md:max-w-2xl">
        <DialogHeader><DialogTitle>Editar comprobante de honorarios (borrador)</DialogTitle></DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form action={handleGuardar} className="space-y-4">
          <input type="hidden" name="declaranteRenta" value={comprobante.declarante_renta ? "on" : ""} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaInicioEditarHon">Fecha de inicio</Label>
              <Input id="fechaInicioEditarHon" name="fechaInicio" type="date" defaultValue={comprobante.fecha_inicio} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFinEditarHon">Fecha de fin</Label>
              <Input id="fechaFinEditarHon" name="fechaFin" type="date" defaultValue={comprobante.fecha_fin} required />
            </div>
          </div>
          <CamposDesgloseHonorarios desglose={desglose} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Anular (compartido nómina/honorarios)
// ============================================================
export function AnularComprobanteDialog({
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
        if (esLaboral) exigirExito(await anularComprobanteNomina(id, empleadoId, formData));
        else exigirExito(await anularComprobanteHonorarios(id, empleadoId, formData));
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
