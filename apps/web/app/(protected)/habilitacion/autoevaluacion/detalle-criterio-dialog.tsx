"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, ExternalLinkIcon, FileIcon, LinkIcon, PlusIcon, StickyNoteIcon } from "lucide-react";
import {
  actualizarPlanMejora,
  asignarResponsable,
  obtenerDetalleCriterio,
  retirarEvidencia,
  urlCierrePlan,
  urlEvidencia,
} from "@/lib/habilitacion/autoevaluacion";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { tamanoLegible } from "@/lib/habilitacion/archivos";
import {
  ACCEPT_ARCHIVO,
  ESTADOS_PLAN_MEJORA,
  MIN_MOTIVO_RETIRO,
  etiquetaDe,
} from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { dateLocalHoy } from "@/lib/medio-ambiente/fecha-local";
import type { DetalleCriterio, Evidencia, FilaCriterio, PlanMejora, UsuarioClinica } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoChip } from "./criterio-card";

const SIN_RESPONSABLE = "__sin_responsable__";

function fechaHora(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(
    new Date(iso),
  );
}

async function abrirEnlaceFirmado(pedir: () => Promise<{ error?: string; url?: string }>) {
  const r = await pedir();
  if (r.error || !r.url) {
    toast.add({ title: "No se pudo abrir el archivo", description: r.error, type: "error" });
    return;
  }
  window.open(r.url, "_blank", "noopener,noreferrer");
}

export function DetalleCriterioDialog({
  sedeId,
  fila,
  usuarios,
  puedeEditar,
  onCerrar,
  onAgregarEvidencia,
  onNuevoPlan,
}: {
  sedeId: string;
  fila: FilaCriterio;
  usuarios: UsuarioClinica[];
  puedeEditar: boolean;
  onCerrar: () => void;
  onAgregarEvidencia: () => void;
  onNuevoPlan: (evaluacionId: string) => void;
}) {
  const router = useRouter();
  const [detalle, setDetalle] = useState<DetalleCriterio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombre = useCallback((id: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? "Usuario", [usuarios]);

  const cargar = useCallback(async () => {
    const r = await obtenerDetalleCriterio(sedeId, fila.criterio_id);
    if (r.error) setError(r.error);
    else setDetalle(r.detalle ?? null);
  }, [sedeId, fila.criterio_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir el diálogo
    void cargar();
  }, [cargar]);

  const recargar = useCallback(() => {
    void cargar();
    router.refresh();
  }, [cargar, router]);

  const activas = detalle?.evidencias.filter((e) => !e.retirada_en) ?? [];
  const retiradas = detalle?.evidencias.filter((e) => e.retirada_en) ?? [];
  const hayPlanAbierto = detalle?.planes.some((p) => p.estado !== "cerrada") ?? false;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="md:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {fila.codigo} <EstadoChip estado={fila.estado ?? "pendiente"} />
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">{fila.texto_literal}</DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {puedeEditar ? <Asignacion sedeId={sedeId} fila={fila} usuarios={usuarios} onGuardado={recargar} /> : null}

        <Separator />

        <section className="space-y-2" aria-labelledby="titulo-evidencias">
          <div className="flex items-center justify-between gap-2">
            <h3 id="titulo-evidencias" className="text-sm font-semibold">
              Evidencias {detalle ? `(${activas.length})` : ""}
            </h3>
            {puedeEditar ? (
              <Button size="sm" variant="outline" onClick={onAgregarEvidencia}>
                <PlusIcon /> Agregar evidencia
              </Button>
            ) : null}
          </div>
          {!detalle ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : activas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Sin evidencias. Para marcar «Cumple» necesitas al menos una.
            </p>
          ) : (
            <ul className="space-y-2">
              {activas.map((e) => (
                <EvidenciaItem key={e.id} evidencia={e} autor={nombre(e.created_by)} puedeEditar={puedeEditar} onRetirada={recargar} />
              ))}
            </ul>
          )}
          {retiradas.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {retiradas.length} evidencia{retiradas.length === 1 ? "" : "s"} retirada{retiradas.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-2 opacity-70">
                {retiradas.map((e) => (
                  <EvidenciaItem key={e.id} evidencia={e} autor={nombre(e.created_by)} puedeEditar={false} onRetirada={recargar} />
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <Separator />

        <section className="space-y-2" aria-labelledby="titulo-planes">
          <div className="flex items-center justify-between gap-2">
            <h3 id="titulo-planes" className="text-sm font-semibold">
              Planes de mejora
            </h3>
            {puedeEditar && fila.estado === "no_cumple" && fila.evaluacion_id && detalle && !hayPlanAbierto ? (
              <Button size="sm" variant="outline" onClick={() => onNuevoPlan(fila.evaluacion_id!)}>
                <PlusIcon /> Crear plan
              </Button>
            ) : null}
          </div>
          {detalle && detalle.planes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {fila.estado === "no_cumple" ? "Este «No cumple» todavía no tiene plan de mejora." : "Sin planes de mejora."}
            </p>
          ) : null}
          <ul className="space-y-2">
            {detalle?.planes.map((p) => (
              <PlanItem key={p.id} plan={p} responsable={nombre(p.responsable_id)} puedeEditar={puedeEditar} onCambio={recargar} />
            ))}
          </ul>
        </section>

        <Separator />

        <section className="space-y-2" aria-labelledby="titulo-historial">
          <h3 id="titulo-historial" className="text-sm font-semibold">
            Historial de evaluaciones
          </h3>
          {detalle && detalle.historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se ha evaluado.</p>
          ) : null}
          <ol className="space-y-2">
            {detalle?.historial.map((h) => (
              <li key={h.id} className="rounded-lg border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <EstadoChip estado={h.estado} />
                  <span className="text-xs text-muted-foreground">
                    {nombre(h.evaluado_por)} · {fechaHora(h.created_at)}
                  </span>
                </div>
                {h.justificacion ? <p className="mt-1 text-xs">No aplica porque: {h.justificacion}</p> : null}
                {h.observacion ? <p className="mt-1 text-xs text-muted-foreground">{h.observacion}</p> : null}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">El historial no se edita ni se borra: cada cambio queda registrado.</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Asignacion({
  sedeId,
  fila,
  usuarios,
  onGuardado,
}: {
  sedeId: string;
  fila: FilaCriterio;
  usuarios: UsuarioClinica[];
  onGuardado: () => void;
}) {
  const [responsable, setResponsable] = useState(fila.responsable_id ?? SIN_RESPONSABLE);
  const [fecha, setFecha] = useState(fila.fecha_objetivo ?? "");
  const [pendiente, setPendiente] = useState(false);
  const cambiado = responsable !== (fila.responsable_id ?? SIN_RESPONSABLE) || fecha !== (fila.fecha_objetivo ?? "");

  async function guardar() {
    setPendiente(true);
    const r = await asignarResponsable({
      sedeId,
      criterioId: fila.criterio_id,
      responsableId: responsable === SIN_RESPONSABLE ? null : responsable,
      fechaObjetivo: fecha || null,
    });
    setPendiente(false);
    if (r.error) toast.add({ title: "No se guardó la asignación", description: r.error, type: "error" });
    else {
      toast.add({ title: "Asignación guardada", type: "success" });
      onGuardado();
    }
  }

  return (
    <section className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end" aria-label="Responsable y fecha objetivo">
      <div className="space-y-1">
        <Label htmlFor="responsable-criterio">Responsable</Label>
        <Combobox
          id="responsable-criterio"
          items={[{ value: SIN_RESPONSABLE, label: "Sin asignar" }, ...usuarios.map((u) => ({ value: u.id, label: u.nombre }))]}
          value={responsable}
          onValueChange={(v) => setResponsable(v ?? SIN_RESPONSABLE)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="fecha-objetivo">Verificar antes del</Label>
        <Input id="fecha-objetivo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <Button size="sm" onClick={guardar} disabled={!cambiado || pendiente}>
        {pendiente ? "Guardando…" : "Guardar"}
      </Button>
    </section>
  );
}

function EvidenciaItem({
  evidencia: e,
  autor,
  puedeEditar,
  onRetirada,
}: {
  evidencia: Evidencia;
  autor: string;
  puedeEditar: boolean;
  onRetirada: () => void;
}) {
  const [retirando, setRetirando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, setPendiente] = useState(false);
  const Icono = e.tipo === "archivo" ? FileIcon : e.tipo === "enlace" ? LinkIcon : StickyNoteIcon;

  async function retirar() {
    setPendiente(true);
    const r = await retirarEvidencia(e.id, motivo);
    setPendiente(false);
    if (r.error) toast.add({ title: "No se retiró", description: r.error, type: "error" });
    else {
      toast.add({ title: "Evidencia retirada", type: "success" });
      onRetirada();
    }
  }

  return (
    <li className="rounded-lg border p-2 text-sm">
      <div className="flex items-start gap-2">
        <Icono className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="whitespace-pre-line">{e.descripcion}</p>
          {e.tipo === "archivo" && e.nombre_archivo ? (
            <button
              type="button"
              onClick={() => abrirEnlaceFirmado(() => urlEvidencia(e.id))}
              className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              <DownloadIcon className="size-3.5 shrink-0" />
              <span className="truncate">{e.nombre_archivo}</span>
              {e.tamano_bytes ? <span className="shrink-0 text-muted-foreground">({tamanoLegible(e.tamano_bytes)})</span> : null}
            </button>
          ) : null}
          {e.tipo === "enlace" && e.url ? (
            <a
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              <ExternalLinkIcon className="size-3.5 shrink-0" />
              <span className="truncate">{e.url}</span>
            </a>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {autor} · {fechaHora(e.created_at)}
          </p>
          {e.retirada_en ? (
            <p className="text-xs text-muted-foreground">
              Retirada el {fechaHora(e.retirada_en)}: {e.retiro_motivo}
            </p>
          ) : null}
        </div>
        {puedeEditar && !retirando ? (
          <Button size="xs" variant="ghost" onClick={() => setRetirando(true)}>
            Retirar
          </Button>
        ) : null}
      </div>
      {retirando ? (
        <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-2">
          <Label htmlFor={`motivo-${e.id}`} className="text-xs">
            ¿Por qué la retiras? Queda en el historial; el archivo no se borra.
          </Label>
          <Input
            id={`motivo-${e.id}`}
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder="Ej.: Se subió por error a este criterio"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="outline" onClick={() => setRetirando(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button size="xs" variant="destructive" onClick={retirar} disabled={pendiente || motivo.trim().length < MIN_MOTIVO_RETIRO}>
              {pendiente ? "Retirando…" : "Retirar evidencia"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function PlanItem({
  plan: p,
  responsable,
  puedeEditar,
  onCambio,
}: {
  plan: PlanMejora;
  responsable: string;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vencido = p.estado !== "cerrada" && p.fecha_compromiso < dateLocalHoy();

  async function enviar(fd: FormData) {
    setPendiente(true);
    setError(null);
    try {
      const archivo = fd.get("archivo");
      if (archivo instanceof File && archivo.size > 0) {
        const subido = await subirArchivoHabilitacion(archivo, "planes", p.id);
        if ("error" in subido) {
          setError(subido.error);
          return;
        }
        fd.set("storagePath", subido.path);
        fd.set("nombreArchivo", subido.nombre);
      }
      fd.delete("archivo");
      const r = await actualizarPlanMejora(null, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (fd.get("estado") === "cerrada") {
        toast.add({
          title: "Plan cerrado",
          description: "Cerrar el plan no cambia el criterio: vuelve a evaluarlo si ya cumple.",
          type: "success",
        });
        setCerrando(false);
      }
      onCambio();
    } finally {
      setPendiente(false);
    }
  }

  function cambiarEstado(estado: "abierta" | "en_curso") {
    const fd = new FormData();
    fd.set("planId", p.id);
    fd.set("estado", estado);
    void enviar(fd);
  }

  return (
    <li className="space-y-2 rounded-lg border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={p.estado === "cerrada" ? "outline" : "secondary"}>{etiquetaDe(ESTADOS_PLAN_MEJORA, p.estado)}</Badge>
        <span className={vencido ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
          {responsable} · compromiso {fechaLegible(p.fecha_compromiso)}
          {vencido ? " (vencido)" : ""}
        </span>
      </div>
      <p className="whitespace-pre-line">{p.accion}</p>
      {p.estado === "cerrada" ? (
        <div className="text-xs text-muted-foreground">
          Cerrado el {fechaLegible(p.fecha_cierre)}
          {p.cierre_observacion ? `: ${p.cierre_observacion}` : ""}
          {p.cierre_nombre_archivo ? (
            <button
              type="button"
              onClick={() => abrirEnlaceFirmado(() => urlCierrePlan(p.id))}
              className="ml-2 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <DownloadIcon className="size-3.5" /> {p.cierre_nombre_archivo}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {puedeEditar && p.estado !== "cerrada" && !cerrando ? (
        <div className="flex flex-wrap gap-2">
          {p.estado === "abierta" ? (
            <Button size="xs" variant="outline" onClick={() => cambiarEstado("en_curso")} disabled={pendiente}>
              Marcar en curso
            </Button>
          ) : (
            <Button size="xs" variant="outline" onClick={() => cambiarEstado("abierta")} disabled={pendiente}>
              Volver a abierta
            </Button>
          )}
          <Button size="xs" onClick={() => setCerrando(true)} disabled={pendiente}>
            Cerrar plan
          </Button>
        </div>
      ) : null}
      {cerrando ? (
        <form
          className="space-y-2 rounded-md bg-muted/50 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(new FormData(e.currentTarget));
          }}
        >
          <input type="hidden" name="planId" value={p.id} />
          <input type="hidden" name="estado" value="cerrada" />
          <div className="space-y-1">
            <Label htmlFor={`cierre-obs-${p.id}`} className="text-xs">
              ¿Cómo se cerró?
            </Label>
            <Textarea id={`cierre-obs-${p.id}`} name="cierreObservacion" rows={2} placeholder="Ej.: Se recibió y archivó el certificado de calibración." />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`cierre-fecha-${p.id}`} className="text-xs">
                Fecha de cierre
              </Label>
              <Input id={`cierre-fecha-${p.id}`} name="fechaCierre" type="date" required defaultValue={dateLocalHoy()} max={dateLocalHoy()} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cierre-archivo-${p.id}`} className="text-xs">
                Soporte (opcional)
              </Label>
              <FileInput id={`cierre-archivo-${p.id}`} name="archivo" accept={ACCEPT_ARCHIVO} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Un plan cerrado no se modifica. Adjunta el soporte o describe el cierre.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="outline" onClick={() => setCerrando(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" size="xs" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Cerrar plan"}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
