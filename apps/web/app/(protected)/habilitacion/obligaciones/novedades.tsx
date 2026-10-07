"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { anularNovedad, registrarNovedad, urlNovedad } from "@/lib/habilitacion/obligaciones";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import type { NovedadCatalogo, NovedadReportada } from "@/lib/habilitacion/tipos";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { dateLocalHoy } from "@/lib/medio-ambiente/fecha-local";
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

type SedeConServ = { id: string; nombre: string; servicios: { id: string; nombre: string; estado: string }[] };

const CATEGORIA: Record<string, string> = { prestador: "Del prestador", sede: "De una sede", servicio: "De un servicio", capacidad: "Capacidad instalada" };

// HU-5.5: novedades que se reportan en el REPS (apertura/cierre de
// servicios, cambio de dirección, de representante…). Registrar el cierre
// temporal de un servicio lo marca en Sedes y servicios y deja en el
// calendario la fecha en que vence (1 año).
export function Novedades({
  catalogo,
  reportadas,
  sedes,
  puedeCrear,
  puedeAnular,
}: {
  catalogo: NovedadCatalogo[];
  reportadas: NovedadReportada[];
  sedes: SedeConServ[];
  puedeCrear: boolean;
  puedeAnular: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const nombreNovedad = new Map(catalogo.map((n) => [n.id, n.nombre]));
  const nombreSede = new Map(sedes.map((s) => [s.id, s.nombre]));
  const nombreServicio = new Map(sedes.flatMap((s) => s.servicios.map((v) => [v.id, `${v.nombre} · ${s.nombre}`] as const)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base font-semibold">Novedades del REPS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada cambio (abrir o cerrar un servicio, mudar una sede, cambiar de representante) se reporta en el REPS. Aquí guardas
            cuándo lo reportaste y el soporte.
          </p>
        </div>
        {puedeCrear ? (
          <Button size="sm" onClick={() => setAbierto(true)}>
            <PlusIcon /> Registrar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {reportadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no has registrado novedades.</p>
        ) : (
          <ul className="space-y-2">
            {reportadas.map((n) => (
              <NovedadItem
                key={n.id}
                n={n}
                nombre={nombreNovedad.get(n.novedad_id) ?? "Novedad"}
                lugar={[n.servicio_habilitado_id ? nombreServicio.get(n.servicio_habilitado_id) : null, n.sede_id && !n.servicio_habilitado_id ? nombreSede.get(n.sede_id) : null].filter(Boolean).join(" · ")}
                puedeAnular={puedeAnular}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {abierto ? <NovedadDialog catalogo={catalogo} sedes={sedes} onCerrar={() => setAbierto(false)} /> : null}
    </Card>
  );
}

function NovedadItem({ n, nombre, lugar, puedeAnular }: { n: NovedadReportada; nombre: string; lugar: string; puedeAnular: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function anular() {
    const r = await anularNovedad(n.id, motivo);
    if (r.error) toast.add({ title: "No se anuló", description: r.error, type: "error" });
    else {
      toast.add({ title: "Novedad anulada", description: "Si cambiaste el estado de un servicio, corrígelo en Sedes y servicios.", type: "success" });
      router.refresh();
    }
  }

  return (
    <li className={n.anulado ? "rounded-lg border p-2 text-sm opacity-60" : "rounded-lg border p-2 text-sm"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={n.anulado ? "font-medium line-through" : "font-medium"}>{nombre}</span>
        <span className="text-xs text-muted-foreground">{fechaLegible(n.fecha_reporte)}</span>
        {lugar ? <Badge variant="outline">{lugar}</Badge> : null}
        {n.radicado ? <Badge variant="outline">Radicado {n.radicado}</Badge> : null}
        {n.anulado ? <Badge variant="secondary">Anulada</Badge> : null}
      </div>
      {n.observacion ? <p className="mt-1 text-xs text-muted-foreground">{n.observacion}</p> : null}
      {n.anulado && n.motivo_anulacion ? <p className="mt-1 text-xs text-muted-foreground">Anulada: {n.motivo_anulacion}</p> : null}
      <div className="mt-1 flex flex-wrap gap-3 text-xs">
        {n.nombre_archivo ? (
          <button type="button" onClick={() => abrirFirmado(() => urlNovedad(n.id))} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            <DownloadIcon className="size-3.5" /> {n.nombre_archivo}
          </button>
        ) : null}
        {puedeAnular && !n.anulado && !anulando ? (
          <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => setAnulando(true)}>
            Anular
          </button>
        ) : null}
      </div>
      {anulando ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo de anulación" />
          <Button size="sm" variant="destructive" onClick={anular} disabled={motivo.trim().length < 10}>
            Anular
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function NovedadDialog({ catalogo, sedes, onCerrar }: { catalogo: NovedadCatalogo[]; sedes: SedeConServ[]; onCerrar: () => void }) {
  const router = useRouter();
  const [novedadId, setNovedadId] = useState<string>(catalogo[0]?.id ?? "");
  const [sede, setSede] = useState<string>(SIN_SELECCION);
  const [servicio, setServicio] = useState<string>(SIN_SELECCION);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [sugerirAlta, setSugerirAlta] = useState(false);
  const novedad = catalogo.find((n) => n.id === novedadId);
  const pideServicio = novedad?.categoria === "servicio";
  const pideSede = novedad?.categoria === "sede" || novedad?.categoria === "capacidad";
  const servicios = useMemo(
    () => sedes.flatMap((s) => s.servicios.filter((v) => v.estado !== "cerrado").map((v) => ({ value: v.id, label: `${v.nombre} · ${s.nombre}`, sedeId: s.id }))),
    [sedes],
  );

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPendiente(true);
    setError(null);
    try {
      const carpetaId = crypto.randomUUID();
      let storagePath: string | null = null;
      let nombreArchivo: string | null = null;
      const archivo = fd.get("archivo");
      if (archivo instanceof File && archivo.size > 0) {
        const subido = await subirArchivoHabilitacion(archivo, "novedades", carpetaId);
        if ("error" in subido) return setError(subido.error);
        storagePath = subido.path;
        nombreArchivo = subido.nombre;
      }
      const servicioId = pideServicio && servicio !== SIN_SELECCION ? servicio : null;
      const r = await registrarNovedad({
        carpetaId,
        novedadId,
        fechaReporte: String(fd.get("fecha") ?? ""),
        sedeId: servicioId ? (servicios.find((s) => s.value === servicioId)?.sedeId ?? null) : pideSede && sede !== SIN_SELECCION ? sede : null,
        servicioId,
        radicado: String(fd.get("radicado") ?? ""),
        observacion: String(fd.get("observacion") ?? ""),
        storagePath,
        nombreArchivo,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: "Novedad registrada", type: "success" });
      router.refresh();
      if (r.sugerirAltaServicio) setSugerirAlta(true);
      else onCerrar();
    } finally {
      setPendiente(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar una novedad reportada en el REPS</DialogTitle>
          <DialogDescription>EWAH no reporta en el REPS por ti: guarda la fecha, el radicado y el soporte.</DialogDescription>
        </DialogHeader>
        {sugerirAlta ? (
          <div className="space-y-3">
            <p className="text-sm">Reportaste la apertura de un servicio. ¿Lo declaras ya en Sedes y servicios para calcular sus criterios?</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onCerrar}>
                Después
              </Button>
              <Button nativeButton={false} render={<Link href="/habilitacion/sedes" />}>
                Ir a Sedes y servicios
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="novedad">Qué cambió</Label>
              <Combobox
                id="novedad"
                items={catalogo.map((n) => ({ value: n.id, label: `${n.nombre} (${CATEGORIA[n.categoria] ?? n.categoria})` }))}
                value={novedadId}
                onValueChange={(v) => setNovedadId(v ?? "")}
              />
              {novedad ? <p className="text-xs text-muted-foreground">{novedad.definicion_literal}</p> : null}
            </div>
            {pideServicio ? (
              <div className="space-y-1">
                <Label htmlFor="servicio-nov">Servicio</Label>
                <Combobox
                  id="servicio-nov"
                  items={[{ value: SIN_SELECCION, label: "Elige el servicio" }, ...servicios.map(({ value, label }) => ({ value, label }))]}
                  value={servicio}
                  onValueChange={(v) => setServicio(v ?? SIN_SELECCION)}
                />
                {novedad?.efecto === "alerta_cierre_temporal" ? (
                  <p className="text-xs text-muted-foreground">El servicio pasará a «Cierre temporal» y te avisaremos antes de que se cumpla el año.</p>
                ) : null}
              </div>
            ) : null}
            {pideSede ? (
              <div className="space-y-1">
                <Label htmlFor="sede-nov">Sede</Label>
                <Combobox
                  id="sede-nov"
                  items={[{ value: SIN_SELECCION, label: "Sin sede específica" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                  value={sede}
                  onValueChange={(v) => setSede(v ?? SIN_SELECCION)}
                />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fecha-nov">Fecha del reporte</Label>
                <Input id="fecha-nov" name="fecha" type="date" defaultValue={dateLocalHoy()} max={dateLocalHoy()} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="radicado-nov">Radicado (opcional)</Label>
                <Input id="radicado-nov" name="radicado" maxLength={100} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="archivo-nov">Soporte (opcional)</Label>
              <FileInput id="archivo-nov" name="archivo" accept={ACCEPT_ARCHIVO} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-nov">Observación (opcional)</Label>
              <Textarea id="obs-nov" name="observacion" rows={2} maxLength={4000} />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente || !novedadId || (novedad?.efecto === "alerta_cierre_temporal" && servicio === SIN_SELECCION)}>
                {pendiente ? "Guardando…" : "Registrar"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
