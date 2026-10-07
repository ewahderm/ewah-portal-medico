"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarSeguimiento } from "@/lib/sst/eventos";
import type { EventoSst } from "@/lib/sst/consultas";
import { hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SeguimientoForm({ evento, puedeEditar }: { evento: EventoSst; puedeEditar: boolean }) {
  // Valores por defecto congelados al montar (Base UI no admite que cambie
  // el defaultValue de un campo no controlado tras router.refresh()).
  const [e] = useState(evento);
  const router = useRouter();
  const hoy = hoyColombiaCliente();
  const lesion = e.tipo_evento !== "incidente";
  const grave = e.gravedad === "grave" || e.gravedad === "mortal";
  const [arl, setArl] = useState(e.reportado_arl);
  const [eps, setEps] = useState(e.reportado_eps);
  const [mt, setMt] = useState(e.reportado_mintrabajo);
  const [cerrado, setCerrado] = useState(e.cerrado);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const t = (k: string) => String(fd.get(k) ?? "").trim() || null;
    const n = (k: string) => Number(fd.get(k) ?? 0) || 0;
    setPendiente(true);
    setError(null);
    const r = await actualizarSeguimiento(e.id, {
      reportadoArl: arl,
      fechaReporteArl: t("fechaReporteArl"),
      furat: t("furat"),
      reportadoEps: eps,
      fechaReporteEps: t("fechaReporteEps"),
      reportadoMintrabajo: mt,
      fechaReporteMintrabajo: t("fechaReporteMintrabajo"),
      radicadoMintrabajo: t("radicadoMintrabajo"),
      diasIncapacidad: n("diasIncapacidad"),
      diasCargados: n("diasCargados"),
      seguimientoBiologico: t("seguimientoBiologico"),
      causa: t("causa"),
      cerrado,
      fechaCierre: t("fechaCierre"),
      resumenCierre: t("resumenCierre"),
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Seguimiento guardado", type: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!puedeEditar || pendiente} className="space-y-4">
        {lesion ? (
          <div className="space-y-3">
            <Reporte etiqueta="Reportado a la ARL (FURAT)" marcado={arl} onCambio={setArl} id="fechaReporteArl" valor={e.fecha_reporte_arl} hoy={hoy}>
              <div className="space-y-1">
                <Label htmlFor="furat">Número del FURAT o radicado</Label>
                <Input id="furat" name="furat" maxLength={100} defaultValue={e.furat_numero ?? ""} />
              </div>
            </Reporte>
            <Reporte etiqueta="Reportado a la EPS" marcado={eps} onCambio={setEps} id="fechaReporteEps" valor={e.fecha_reporte_eps} hoy={hoy} />
            {grave ? (
              <Reporte
                etiqueta="Reportado a la Dirección Territorial de MinTrabajo (grave o mortal)"
                marcado={mt}
                onCambio={setMt}
                id="fechaReporteMintrabajo"
                valor={e.fecha_reporte_mintrabajo}
                hoy={hoy}
              >
                <div className="space-y-1">
                  <Label htmlFor="radicadoMintrabajo">Radicado</Label>
                  <Input id="radicadoMintrabajo" name="radicadoMintrabajo" maxLength={100} defaultValue={e.radicado_mintrabajo ?? ""} />
                </div>
              </Reporte>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="diasIncapacidad">Días de incapacidad</Label>
                <Input id="diasIncapacidad" name="diasIncapacidad" type="number" min={0} max={3650} defaultValue={e.dias_incapacidad} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="diasCargados">Días cargados (invalidez o muerte)</Label>
                <Input id="diasCargados" name="diasCargados" type="number" min={0} max={6000} defaultValue={e.dias_cargados} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Un incidente no se reporta a la ARL (no hubo lesión), pero sí se investiga.</p>
        )}
        {e.riesgo_biologico ? (
          <div className="space-y-1">
            <Label htmlFor="seguimientoBiologico">Seguimiento de la exposición biológica</Label>
            <Textarea id="seguimientoBiologico" name="seguimientoBiologico" rows={2} maxLength={2000} defaultValue={e.seguimiento_biologico ?? ""} />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="causa">Causa (resumen)</Label>
          <Textarea id="causa" name="causa" rows={2} maxLength={4000} defaultValue={e.causa ?? ""} />
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={cerrado} onCheckedChange={(v) => setCerrado(!!v)} /> Cerrar el caso
          </label>
          {cerrado ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
              <div className="space-y-1">
                <Label htmlFor="fechaCierre">Fecha de cierre</Label>
                <Input id="fechaCierre" name="fechaCierre" type="date" max={hoy} defaultValue={e.fecha_cierre ?? hoy} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="resumenCierre">Cómo se cerró</Label>
                <Textarea id="resumenCierre" name="resumenCierre" rows={2} minLength={10} maxLength={4000} defaultValue={e.resumen_cierre ?? ""} required />
              </div>
            </div>
          ) : null}
        </div>
        {puedeEditar ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar seguimiento"}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

function Reporte({
  etiqueta,
  marcado,
  onCambio,
  id,
  valor,
  hoy,
  children,
}: {
  etiqueta: string;
  marcado: boolean;
  onCambio: (v: boolean) => void;
  id: string;
  valor: string | null;
  hoy: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={marcado} onCheckedChange={(v) => onCambio(!!v)} /> {etiqueta}
      </label>
      {marcado ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={id}>Fecha del reporte</Label>
            <Input id={id} name={id} type="date" max={hoy} defaultValue={valor ?? hoy} required />
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
