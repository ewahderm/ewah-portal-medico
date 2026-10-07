"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, DownloadIcon, PlusIcon } from "lucide-react";
import { anularHito, registrarHito, urlHito } from "@/lib/habilitacion/documentos";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { ACCEPT_ARCHIVO, TIPOS_HITO, etiquetaDe } from "@/lib/habilitacion/constantes";
import { fechaLegible, sugerirVencimientoReps } from "@/lib/habilitacion/ruta";
import type { HitoTramite } from "@/lib/habilitacion/tipos";
import { dateLocalHoy } from "@/lib/medio-ambiente/fecha-local";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { abrirFirmado } from "../_components/abrir-firmado";

// HU-3.4: línea de tiempo del trámite. Los eventos no se editan: se anulan
// con un motivo y se registran de nuevo.
export function Tramite({
  hitos,
  nombres,
  puedeCrear,
  puedeAnular,
  estadoReps,
}: {
  hitos: HitoTramite[];
  nombres: Record<string, string>;
  puedeCrear: boolean;
  puedeAnular: boolean;
  estadoReps: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base font-semibold">Trámite ante la secretaría</CardTitle>
          <p className="text-sm text-muted-foreground">
            Registra cada paso: radicado, visita, subsanación, constancia. Una visita con incumplimientos subsanables te deja la
            fecha límite (8 días hábiles) en el calendario.
          </p>
        </div>
        {puedeCrear ? (
          <Button size="sm" onClick={() => setAbierto(true)}>
            <PlusIcon /> Registrar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {hitos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {estadoReps === "inscrito" ? "Ya estás inscrito; registra aquí las visitas que te hagan." : "Todavía no has registrado ningún paso del trámite."}
          </p>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {hitos.map((h) => (
              <HitoItem key={h.id} hito={h} autor={h.created_by ? nombres[h.created_by] : undefined} puedeAnular={puedeAnular} />
            ))}
          </ol>
        )}
      </CardContent>
      {abierto ? <HitoDialog onCerrar={() => setAbierto(false)} /> : null}
    </Card>
  );
}

function HitoItem({ hito: h, autor, puedeAnular }: { hito: HitoTramite; autor?: string; puedeAnular: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, setPendiente] = useState(false);

  async function anular() {
    setPendiente(true);
    const r = await anularHito(h.id, motivo);
    setPendiente(false);
    if (r.error) toast.add({ title: "No se anuló", description: r.error, type: "error" });
    else router.refresh();
  }

  return (
    <li className="relative">
      <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
      <div className={h.anulado ? "opacity-60" : undefined}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={h.anulado ? "font-medium line-through" : "font-medium"}>{etiquetaDe(TIPOS_HITO, h.tipo)}</span>
          <span className="text-muted-foreground">{fechaLegible(h.fecha)}</span>
          {h.numero ? <Badge variant="outline">N.º {h.numero}</Badge> : null}
          {h.anulado ? <Badge variant="secondary">Anulado</Badge> : null}
        </div>
        {h.subsanar_hasta && !h.anulado ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-800">
            <CalendarClockIcon className="size-3.5" /> Subsanar a más tardar el {fechaLegible(h.subsanar_hasta)} (8 días hábiles)
          </p>
        ) : null}
        {h.observacion ? <p className="mt-1 text-xs text-muted-foreground">{h.observacion}</p> : null}
        {h.anulado && h.anulado_motivo ? <p className="mt-1 text-xs text-muted-foreground">Anulado: {h.anulado_motivo}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {h.nombre_archivo ? (
            <button
              type="button"
              onClick={() => abrirFirmado(() => urlHito(h.id))}
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <DownloadIcon className="size-3.5" /> {h.nombre_archivo}
            </button>
          ) : null}
          {autor ? <span>{autor}</span> : null}
          {puedeAnular && !h.anulado && !anulando ? (
            <button type="button" className="underline underline-offset-4" onClick={() => setAnulando(true)}>
              Anular
            </button>
          ) : null}
        </div>
        {anulando ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo de anulación" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAnulando(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <Button size="sm" variant="destructive" onClick={anular} disabled={pendiente || motivo.trim().length < 10}>
                Anular
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function HitoDialog({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("radicado");
  const [fecha, setFecha] = useState(dateLocalHoy());
  const [subsanables, setSubsanables] = useState(false);
  const [vencimiento, setVencimiento] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPendiente(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      let storagePath: string | null = null;
      let nombreArchivo: string | null = null;
      const archivo = fd.get("archivo");
      if (archivo instanceof File && archivo.size > 0) {
        const subido = await subirArchivoHabilitacion(archivo, "tramite", id);
        if ("error" in subido) return setError(subido.error);
        storagePath = subido.path;
        nombreArchivo = subido.nombre;
      }
      const r = await registrarHito({
        id,
        tipo,
        fecha,
        numero: String(fd.get("numero") ?? ""),
        observacion: String(fd.get("observacion") ?? ""),
        haySubsanables: subsanables,
        storagePath,
        nombreArchivo,
        fechaVencimientoReps: tipo === "constancia_expedida" ? vencimiento || null : null,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: "Paso del trámite registrado", type: "success" });
      router.refresh();
      onCerrar();
    } finally {
      setPendiente(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar un paso del trámite</DialogTitle>
          <DialogDescription>EWAH no radica nada ante el Estado: aquí guardas la fecha, el número y el soporte.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tipo-hito">Qué pasó</Label>
              <Combobox
                id="tipo-hito"
                items={TIPOS_HITO.map((t) => ({ value: t.value, label: t.label }))}
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v ?? "radicado");
                  if (v === "constancia_expedida" && fecha && !vencimiento) setVencimiento(sugerirVencimientoReps(fecha));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fecha-hito">Fecha</Label>
              <Input
                id="fecha-hito"
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  if (tipo === "constancia_expedida" && e.target.value) setVencimiento(sugerirVencimientoReps(e.target.value));
                }}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="numero">Número de radicado, código o acta (opcional)</Label>
            <Input id="numero" name="numero" maxLength={100} />
          </div>
          {tipo === "visita_realizada" ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={subsanables} onCheckedChange={(v) => setSubsanables(!!v)} />
              <span>El acta dejó incumplimientos subsanables (tienes 8 días hábiles para subsanar).</span>
            </label>
          ) : null}
          {tipo === "constancia_expedida" ? (
            <div className="space-y-1">
              <Label htmlFor="vencimiento-reps">¿Hasta cuándo es válida tu inscripción?</Label>
              <Input id="vencimiento-reps" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Te sugerimos 4 años desde la constancia; copia la fecha exacta del REPS.</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="observacion-hito">Observación (opcional)</Label>
            <Textarea id="observacion-hito" name="observacion" rows={2} maxLength={4000} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="archivo-hito">Soporte (opcional)</Label>
            <FileInput id="archivo-hito" name="archivo" accept={ACCEPT_ARCHIVO} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
