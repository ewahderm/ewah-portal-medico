"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarXIcon, DownloadIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { cn } from "cn";
import { anularOcurrencia, noAplicaPeriodo, presentarOcurrencia, urlAcuse } from "@/lib/habilitacion/obligaciones";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { estadoOcurrencia } from "@/lib/habilitacion/semaforo";
import type { ObligacionCatalogo, Ocurrencia } from "@/lib/habilitacion/tipos";
import { dateLocalHoy } from "@/lib/medio-ambiente/fecha-local";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { abrirFirmado } from "./abrir-firmado";
import { SemaforoBadge } from "./semaforo-badge";

const ENTIDADES: Record<string, string> = {
  secretaria_salud: "Secretaría de salud",
  supersalud: "Superintendencia Nacional de Salud",
  minsalud: "Ministerio de Salud",
  ins: "Instituto Nacional de Salud",
  propia: "Tu clínica",
};

export type PermisosOcurrencia = { presentar: boolean; anular: boolean };

// Detalle de una fecha límite (HU-5.3): qué es, ante quién, dónde se
// presenta, el aviso de día no hábil (D5: la fecha no se corre) y las
// acciones. EWAH no radica: guarda la fecha, el radicado y el acuse.
export function OcurrenciaDialog({
  ocurrencia: o,
  obligacion: c,
  porConfirmar,
  permisos,
  onCerrar,
}: {
  ocurrencia: Ocurrencia;
  obligacion: ObligacionCatalogo;
  porConfirmar: boolean;
  permisos: PermisosOcurrencia;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"ver" | "presentar" | "no_aplica" | "anular">("ver");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [texto, setTexto] = useState("");
  const hoy = dateLocalHoy();
  const e = estadoOcurrencia(o, hoy, porConfirmar);

  async function ejecutar(f: () => Promise<{ error?: string }>, exito: string) {
    setPendiente(true);
    setError(null);
    try {
      const r = await f();
      if (r.error) return setError(r.error);
      toast.add({ title: exito, type: "success" });
      router.refresh();
      onCerrar();
    } finally {
      setPendiente(false);
    }
  }

  async function presentar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    await ejecutar(async () => {
      let storagePath: string | null = null;
      let nombreArchivo: string | null = null;
      const archivo = fd.get("archivo");
      if (archivo instanceof File && archivo.size > 0) {
        const subido = await subirArchivoHabilitacion(archivo, "obligaciones", o.id);
        if ("error" in subido) return { error: subido.error };
        storagePath = subido.path;
        nombreArchivo = subido.nombre;
      }
      return presentarOcurrencia({
        id: o.id,
        fechaPresentacion: String(fd.get("fecha") ?? ""),
        radicado: String(fd.get("radicado") ?? ""),
        observacion: String(fd.get("observacion") ?? ""),
        storagePath,
        nombreArchivo,
      });
    }, "Presentación registrada");
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {c.nombre} <SemaforoBadge semaforo={e.semaforo} etiqueta={e.etiqueta} />
          </DialogTitle>
          <DialogDescription>{c.descripcion_corta}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Fecha límite</dt>
          <dd className="font-medium">
            {fechaLegible(o.fecha_limite)}
            {o.etiqueta_periodo ? <span className="font-normal text-muted-foreground"> · {o.etiqueta_periodo}</span> : null}
          </dd>
          {o.dia_no_habil && o.estado === "pendiente" ? (
            <dd className="sm:col-start-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                <CalendarXIcon className="size-3.5" aria-hidden /> Cae en día no hábil: preséntalo antes (la norma no corre la fecha).
              </span>
            </dd>
          ) : null}
          <dt className="text-muted-foreground">Ante quién</dt>
          <dd>{ENTIDADES[c.entidad] ?? c.entidad}</dd>
          {c.plataforma_nombre ? (
            <>
              <dt className="text-muted-foreground">Dónde</dt>
              <dd>
                {c.plataforma_url ? (
                  <a href={c.plataforma_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    {c.plataforma_nombre} <ExternalLinkIcon className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  c.plataforma_nombre
                )}
              </dd>
            </>
          ) : null}
          {c.norma_nombre ? (
            <>
              <dt className="text-muted-foreground">Norma</dt>
              <dd>
                {c.norma_url ? (
                  <a href={c.norma_url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                    {[c.norma_nombre, c.norma_articulo].filter(Boolean).join(", ")}
                  </a>
                ) : (
                  [c.norma_nombre, c.norma_articulo].filter(Boolean).join(", ")
                )}
                {c.url_instructivo ? (
                  <>
                    {" · "}
                    <a href={c.url_instructivo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                      <FileTextIcon className="size-3.5" aria-hidden /> instructivo
                    </a>
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
          {o.estado === "presentado" ? (
            <>
              <dt className="text-muted-foreground">Presentada</dt>
              <dd>
                {fechaLegible(o.fecha_presentacion)}
                {o.radicado ? ` · radicado ${o.radicado}` : ""}
                {o.nombre_archivo ? (
                  <button
                    type="button"
                    onClick={() => abrirFirmado(() => urlAcuse(o.id))}
                    className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <DownloadIcon className="size-3.5" /> {o.nombre_archivo}
                  </button>
                ) : null}
              </dd>
            </>
          ) : null}
          {o.estado === "no_aplica_periodo" && o.justificacion ? (
            <>
              <dt className="text-muted-foreground">No aplica porque</dt>
              <dd>{o.justificacion}</dd>
            </>
          ) : null}
        </dl>

        {porConfirmar ? (
          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            Esta obligación está «por confirmar» con tu asesor: no te avisamos en rojo hasta que la confirmes en Obligaciones.
          </p>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {modo === "presentar" ? (
          <form onSubmit={presentar} className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fecha-pres">Fecha en que la presentaste</Label>
                <Input id="fecha-pres" name="fecha" type="date" defaultValue={hoy} max={hoy} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="radicado">Número de radicado</Label>
                <Input id="radicado" name="radicado" maxLength={100} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="acuse">Acuse o certificado de envío</Label>
              <FileInput id="acuse" name="archivo" accept={ACCEPT_ARCHIVO} />
              <p className="text-xs text-muted-foreground">Escribe el radicado o adjunta el acuse: sin prueba no queda como presentada.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-pres">Observación (opcional)</Label>
              <Textarea id="obs-pres" name="observacion" rows={2} maxLength={4000} />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setModo("ver")} disabled={pendiente}>
                Volver
              </Button>
              <Button type="submit" disabled={pendiente}>
                {pendiente ? "Guardando…" : "Marcar como presentada"}
              </Button>
            </div>
          </form>
        ) : null}

        {modo === "no_aplica" || modo === "anular" ? (
          <form
            className="space-y-3 rounded-lg border p-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (modo === "no_aplica") void ejecutar(() => noAplicaPeriodo(o.id, texto), "Guardado");
              else void ejecutar(() => anularOcurrencia(o.id, texto), o.estado === "presentado" ? "Anulada: registra la presentación correcta" : "Anulada");
            }}
          >
            <Label htmlFor="motivo-oc">{modo === "no_aplica" ? "¿Por qué no aplica en este periodo?" : "¿Por qué la anulas?"}</Label>
            <Textarea id="motivo-oc" rows={2} value={texto} onChange={(ev) => setTexto(ev.target.value)} maxLength={2000} autoFocus />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setModo("ver")} disabled={pendiente}>
                Volver
              </Button>
              <Button type="submit" variant={modo === "anular" ? "destructive" : "default"} disabled={pendiente || texto.trim().length < 10}>
                {modo === "no_aplica" ? "Guardar" : "Anular"}
              </Button>
            </div>
          </form>
        ) : null}

        {modo === "ver" ? (
          <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end")}>
            {permisos.anular && o.estado !== "pendiente" ? (
              <Button variant="ghost" onClick={() => setModo("anular")}>
                Anular y corregir
              </Button>
            ) : null}
            {permisos.anular && o.estado === "pendiente" && !["calendario", "vencimiento_reps", "grupo_supersalud"].includes(o.origen) ? (
              <Button variant="ghost" onClick={() => setModo("anular")}>
                Anular
              </Button>
            ) : null}
            {permisos.presentar && o.estado === "pendiente" ? (
              <>
                <Button variant="outline" onClick={() => setModo("no_aplica")}>
                  No aplica en este periodo
                </Button>
                <Button onClick={() => setModo("presentar")}>Marcar como presentada</Button>
              </>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
