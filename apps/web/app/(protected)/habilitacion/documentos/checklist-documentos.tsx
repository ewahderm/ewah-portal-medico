"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  DownloadIcon,
  FilePlusIcon,
  HistoryIcon,
  LockIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import {
  asegurarRenglon,
  crearDocumentoAdicional,
  marcarNoAplicaDocumento,
  quitarNoAplicaDocumento,
  registrarVersionDocumento,
  urlVersionDocumento,
} from "@/lib/habilitacion/documentos";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { tamanoLegible } from "@/lib/habilitacion/archivos";
import { ACCEPT_ARCHIVO, FORMATOS_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import type { ItemChecklist } from "@/lib/habilitacion/checklist";
import type { EstadoDocumento } from "@/lib/habilitacion/estado-documento";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { abrirFirmado } from "../_components/abrir-firmado";

const ESTILO: Record<EstadoDocumento["estado"], { etiqueta: string; icono: LucideIcon; clase: string }> = {
  pendiente: { etiqueta: "Pendiente", icono: CircleIcon, clase: "border-foreground/30 bg-background text-foreground" },
  cargado: { etiqueta: "Cargado", icono: CheckIcon, clase: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  por_vencer: { etiqueta: "Revisar", icono: ClockIcon, clase: "border-amber-300 bg-amber-50 text-amber-800" },
  vencido: { etiqueta: "Vencido", icono: XIcon, clase: "border-destructive/30 bg-destructive/10 text-destructive" },
  no_aplica: { etiqueta: "No aplica", icono: BanIcon, clase: "border-border bg-muted text-muted-foreground" },
};

type Dialogo =
  | { tipo: "subir"; item: ItemChecklist }
  | { tipo: "no_aplica"; item: ItemChecklist }
  | { tipo: "versiones"; item: ItemChecklist }
  | { tipo: "adicional" };

export function ChecklistDocumentos({
  items,
  sedes,
  nombres,
  puedeCrear,
  puedeEditar,
}: {
  items: ItemChecklist[];
  sedes: { id: string; nombre: string }[];
  nombres: Record<string, string>;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const exigidos = items.filter((i) => i.aplica === "si" || i.aplica === "por_confirmar");
  const radicar = exigidos.filter((i) => i.catalogo?.seccion === "radicar");
  const visita = exigidos.filter((i) => i.catalogo?.seccion === "evidencia_visita");
  const adicionales = items.filter((i) => i.aplica === "adicional");
  const yaNoAplican = items.filter((i) => i.aplica === "ya_no_aplica");

  // Para radicar: primero lo de toda la clínica, luego por sede y por servicio.
  const grupos = new Map<string, ItemChecklist[]>();
  for (const i of radicar) {
    const g = i.servicio ? "Declaración de autoevaluación (una por servicio)" : i.sede ? `Sede ${i.sede.nombre}` : "De toda la clínica";
    grupos.set(g, [...(grupos.get(g) ?? []), i]);
  }

  const props = { puedeCrear, puedeEditar, onAccion: setDialogo };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Documentos para radicar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lo que pide la Resolución 3100 a tu tipo de prestador, tus sedes y tus servicios. Cada archivo nuevo se guarda como
            una versión: las anteriores no se borran.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {[...grupos.entries()].map(([g, lista]) => (
            <section key={g} className="space-y-2" aria-label={g}>
              <h3 className="text-sm font-semibold text-muted-foreground">{g}</h3>
              <ul className="space-y-2">
                {lista.map((i) => (
                  <Renglon key={i.clave} item={i} nombres={nombres} {...props} />
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>

      {visita.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Para tener listos en la visita</CardTitle>
            <p className="text-sm text-muted-foreground">No se radican, pero te los pueden pedir en la visita de verificación.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {visita.map((i) => (
                <Renglon key={i.clave} item={i} nombres={nombres} {...props} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">Documentos adicionales</CardTitle>
            <p className="text-sm text-muted-foreground">Lo que te pida tu secretaría y no esté en la lista.</p>
          </div>
          {puedeCrear ? (
            <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: "adicional" })}>
              <FilePlusIcon /> Agregar
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {adicionales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin documentos adicionales.</p>
          ) : (
            <ul className="space-y-2">
              {adicionales.map((i) => (
                <Renglon key={i.clave} item={i} nombres={nombres} {...props} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {yaNoAplican.length > 0 ? (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {yaNoAplican.length} documento(s) que ya no aplican a tu perfil (se conservan)
          </summary>
          <ul className="mt-3 space-y-2">
            {yaNoAplican.map((i) => (
              <Renglon key={i.clave} item={i} nombres={nombres} {...props} puedeCrear={false} puedeEditar={false} />
            ))}
          </ul>
        </details>
      ) : null}

      {dialogo?.tipo === "subir" ? <SubirDialog item={dialogo.item} onCerrar={() => setDialogo(null)} /> : null}
      {dialogo?.tipo === "no_aplica" ? <NoAplicaDialog item={dialogo.item} onCerrar={() => setDialogo(null)} /> : null}
      {dialogo?.tipo === "versiones" ? <VersionesDialog item={dialogo.item} nombres={nombres} onCerrar={() => setDialogo(null)} /> : null}
      {dialogo?.tipo === "adicional" ? (
        <AdicionalDialog
          sedes={sedes}
          onCerrar={() => setDialogo(null)}
          onCreado={(item) => setDialogo({ tipo: "subir", item })}
        />
      ) : null}
    </div>
  );
}

function Renglon({
  item: i,
  nombres,
  puedeCrear,
  puedeEditar,
  onAccion,
}: {
  item: ItemChecklist;
  nombres: Record<string, string>;
  puedeCrear: boolean;
  puedeEditar: boolean;
  onAccion: (d: Dialogo) => void;
}) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const e = ESTILO[i.estado.estado];
  const Icono = e.icono;
  const noAplica = i.renglon?.no_aplica ?? false;
  const versiones = i.renglon?.versiones ?? [];
  const financiero = i.catalogo?.es_financiero ?? false;

  async function quitarNoAplica() {
    if (!i.renglon) return;
    setPendiente(true);
    const r = await quitarNoAplicaDocumento(i.renglon.id);
    setPendiente(false);
    if (r.error) toast.add({ title: "No se guardó", description: r.error, type: "error" });
    else router.refresh();
  }

  return (
    <li className={cn("space-y-2 rounded-lg border p-3", i.estado.estado === "vencido" && "border-destructive/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{i.nombre}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", e.clase)}>
          <Icono className="size-3" aria-hidden /> {e.etiqueta}
        </span>
        {i.aplica === "por_confirmar" ? (
          <Badge variant="outline" className="gap-1 border-dashed">
            <TriangleAlertIcon className="size-3" /> Por confirmar
          </Badge>
        ) : null}
        {financiero ? (
          <Badge variant="outline" className="gap-1">
            <LockIcon className="size-3" /> Financiero
          </Badge>
        ) : null}
        {i.catalogo && !i.catalogo.obligatorio ? <Badge variant="secondary">Según el caso</Badge> : null}
      </div>
      {i.catalogo?.explicacion_sencilla ? <p className="text-sm text-muted-foreground">{i.catalogo.explicacion_sencilla}</p> : null}
      {i.motivo ? <p className="text-xs text-amber-800">{i.motivo}</p> : null}
      <p className={cn("text-xs", i.estado.estado === "vencido" ? "text-destructive" : "text-muted-foreground")}>{i.estado.detalle}</p>
      {i.vigente ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => abrirFirmado(() => urlVersionDocumento(i.vigente!.id))}
            className="inline-flex max-w-full items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            <DownloadIcon className="size-3.5 shrink-0" />
            <span className="truncate">{i.vigente.nombre_archivo}</span>
          </button>
          <span>
            v{i.vigente.version} · {tamanoLegible(i.vigente.tamano_bytes)}
            {i.vigente.fecha_expedicion ? ` · expedido ${fechaLegible(i.vigente.fecha_expedicion)}` : ""}
            {i.vigente.fecha_vencimiento ? ` · vence ${fechaLegible(i.vigente.fecha_vencimiento)}` : ""}
            {i.vigente.created_by && nombres[i.vigente.created_by] ? ` · ${nombres[i.vigente.created_by]}` : ""}
          </span>
        </div>
      ) : null}
      {i.catalogo ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Qué dice la norma</summary>
          <p className="mt-1 whitespace-pre-line">{i.catalogo.descripcion_literal}</p>
          {i.catalogo.condicion_texto ? <p className="mt-1 italic">Aplica: {i.catalogo.condicion_texto}</p> : null}
          <p className="mt-1 text-muted-foreground">
            {[i.catalogo.fuente_norma, i.catalogo.fuente_articulo, i.catalogo.fuente_pagina ? `pág. ${i.catalogo.fuente_pagina}` : null]
              .filter(Boolean)
              .join(" · ")}
            {i.catalogo.fuente_url ? (
              <>
                {" · "}
                <a href={i.catalogo.fuente_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  fuente
                </a>
              </>
            ) : null}
          </p>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {puedeCrear && !noAplica ? (
          <Button size="sm" variant={i.vigente ? "outline" : "default"} onClick={() => onAccion({ tipo: "subir", item: i })}>
            <UploadIcon /> {i.vigente ? "Subir versión nueva" : "Subir archivo"}
          </Button>
        ) : null}
        {versiones.length > 1 ? (
          <Button size="sm" variant="ghost" onClick={() => onAccion({ tipo: "versiones", item: i })}>
            <HistoryIcon /> {versiones.length} versiones
          </Button>
        ) : null}
        {puedeEditar && i.catalogo && !noAplica && i.aplica !== "ya_no_aplica" ? (
          <Button size="sm" variant="ghost" onClick={() => onAccion({ tipo: "no_aplica", item: i })}>
            <BanIcon /> No aplica
          </Button>
        ) : null}
        {puedeEditar && noAplica ? (
          <Button size="sm" variant="ghost" onClick={quitarNoAplica} disabled={pendiente}>
            Quitar «No aplica»
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function claveDe(i: ItemChecklist) {
  return { catalogoId: i.catalogo!.id, sedeId: i.sede?.id ?? null, servicioId: i.servicio?.id ?? null };
}

function SubirDialog({ item: i, onCerrar }: { item: ItemChecklist; onCerrar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const pideExpedicion = i.catalogo?.regla_vigencia === "max_30_dias_radicacion";
  const pideVencimiento = i.catalogo?.tiene_vencimiento ?? true;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return setError("Selecciona un archivo.");
    setPendiente(true);
    setError(null);
    try {
      let documentoId = i.renglon?.id ?? null;
      if (!documentoId) {
        const r = await asegurarRenglon(claveDe(i));
        if (r.error || !r.id) return setError(r.error ?? "No se pudo preparar el documento.");
        documentoId = r.id;
      }
      const subido = await subirArchivoHabilitacion(archivo, "documentos", documentoId);
      if ("error" in subido) return setError(subido.error);
      const r = await registrarVersionDocumento({
        documentoId,
        storagePath: subido.path,
        nombreArchivo: subido.nombre,
        fechaExpedicion: String(fd.get("fechaExpedicion") ?? "") || null,
        fechaVencimiento: String(fd.get("fechaVencimiento") ?? "") || null,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: i.vigente ? "Versión nueva guardada" : "Documento cargado", description: i.nombre, type: "success" });
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
          <DialogTitle>{i.vigente ? "Versión nueva de" : "Subir"} {i.nombre}</DialogTitle>
          <DialogDescription>
            {i.sede ? `Sede ${i.sede.nombre}. ` : ""}
            {i.servicio ? `Servicio ${i.servicio.nombre}. ` : ""}
            {i.vigente ? `La versión ${i.vigente.version} se conserva en el historial.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="archivo-doc">Archivo</Label>
            <FileInput id="archivo-doc" name="archivo" accept={ACCEPT_ARCHIVO} required />
            <p className="text-xs text-muted-foreground">{FORMATOS_ARCHIVO}. Máximo 10 MB.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fechaExpedicion">Fecha de expedición{pideExpedicion ? "" : " (opcional)"}</Label>
              <Input id="fechaExpedicion" name="fechaExpedicion" type="date" required={pideExpedicion} />
            </div>
            {pideVencimiento ? (
              <div className="space-y-1">
                <Label htmlFor="fechaVencimiento">Fecha de vencimiento (opcional)</Label>
                <Input id="fechaVencimiento" name="fechaVencimiento" type="date" />
              </div>
            ) : null}
          </div>
          {pideExpedicion ? (
            <p className="text-xs text-muted-foreground">Este certificado no puede tener más de 30 días el día que radicas.</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Subiendo…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoAplicaDialog({ item: i, onCerrar }: { item: ItemChecklist; onCerrar: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setPendiente(true);
    const r = await marcarNoAplicaDocumento(claveDe(i), texto);
    setPendiente(false);
    if (r.error) return setError(r.error);
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Por qué no aplica «{i.nombre}»?</DialogTitle>
          <DialogDescription>Queda registrado con tu nombre. Si cambia tu situación, quita la marca y súbelo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} aria-label="Justificación" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || texto.trim().length < 10}>
              Marcar «No aplica»
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VersionesDialog({ item: i, nombres, onCerrar }: { item: ItemChecklist; nombres: Record<string, string>; onCerrar: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Versiones de {i.nombre}</DialogTitle>
          <DialogDescription>Las versiones no se modifican ni se borran: así puedes demostrar qué estaba vigente en cada fecha.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2">
          {(i.renglon?.versiones ?? []).map((v) => (
            <li key={v.id} className="rounded-lg border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={v.id === i.vigente?.id ? "default" : "outline"}>v{v.version}</Badge>
                <button
                  type="button"
                  onClick={() => abrirFirmado(() => urlVersionDocumento(v.id))}
                  className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  <DownloadIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{v.nombre_archivo}</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cargada el {fechaLegible(v.created_at)}
                {v.created_by && nombres[v.created_by] ? ` por ${nombres[v.created_by]}` : ""}
                {v.fecha_vencimiento ? ` · vence ${fechaLegible(v.fecha_vencimiento)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function AdicionalDialog({
  sedes,
  onCerrar,
  onCreado,
}: {
  sedes: { id: string; nombre: string }[];
  onCerrar: () => void;
  onCreado: (item: ItemChecklist) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [sede, setSede] = useState<string>(SIN_SELECCION);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setPendiente(true);
    const sedeId = sede === SIN_SELECCION ? null : sede;
    const r = await crearDocumentoAdicional(nombre, sedeId);
    setPendiente(false);
    if (r.error || !r.id) return setError(r.error ?? "No se pudo crear.");
    onCreado({
      clave: `adicional|${r.id}`,
      catalogo: null,
      nombre: nombre.trim(),
      sede: sedeId ? { id: sedeId, nombre: sedes.find((s) => s.id === sedeId)?.nombre ?? "" } : null,
      servicio: null,
      aplica: "adicional",
      motivo: null,
      renglon: { id: r.id, documento_catalogo_id: null, nombre_adicional: nombre.trim(), sede_id: sedeId, servicio_habilitado_id: null, no_aplica: false, no_aplica_justificacion: null, observaciones: null, versiones: [] },
      vigente: null,
      estado: { estado: "pendiente", detalle: "Falta cargarlo." },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Documento adicional</DialogTitle>
        </DialogHeader>
        <form onSubmit={crear} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="nombre-adicional">Nombre</Label>
            <Input id="nombre-adicional" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sede-adicional">Sede (opcional)</Label>
            <Combobox
              id="sede-adicional"
              items={[{ value: SIN_SELECCION, label: "Toda la clínica" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
              value={sede}
              onValueChange={(v) => setSede(v ?? SIN_SELECCION)}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || nombre.trim().length < 3}>
              Crear y subir el archivo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
