"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, CircleAlertIcon, DownloadIcon, FileUpIcon, LightbulbIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import {
  registrarVersionProtocolo,
  urlProtocoloVigente,
  usarFuenteComoEvidencia,
  usarProtocoloComoEvidencia,
} from "@/lib/habilitacion/autoevaluacion";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { ACCEPT_ARCHIVO, FUENTES_EVIDENCIA, etiquetaDe } from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import type { ProtocoloVigente, ResumenEvidencia, SugerenciaEvidencia } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";

const ESTADO_RESUMEN = {
  ok: { etiqueta: "Al día", clase: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", icono: CheckIcon },
  alerta: { etiqueta: "Revisar", clase: "border-amber-300 bg-amber-50 text-amber-800", icono: CircleAlertIcon },
  falta: { etiqueta: "Sin datos", clase: "border-destructive/30 bg-destructive/10 text-destructive", icono: XIcon },
} as const;

const MODULO = Object.fromEntries(FUENTES_EVIDENCIA.map((f) => [f.value, f.modulo])) as Record<string, string>;

async function abrirFirmado(pedir: () => Promise<{ error?: string; url?: string }>) {
  const r = await pedir();
  if (r.error || !r.url) {
    toast.add({ title: "No se pudo abrir el archivo", description: r.error, type: "error" });
    return;
  }
  window.open(r.url, "_blank", "noopener,noreferrer");
}

// Resumen vivo de una fuente de otro módulo (fn_hab_resumen_evidencia). El
// color nunca es la única señal: insignia con ícono + texto.
export function ResumenFuente({ resumen, compacto }: { resumen: ResumenEvidencia; compacto?: boolean }) {
  const e = ESTADO_RESUMEN[resumen.estado];
  const Icono = e.icono;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{resumen.titulo}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", e.clase)}>
          <Icono className="size-3" aria-hidden /> {e.etiqueta}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{resumen.detalle}</p>
      {!compacto && resumen.filas && resumen.filas.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Persona</th>
                <th className="py-1 pr-2 font-medium">Título</th>
                <th className="py-1 pr-2 font-medium">Tarjeta / ReTHUS</th>
                <th className="py-1 font-medium">Vacunas</th>
              </tr>
            </thead>
            <tbody>
              {resumen.filas.map((f) => (
                <tr key={f.nombre} className="border-t">
                  <td className="py-1 pr-2">{f.nombre}</td>
                  <td className="py-1 pr-2">{f.titulo === "ok" ? "✓ Sí" : "✗ Falta"}</td>
                  <td className="py-1 pr-2">{f.tarjeta === "ok" ? "✓ Sí" : "✗ Falta"}</td>
                  <td className="py-1">{f.vacunas === "vigente" ? "✓ Vigente" : f.vacunas === "vencida" ? "! Vencida" : "✗ Falta"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {resumen.sugerencia ? (
        <p className="inline-flex items-center gap-1 text-xs">
          <LightbulbIcon className="size-3.5 text-amber-600" aria-hidden />
          Con estos datos el criterio parece{" "}
          <strong>{resumen.sugerencia === "cumple" ? "cumplirse" : "NO cumplirse"}</strong>. Tú decides al evaluarlo.
        </p>
      ) : null}
    </div>
  );
}

export function SugerenciasEvidencia({
  sedeId,
  criterioId,
  sugerencias,
  puedeEditar,
  onCambio,
}: {
  sedeId: string;
  criterioId: string;
  sugerencias: SugerenciaEvidencia[];
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  if (sugerencias.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="titulo-sugerencias">
      <div>
        <h3 id="titulo-sugerencias" className="text-sm font-semibold">
          Evidencia que ya tienes en otros módulos
        </h3>
        <p className="text-xs text-muted-foreground">
          Se lee en vivo: no se copia nada. Si lo usas como evidencia, siempre mostrará el dato actual.
        </p>
      </div>
      <ul className="space-y-2">
        {sugerencias.map((s) =>
          s.clase === "fuente" ? (
            <FuenteSugerida key={s.fuente} sedeId={sedeId} criterioId={criterioId} s={s} puedeEditar={puedeEditar} onCambio={onCambio} />
          ) : (
            <ProtocoloSugerido key={s.tipoId} sedeId={sedeId} criterioId={criterioId} s={s} puedeEditar={puedeEditar} onCambio={onCambio} />
          ),
        )}
      </ul>
    </section>
  );
}

function FuenteSugerida({
  sedeId,
  criterioId,
  s,
  puedeEditar,
  onCambio,
}: {
  sedeId: string;
  criterioId: string;
  s: Extract<SugerenciaEvidencia, { clase: "fuente" }>;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const [pendiente, setPendiente] = useState(false);
  const modulo = MODULO[s.fuente] ?? "el módulo";

  async function usar() {
    setPendiente(true);
    const r = await usarFuenteComoEvidencia(sedeId, criterioId, s.fuente);
    setPendiente(false);
    if (r.error) toast.add({ title: "No se agregó", description: r.error, type: "error" });
    else {
      toast.add({ title: "Evidencia agregada", description: `${etiquetaDe(FUENTES_EVIDENCIA, s.fuente)} (${modulo})`, type: "success" });
      onCambio();
    }
  }

  return (
    <li className="space-y-2 rounded-lg border bg-muted/20 p-3">
      {s.resumen ? <ResumenFuente resumen={s.resumen} /> : <p className="text-sm text-muted-foreground">No se pudo leer {modulo} ahora.</p>}
      {s.nota ? <p className="text-xs italic text-muted-foreground">Por qué aplica: {s.nota}</p> : null}
      <div className="flex flex-wrap gap-2">
        {s.resumen?.estado === "falta" ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={s.resumen.enlace} />}>
            Falta en {modulo}: ir a cargarlo <ArrowRightIcon />
          </Button>
        ) : s.enUso ? (
          <Badge variant="secondary" className="gap-1">
            <CheckIcon className="size-3" /> Ya es evidencia de este criterio
          </Badge>
        ) : puedeEditar ? (
          <Button size="sm" onClick={usar} disabled={pendiente}>
            {pendiente ? "Agregando…" : "Usar como evidencia"}
          </Button>
        ) : null}
        {s.resumen && s.resumen.estado !== "falta" ? (
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={s.resumen.enlace} />}>
            Ver en {modulo} <ArrowRightIcon />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ProtocoloSugerido({
  sedeId,
  criterioId,
  s,
  puedeEditar,
  onCambio,
}: {
  sedeId: string;
  criterioId: string;
  s: Extract<SugerenciaEvidencia, { clase: "protocolo" }>;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const [pendiente, setPendiente] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function usar() {
    setPendiente(true);
    const r = await usarProtocoloComoEvidencia(sedeId, criterioId, s.tipoId);
    setPendiente(false);
    if (r.error) toast.add({ title: "No se agregó", description: r.error, type: "error" });
    else {
      toast.add({ title: "Protocolo agregado como evidencia", type: "success" });
      onCambio();
    }
  }

  return (
    <li className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Protocolo: {s.nombre}</span>
        {s.vigente ? (
          <Badge variant="outline">Versión {s.vigente.version}</Badge>
        ) : (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", ESTADO_RESUMEN.falta.clase)}>
            <XIcon className="size-3" aria-hidden /> Sin cargar
          </span>
        )}
      </div>
      <VersionVigente tipoId={s.tipoId} vigente={s.vigente} />
      <div className="flex flex-wrap gap-2">
        {s.vigente && !s.enUso && puedeEditar ? (
          <Button size="sm" onClick={usar} disabled={pendiente}>
            {pendiente ? "Agregando…" : "Usar como evidencia"}
          </Button>
        ) : null}
        {s.enUso ? (
          <Badge variant="secondary" className="gap-1">
            <CheckIcon className="size-3" /> Ya es evidencia de este criterio
          </Badge>
        ) : null}
        {puedeEditar && !cargando ? (
          <Button size="sm" variant="outline" onClick={() => setCargando(true)}>
            <FileUpIcon /> {s.vigente ? "Cargar versión nueva" : "Cargar el protocolo"}
          </Button>
        ) : null}
      </div>
      {cargando ? (
        <CargarVersion
          tipoId={s.tipoId}
          onListo={() => {
            setCargando(false);
            onCambio();
          }}
          onCancelar={() => setCargando(false)}
        />
      ) : null}
    </li>
  );
}

export function VersionVigente({ tipoId, vigente }: { tipoId: string; vigente: ProtocoloVigente | null }) {
  if (!vigente) return null;
  return (
    <button
      type="button"
      onClick={() => abrirFirmado(() => urlProtocoloVigente(tipoId))}
      className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
    >
      <DownloadIcon className="size-3.5 shrink-0" />
      <span className="truncate">{vigente.nombre_archivo}</span>
      <span className="shrink-0 text-muted-foreground">· vigente desde {fechaLegible(vigente.vigente_desde ?? vigente.created_at)}</span>
    </button>
  );
}

function CargarVersion({ tipoId, onListo, onCancelar }: { tipoId: string; onListo: () => void; onCancelar: () => void }) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const archivo = new FormData(e.currentTarget).get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return setError("Selecciona un archivo.");
    setPendiente(true);
    setError(null);
    try {
      const subido = await subirArchivoHabilitacion(archivo, "protocolos", tipoId);
      if ("error" in subido) return setError(subido.error);
      const r = await registrarVersionProtocolo(tipoId, subido.path, subido.nombre);
      if (r.error) return setError(r.error);
      toast.add({ title: "Protocolo cargado", description: "Las versiones anteriores se conservan.", type: "success" });
      onListo();
    } finally {
      setPendiente(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-2 rounded-md bg-muted/50 p-2">
      <FileInput name="archivo" accept={ACCEPT_ARCHIVO} required aria-label="Archivo del protocolo" />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="xs" variant="outline" onClick={onCancelar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button type="submit" size="xs" disabled={pendiente}>
          {pendiente ? "Cargando…" : "Cargar"}
        </Button>
      </div>
    </form>
  );
}
