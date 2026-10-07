"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, TriangleAlertIcon } from "lucide-react";
import { cerrarAutoevaluacion, previsualizarCierre } from "@/lib/habilitacion/cierre";
import { ESTADOS_DECLARACION, MOTIVOS_AUTOEVALUACION, etiquetaDe } from "@/lib/habilitacion/constantes";
import { hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import type { EstadoDeclaracionServicio } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoDeclaracionBadge } from "../_components/estado-declaracion-badge";

// HU-4.6: cerrar = guardar una foto que ya no cambia. Antes de cerrar se
// muestra el estado de cada servicio; si alguno tiene un "No cumple" o criterios
// pendientes no se puede declarar en el REPS y el cierre exige confirmar que se sabe (AC2/AC3).
export function CerrarAutoevaluacionBoton() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        <LockIcon /> Cerrar autoevaluación
      </Button>
      {abierto ? <CerrarAutoevaluacionDialog onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

function CerrarAutoevaluacionDialog({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const [servicios, setServicios] = useState<EstadoDeclaracionServicio[] | null>(null);
  const [nombre, setNombre] = useState(`Autoevaluación ${hoyColombiaCliente().slice(0, 4)}`);
  const [motivo, setMotivo] = useState<string>("renovacion_anual");
  const [confirmo, setConfirmo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function cargar() {
    const r = await previsualizarCierre();
    if (r.error) setError(r.error);
    else setServicios(r.servicios ?? []);
  }

  useEffect(() => {
    let vigente = true;
    previsualizarCierre().then((r) => {
      if (!vigente) return;
      if (r.error) setError(r.error);
      else setServicios(r.servicios ?? []);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const noAptos = (servicios ?? []).filter((s) => s.estado === "con_incumplimientos");
  const sinEvaluar = (servicios ?? []).filter((s) => s.estado === "sin_evaluar");
  // HU-4.6 AC2: "No cumple" O pendientes avisan y exigen confirmación explícita.
  const requiereConfirmar = noAptos.length + sinEvaluar.length > 0;

  async function cerrar(e: React.FormEvent) {
    e.preventDefault();
    setPendiente(true);
    setError(null);
    try {
      const r = await cerrarAutoevaluacion({ nombre, motivo, confirmoNoAptos: confirmo });
      if (r.error) {
        setError(r.error);
        // Cambió la lista mientras el diálogo estaba abierto: se recarga.
        if (r.requiereConfirmar) {
          setConfirmo(false);
          await cargar();
        }
        return;
      }
      toast.add({ title: "Autoevaluación cerrada", description: "Quedó guardada en el historial tal como está hoy.", type: "success" });
      router.push(`/habilitacion/autoevaluacion/historial/${r.id}`);
    } finally {
      setPendiente(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar la autoevaluación</DialogTitle>
          <DialogDescription>
            Guardamos una foto de cómo está hoy cada criterio, con su evidencia. La foto no se puede editar: es lo que
            declaras en el REPS. Después puedes seguir evaluando para la próxima.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={cerrar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nombre-cierre">Nombre</Label>
              <Input id="nombre-cierre" value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} maxLength={200} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="motivo-cierre">Motivo</Label>
              <Combobox
                id="motivo-cierre"
                items={MOTIVOS_AUTOEVALUACION.map((m) => ({ value: m.value, label: m.label }))}
                value={motivo}
                onValueChange={(v) => setMotivo(v ?? "renovacion_anual")}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{MOTIVOS_AUTOEVALUACION.find((m) => m.value === motivo)?.ayuda}</p>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tus servicios hoy</p>
            {servicios === null && !error ? (
              <p className="text-sm text-muted-foreground">Calculando…</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                {(servicios ?? []).map((s) => (
                  <li key={`${s.sede_id}-${s.servicio_norma_id}`} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {s.servicio_clave} {s.servicio_nombre}
                      </span>
                      <span className="text-muted-foreground"> · {s.sede_nombre}</span>
                    </span>
                    <EstadoDeclaracionBadge estado={s.estado} noCumple={s.no_cumple} pendientes={s.pendientes} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {requiereConfirmar ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription className="space-y-2">
                {noAptos.length > 0 ? (
                  <p>
                    {noAptos.length === 1 ? "Este servicio no se puede declarar" : `Estos ${noAptos.length} servicios no se pueden declarar`} en
                    el REPS: la norma no admite cumplimiento parcial y tienen al menos un «No cumple».
                  </p>
                ) : null}
                {sinEvaluar.length > 0 ? (
                  <p>
                    {sinEvaluar.length === 1 ? "Este servicio tiene" : `Estos ${sinEvaluar.length} servicios tienen`} criterios sin evaluar: en la foto
                    quedan como «Pendiente» y tampoco se pueden declarar hasta evaluarlos.
                  </p>
                ) : null}
                <label className="flex items-start gap-2 font-medium">
                  <Checkbox checked={confirmo} onCheckedChange={(v) => setConfirmo(!!v)} />
                  <span>
                    Entiendo que {noAptos.length + sinEvaluar.length === 1 ? "ese servicio queda" : "esos servicios quedan"} sin poder declararse
                    {noAptos.length > 0 ? ` («${etiquetaDe(ESTADOS_DECLARACION, "con_incumplimientos")}»)` : ""}
                    {noAptos.length > 0 && sinEvaluar.length > 0 ? " o " : ""}
                    {sinEvaluar.length > 0 ? ` («${etiquetaDe(ESTADOS_DECLARACION, "sin_evaluar")}»)` : ""} y cierro igual.
                  </span>
                </label>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/habilitacion/autoevaluacion/historial" className="text-sm text-primary underline-offset-4 hover:underline">
              Ver cierres anteriores
            </Link>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente || servicios === null || servicios.length === 0 || (requiereConfirmar && !confirmo)}>
                {pendiente ? "Cerrando…" : "Cerrar y guardar la foto"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
