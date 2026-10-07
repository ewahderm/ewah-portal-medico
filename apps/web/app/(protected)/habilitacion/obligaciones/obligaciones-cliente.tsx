"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarIcon, ExternalLinkIcon, PlusIcon, RefreshCwIcon, Settings2Icon, TriangleAlertIcon } from "lucide-react";
import { configurarObligacion, recalcularObligaciones, registrarEnvio } from "@/lib/habilitacion/obligaciones";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible, hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import { estadoOcurrencia, porConfirmar } from "@/lib/habilitacion/semaforo";
import type { ObligacionClinica, Ocurrencia, UsuarioClinica } from "@/lib/habilitacion/tipos";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OcurrenciaDialog, type PermisosOcurrencia } from "../_components/ocurrencia-dialog";
import { SemaforoBadge } from "../_components/semaforo-badge";

const PERIODICIDAD: Record<string, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  eventual: "Cuando ocurre",
  vencimiento_reps: "Al vencer la inscripción",
  manual: "Sin fecha fija",
};
const ENTIDAD: Record<string, string> = {
  secretaria_salud: "Secretaría de salud",
  supersalud: "Supersalud",
  minsalud: "MinSalud",
  ins: "INS",
  propia: "Interna",
};
const SIN_CALENDARIO = new Set(["eventual", "manual"]);

type Permisos = PermisosOcurrencia & { configurar: boolean; recalcular: boolean; registrar: boolean };

export function ObligacionesCliente({
  config,
  ocurrencias,
  usuarios,
  hoy,
  permisos,
  sinGrupo,
}: {
  config: ObligacionClinica[];
  ocurrencias: Ocurrencia[];
  usuarios: UsuarioClinica[];
  hoy: string;
  permisos: Permisos;
  sinGrupo: boolean;
}) {
  const router = useRouter();
  const [recalculando, setRecalculando] = useState(false);
  const [configurando, setConfigurando] = useState<ObligacionClinica | null>(null);
  const [registrando, setRegistrando] = useState<ObligacionClinica | null>(null);
  const [detalle, setDetalle] = useState<{ o: Ocurrencia; c: ObligacionClinica } | null>(null);

  const porObligacion = new Map<string, Ocurrencia[]>();
  for (const o of ocurrencias) porObligacion.set(o.obligacion_id, [...(porObligacion.get(o.obligacion_id) ?? []), o]);

  const activas = config.filter((c) => c.activa).sort((a, b) => a.hab_obligaciones_catalogo.nombre.localeCompare(b.hab_obligaciones_catalogo.nombre, "es"));
  const desactivadas = config.filter((c) => !c.activa && c.aplica_segun_perfil);
  const noAplican = config.filter((c) => !c.activa && !c.aplica_segun_perfil);

  async function recalcular() {
    setRecalculando(true);
    const r = await recalcularObligaciones();
    setRecalculando(false);
    if (r.error) toast.add({ title: "No se recalculó", description: r.error, type: "error" });
    else {
      toast.add({ title: "Fechas recalculadas según tu perfil", type: "success" });
      router.refresh();
    }
  }

  const tarjeta = (c: ObligacionClinica) => {
    const cat = c.hab_obligaciones_catalogo;
    const todas = porObligacion.get(c.obligacion_id) ?? [];
    const pendientes = todas.filter((o) => o.estado === "pendiente");
    // Lo más urgente primero: vencidas, luego la próxima.
    const vencidas = pendientes.filter((o) => o.fecha_limite < hoy);
    const proxima = pendientes.find((o) => o.fecha_limite >= hoy);
    const recientes = todas.filter((o) => o.estado !== "pendiente").slice(-3).reverse();
    const pc = porConfirmar(c);
    return (
      <li key={c.id} className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{cat.nombre}</span>
          <Badge variant="outline">{ENTIDAD[cat.entidad] ?? cat.entidad}</Badge>
          <Badge variant="secondary">{PERIODICIDAD[cat.periodicidad] ?? cat.periodicidad}</Badge>
          {pc ? (
            <Badge variant="outline" className="border-dashed">
              {cat.requiere_confirmacion_asesor ? "Aplica — confirma con tu asesor" : "Por confirmar"}
            </Badge>
          ) : null}
          {c.activa && !c.aplica_segun_perfil ? <Badge variant="outline">Activada por ti</Badge> : null}
          {cat.activacion_default === "informativa" ? <Badge variant="outline">Informativa</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{cat.descripcion_corta}</p>
        {c.justificacion ? <p className="text-xs text-muted-foreground">Decisión: {c.justificacion}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {vencidas.map((o) => (
            <button key={o.id} type="button" onClick={() => setDetalle({ o, c })} className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <SemaforoBadge {...semaforoDe(o, hoy, pc)} />
            </button>
          ))}
          {proxima ? (
            <button type="button" onClick={() => setDetalle({ o: proxima, c })} className="inline-flex items-center gap-2 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <span className="text-muted-foreground">Próxima: {fechaLegible(proxima.fecha_limite)}</span>
              <SemaforoBadge {...semaforoDe(proxima, hoy, pc)} />
            </button>
          ) : null}
          {!proxima && vencidas.length === 0 && !SIN_CALENDARIO.has(cat.periodicidad) ? (
            <span className="text-xs text-muted-foreground">Sin fechas pendientes en los próximos 18 meses.</span>
          ) : null}
        </div>
        {recientes.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Últimas:{" "}
            {recientes.map((o, i) => (
              <span key={o.id}>
                {i > 0 ? " · " : ""}
                <button type="button" className="underline-offset-4 hover:underline" onClick={() => setDetalle({ o, c })}>
                  {fechaLegible(o.fecha_limite)} {estadoOcurrencia(o, hoy).etiqueta.toLowerCase()}
                </button>
              </span>
            ))}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {cat.plataforma_url ? (
            <Button size="sm" variant="ghost" nativeButton={false} render={<a href={cat.plataforma_url} target="_blank" rel="noopener noreferrer" />}>
              {cat.plataforma_nombre ?? "Portal"} <ExternalLinkIcon />
            </Button>
          ) : null}
          {permisos.registrar && SIN_CALENDARIO.has(cat.periodicidad) && c.activa ? (
            <Button size="sm" variant="outline" onClick={() => setRegistrando(c)}>
              <PlusIcon /> Registrar un envío
            </Button>
          ) : null}
          {permisos.configurar ? (
            <Button size="sm" variant="ghost" onClick={() => setConfigurando(c)}>
              <Settings2Icon /> Configurar
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Calculadas según tu perfil y tus servicios. La fecha límite es la que dice la norma: si cae en día no hábil te lo
          advertimos, pero no la corremos.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/habilitacion/calendario" />}>
            <CalendarIcon /> Ver calendario
          </Button>
          {permisos.recalcular ? (
            <Button size="sm" variant="outline" onClick={recalcular} disabled={recalculando}>
              <RefreshCwIcon /> {recalculando ? "Recalculando…" : "Recalcular"}
            </Button>
          ) : null}
        </div>
      </div>

      {sinGrupo ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            Define tu grupo en la Supersalud en{" "}
            <Link href="/habilitacion/perfil" className="underline underline-offset-4">
              Perfil
            </Link>
            : varios reportes dependen de él.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Te aplican ({activas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">{activas.map(tarjeta)}</ul>
        </CardContent>
      </Card>

      {desactivadas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Desactivadas por ti ({desactivadas.length})</CardTitle>
            <p className="text-sm text-muted-foreground">Según tu perfil te aplican; las desactivaste con una justificación.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">{desactivadas.map(tarjeta)}</ul>
          </CardContent>
        </Card>
      ) : null}

      {noAplican.length > 0 ? (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">No te aplican según tu perfil ({noAplican.length})</summary>
          <p className="mt-2 text-xs text-muted-foreground">Si tu asesor te dice que alguna sí te aplica, actívala con una justificación.</p>
          <ul className="mt-3 space-y-2">{noAplican.map(tarjeta)}</ul>
        </details>
      ) : null}

      {configurando ? <ConfigurarDialog c={configurando} usuarios={usuarios} onCerrar={() => setConfigurando(null)} /> : null}
      {registrando ? <RegistrarEnvioDialog c={registrando} onCerrar={() => setRegistrando(null)} /> : null}
      {detalle ? (
        <OcurrenciaDialog
          ocurrencia={detalle.o}
          obligacion={detalle.c.hab_obligaciones_catalogo}
          porConfirmar={porConfirmar(detalle.c)}
          permisos={permisos}
          onCerrar={() => setDetalle(null)}
        />
      ) : null}
    </div>
  );
}

function semaforoDe(o: Ocurrencia, hoy: string, pc: boolean) {
  const e = estadoOcurrencia(o, hoy, pc);
  return { semaforo: e.semaforo, etiqueta: e.etiqueta };
}

function ConfigurarDialog({ c, usuarios, onCerrar }: { c: ObligacionClinica; usuarios: UsuarioClinica[]; onCerrar: () => void }) {
  const router = useRouter();
  const cat = c.hab_obligaciones_catalogo;
  const [activa, setActiva] = useState(c.activa);
  const [confirmada, setConfirmada] = useState(c.confirmada);
  const [justificacion, setJustificacion] = useState(c.justificacion ?? "");
  const [fechaAsesor, setFechaAsesor] = useState(c.fecha_consulta_asesor ?? "");
  const [dias, setDias] = useState((c.dias_aviso ?? cat.dias_aviso_default).join(", "));
  const [responsable, setResponsable] = useState(c.responsable_id ?? SIN_SELECCION);
  const [correo, setCorreo] = useState(c.correo_adicional ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const seAparta = activa !== c.aplica_segun_perfil;
  const pideConfirmar = cat.activacion_default === "por_confirmar" || cat.requiere_confirmacion_asesor;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const lista = dias.split(/[,\s]+/).filter(Boolean).map(Number);
    if (lista.some((n) => !Number.isInteger(n))) return setError("Escribe los días de aviso como números separados por coma.");
    const porDefecto = cat.dias_aviso_default.join(",") === lista.join(",");
    setPendiente(true);
    const r = await configurarObligacion({
      id: c.id,
      activa,
      confirmada,
      justificacion: seAparta ? justificacion : null,
      fechaConsultaAsesor: fechaAsesor || null,
      diasAviso: porDefecto ? null : lista,
      responsableId: responsable === SIN_SELECCION ? null : responsable,
      correoAdicional: correo || null,
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Configuración guardada", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cat.nombre}</DialogTitle>
          <DialogDescription>
            {c.aplica_segun_perfil ? "Según tu perfil, te aplica." : "Según tu perfil, no te aplica."} Si te apartas de eso, deja el motivo
            (y la fecha en que lo consultaste con tu asesor).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex items-center gap-2">
            <Switch id="activa" checked={activa} onCheckedChange={setActiva} />
            <Label htmlFor="activa">Activa (aparece en el calendario y te avisamos)</Label>
          </div>
          {pideConfirmar && activa ? (
            <div className="flex items-center gap-2">
              <Switch id="confirmada" checked={confirmada} onCheckedChange={setConfirmada} />
              <Label htmlFor="confirmada">Confirmé con mi asesor que me aplica</Label>
            </div>
          ) : null}
          {seAparta ? (
            <div className="space-y-1">
              <Label htmlFor="justificacion-ob">Justificación</Label>
              <Textarea id="justificacion-ob" rows={2} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} maxLength={2000} required minLength={10} />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fecha-asesor">Consulté con mi asesor el (opcional)</Label>
              <Input id="fecha-asesor" type="date" value={fechaAsesor} max={hoyColombiaCliente()} onChange={(e) => setFechaAsesor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dias-aviso">Avisarme estos días antes</Label>
              <Input id="dias-aviso" value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="responsable-ob">Responsable</Label>
              <Combobox
                id="responsable-ob"
                items={[{ value: SIN_SELECCION, label: "Sin asignar" }, ...usuarios.map((u) => ({ value: u.id, label: u.nombre }))]}
                value={responsable}
                onValueChange={(v) => setResponsable(v ?? SIN_SELECCION)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="correo-ob">Correo adicional (opcional)</Label>
              <Input id="correo-ob" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="contador@ejemplo.com" />
              <p className="text-xs text-muted-foreground">Recibe solo los avisos de esta obligación.</p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || (seAparta && justificacion.trim().length < 10)}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarEnvioDialog({ c, onCerrar }: { c: ObligacionClinica; onCerrar: () => void }) {
  const router = useRouter();
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
        const subido = await subirArchivoHabilitacion(archivo, "obligaciones", id);
        if ("error" in subido) return setError(subido.error);
        storagePath = subido.path;
        nombreArchivo = subido.nombre;
      }
      const r = await registrarEnvio({
        id,
        obligacionId: c.obligacion_id,
        fechaPresentacion: String(fd.get("fecha") ?? ""),
        radicado: String(fd.get("radicado") ?? ""),
        observacion: String(fd.get("observacion") ?? ""),
        storagePath,
        nombreArchivo,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: "Envío registrado", type: "success" });
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
          <DialogTitle>Registrar un envío: {c.hab_obligaciones_catalogo.nombre}</DialogTitle>
          <DialogDescription>Para obligaciones sin fecha fija: guarda cuándo lo enviaste y la prueba.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fecha-envio">Fecha del envío</Label>
              <Input id="fecha-envio" name="fecha" type="date" defaultValue={hoyColombiaCliente()} max={hoyColombiaCliente()} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="radicado-envio">Número de radicado</Label>
              <Input id="radicado-envio" name="radicado" maxLength={100} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="acuse-envio">Acuse (opcional si escribiste el radicado)</Label>
            <FileInput id="acuse-envio" name="archivo" accept={ACCEPT_ARCHIVO} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="obs-envio">Observación (opcional)</Label>
            <Textarea id="obs-envio" name="observacion" rows={2} maxLength={4000} />
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
