"use client";

import { useState, useTransition } from "react";
import { actualizarAccidenteTrabajo } from "@/lib/rrhh/accidentes";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type AccidenteRow = {
  id: string;
  fecha: string;
  resumen: string;
  causa: string | null;
  acciones_correctivas: string | null;
  reportado_centro_trabajo: boolean;
  fecha_reporte_centro_trabajo: string | null;
  reportado_arl: boolean;
  fecha_reporte_arl: string | null;
  en_investigacion: boolean;
  plan_accion_correctivo: boolean;
  cerrado: boolean;
  genera_incapacidad: boolean;
  fecha_cierre: string | null;
  resumen_cierre: string | null;
  empleados: { id: string; nombre: string } | null;
};

export function AccidenteDetalleDialog({
  accidente,
  onActualizado,
  trigger,
}: {
  accidente: AccidenteRow;
  onActualizado: () => void;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reportadoCentro, setReportadoCentro] = useState(accidente.reportado_centro_trabajo);
  const [reportadoArl, setReportadoArl] = useState(accidente.reportado_arl);
  const [cerrado, setCerrado] = useState(accidente.cerrado);

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await actualizarAccidenteTrabajo(accidente.id, formData);
        onActualizado();
        toast.add({ title: "Accidente actualizado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accidente de {accidente.empleados?.nombre ?? "—"}</DialogTitle>
        </DialogHeader>
        <form action={handleGuardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {accidente.fecha} — {accidente.resumen}
          </p>

          <div className="space-y-2">
            <Label htmlFor="causa">Causa</Label>
            <Textarea id="causa" name="causa" rows={2} defaultValue={accidente.causa ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accionesCorrectivas">Acciones correctivas</Label>
            <Textarea
              id="accionesCorrectivas"
              name="accionesCorrectivas"
              rows={2}
              defaultValue={accidente.acciones_correctivas ?? ""}
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="reportadoCentroTrabajo"
                name="reportadoCentroTrabajo"
                checked={reportadoCentro}
                onCheckedChange={(v) => setReportadoCentro(!!v)}
              />
              <Label htmlFor="reportadoCentroTrabajo" className="font-normal">
                Reportado al centro de trabajo
              </Label>
            </div>
            {reportadoCentro ? (
              <Input
                type="date"
                name="fechaReporteCentroTrabajo"
                defaultValue={accidente.fecha_reporte_centro_trabajo ?? ""}
              />
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox
                id="reportadoArl"
                name="reportadoArl"
                checked={reportadoArl}
                onCheckedChange={(v) => setReportadoArl(!!v)}
              />
              <Label htmlFor="reportadoArl" className="font-normal">
                Reportado a la ARL (plazo legal: 2 días hábiles)
              </Label>
            </div>
            {reportadoArl ? (
              <Input type="date" name="fechaReporteArl" defaultValue={accidente.fecha_reporte_arl ?? ""} />
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox id="enInvestigacion" name="enInvestigacion" defaultChecked={accidente.en_investigacion} />
              <Label htmlFor="enInvestigacion" className="font-normal">
                En investigación
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="planAccionCorrectivo" name="planAccionCorrectivo" defaultChecked={accidente.plan_accion_correctivo} />
              <Label htmlFor="planAccionCorrectivo" className="font-normal">
                Plan de acción correctivo definido
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="generaIncapacidad" name="generaIncapacidad" defaultChecked={accidente.genera_incapacidad} />
              <Label htmlFor="generaIncapacidad" className="font-normal">
                Genera incapacidad
              </Label>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="cerrado" name="cerrado" checked={cerrado} onCheckedChange={(v) => setCerrado(!!v)} />
              <Label htmlFor="cerrado" className="font-normal">
                Caso cerrado
              </Label>
            </div>
            {cerrado ? (
              <>
                <Input type="date" name="fechaCierre" defaultValue={accidente.fecha_cierre ?? ""} />
                <Textarea
                  name="resumenCierre"
                  rows={2}
                  placeholder="Resumen de cierre"
                  defaultValue={accidente.resumen_cierre ?? ""}
                />
              </>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
