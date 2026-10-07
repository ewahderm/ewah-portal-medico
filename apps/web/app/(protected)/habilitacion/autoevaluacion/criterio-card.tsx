"use client";

import { memo, useState } from "react";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ListChecksIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UserIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { URL_PDF_RES3100, type EstadoEvaluacion } from "@/lib/habilitacion/constantes";
import type { EstadoDerivado } from "@/lib/habilitacion/estado-criterio";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import type { FilaCriterio } from "@/lib/habilitacion/tipos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Estados de criterio (§5.4): ícono + texto + color; el color nunca es la
// única señal.
export const ESTILO_ESTADO: Record<EstadoEvaluacion, { icono: LucideIcon; etiqueta: string; chip: string; tarjeta: string }> = {
  cumple: {
    icono: CheckIcon,
    etiqueta: "Cumple",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
    tarjeta: "border-l-emerald-600",
  },
  no_cumple: {
    icono: XIcon,
    etiqueta: "No cumple",
    chip: "bg-destructive/10 text-destructive border-destructive/30",
    tarjeta: "border-l-destructive",
  },
  no_aplica: {
    icono: BanIcon,
    etiqueta: "No aplica",
    chip: "bg-muted text-muted-foreground border-border",
    tarjeta: "border-l-muted-foreground/40",
  },
  pendiente: {
    icono: CircleIcon,
    etiqueta: "Pendiente",
    chip: "bg-background text-foreground border-foreground/30",
    tarjeta: "border-l-border",
  },
};

const BOTONES: { estado: Exclude<EstadoEvaluacion, "pendiente">; activo: string }[] = [
  { estado: "cumple", activo: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700" },
  { estado: "no_cumple", activo: "border-destructive bg-destructive text-white hover:bg-destructive/90" },
  { estado: "no_aplica", activo: "border-muted-foreground bg-muted-foreground text-background hover:bg-muted-foreground/90" },
];

export function EstadoChip({ estado, className }: { estado: EstadoEvaluacion; className?: string }) {
  const e = ESTILO_ESTADO[estado];
  const Icono = e.icono;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", e.chip, className)}
    >
      <Icono
        key={estado}
        className="size-3.5 animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
        aria-hidden
      />
      {e.etiqueta}
    </span>
  );
}

type Props = {
  fila: FilaCriterio;
  derivado: EstadoDerivado;
  profundidad: number;
  plegado: boolean;
  responsable: string | null;
  puedeEditar: boolean;
  ocupado: boolean;
  esMio: boolean;
  onPlegar: (id: string) => void;
  onMarcar: (fila: FilaCriterio, estado: EstadoEvaluacion) => void;
  onDetalle: (fila: FilaCriterio) => void;
};

// memo: con ~250 tarjetas en pantalla, marcar una no debe re-renderizar las
// demás (las props de las otras no cambian).
export const CriterioCard = memo(function CriterioCard({
  fila,
  derivado,
  profundidad,
  plegado,
  responsable,
  puedeEditar,
  ocupado,
  esMio,
  onPlegar,
  onMarcar,
  onDetalle,
}: Props) {
  const [expandido, setExpandido] = useState(false);
  const largo = fila.texto_literal.length > 420;
  const estado = derivado.estado;
  const sangria = Math.min(profundidad, 3);

  const cita = (
    <a
      href={`${URL_PDF_RES3100}${fila.pagina ? `#page=${fila.pagina}` : ""}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
    >
      {fila.codigo}
      {fila.pagina ? ` · pág. ${fila.pagina}` : ""}
      <ExternalLinkIcon className="size-3" aria-hidden />
      <span className="sr-only">(abre el PDF oficial de la Resolución 3100)</span>
    </a>
  );

  const texto = (
    <div>
      <p className={cn("text-sm whitespace-pre-line", largo && !expandido && "line-clamp-6")}>{fila.texto_literal}</p>
      {largo ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
        >
          {expandido ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
    </div>
  );

  // Encabezado "Cuenta con:": no se marca, muestra el agregado de sus hijos.
  if (fila.es_encabezado) {
    return (
      <div
        className="[content-visibility:auto] [contain-intrinsic-size:auto_9rem] rounded-lg border border-dashed bg-muted/30 p-3"
        style={{ marginLeft: `${sangria}rem` }}
      >
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPlegar(fila.criterio_id)}
            aria-expanded={!plegado}
            aria-label={plegado ? `Mostrar los criterios de ${fila.codigo}` : `Ocultar los criterios de ${fila.codigo}`}
          >
            <ChevronDownIcon className={cn("transition-transform duration-150", plegado && "-rotate-90")} />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {cita}
              <EstadoChip estado={estado} />
              <span className="text-xs text-muted-foreground">
                {derivado.cumplen ?? 0} de {derivado.total ?? 0} cumplen
              </span>
            </div>
            {texto}
          </div>
        </div>
      </div>
    );
  }

  // Autorresuelto por remisión a 11.1: en gris, sin botones (HU-4.2 AC6).
  if (fila.autorresuelto) {
    return (
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_9rem] rounded-lg border bg-muted/40 p-3 text-muted-foreground" style={{ marginLeft: `${sangria}rem` }}>
        <div className="flex flex-wrap items-center gap-2">
          {cita}
          <Badge variant="outline" className="gap-1">
            <ListChecksIcon className="size-3" /> Se cumple con 11.1
          </Badge>
          <EstadoChip estado={estado} />
          <span className="text-xs">
            {derivado.cumplen ?? 0} de {derivado.total ?? 0} criterios de 11.1 de este estándar cumplen
          </span>
        </div>
        <div className="mt-1">{texto}</div>
      </div>
    );
  }

  const e = ESTILO_ESTADO[estado];
  return (
    <article
      className={cn(
        "[content-visibility:auto] [contain-intrinsic-size:auto_9rem] space-y-3 rounded-lg border border-l-4 bg-card p-3 transition-colors duration-150 sm:p-4",
        e.tarjeta,
        ocupado && "opacity-70",
      )}
      style={{ marginLeft: `${sangria}rem` }}
      aria-label={`Criterio ${fila.codigo}: ${e.etiqueta}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {cita}
        <EstadoChip estado={estado} />
        {fila.origen === "remision" && fila.remitido_desde_codigo ? (
          <Badge variant="outline">Exigido por remisión desde {fila.remitido_desde_codigo}</Badge>
        ) : null}
        {fila.vigente_hasta ? (
          <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
            <ClockIcon className="size-3" /> Deja de exigirse el {fechaLegible(fila.vigente_hasta)} (Res. 914/2025)
          </Badge>
        ) : null}
        {fila.nota_vigencia?.includes("SUSPENDIDO") ? (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            Suspendido provisionalmente en parte
          </Badge>
        ) : null}
        {fila.confianza === "baja" ? (
          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800">
            <TriangleAlertIcon className="size-3" /> Transcripción por confirmar
          </Badge>
        ) : null}
        {fila.en_cierre_temporal ? <Badge variant="secondary">Servicio en cierre temporal</Badge> : null}
        {fila.reverificar ? (
          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800">
            <RefreshCwIcon className="size-3" /> Re-verificar (más de 12 meses)
          </Badge>
        ) : null}
      </div>

      {texto}

      {estado === "no_aplica" && fila.justificacion ? (
        <p className="rounded-md bg-muted px-2 py-1 text-xs">
          <span className="font-medium">No aplica porque:</span> {fila.justificacion}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => onDetalle(fila)}
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          <FileTextIcon className="size-3.5" />
          {fila.evidencias_activas === 0
            ? "Sin evidencias"
            : `${fila.evidencias_activas} evidencia${fila.evidencias_activas === 1 ? "" : "s"}`}
          {fila.planes_abiertos > 0 ? ` · ${fila.planes_abiertos} plan${fila.planes_abiertos === 1 ? "" : "es"} de mejora abierto${fila.planes_abiertos === 1 ? "" : "s"}` : ""}
          {" · Ver detalle"}
        </button>
        {responsable ? (
          <span className={cn("inline-flex items-center gap-1", esMio && "font-medium text-foreground")}>
            <UserIcon className="size-3.5" /> {esMio ? "Asignado a ti" : responsable}
            {fila.fecha_objetivo ? ` · para el ${fechaLegible(fila.fecha_objetivo)}` : ""}
          </span>
        ) : null}
        {fila.fecha_verificacion ? <span>Verificado el {fechaLegible(fila.fecha_verificacion)}</span> : null}
      </div>

      {puedeEditar ? (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Evaluar ${fila.codigo}`}>
          {BOTONES.map((b) => {
            const activo = estado === b.estado;
            const Icono = ESTILO_ESTADO[b.estado].icono;
            return (
              <button
                key={b.estado}
                type="button"
                disabled={ocupado}
                aria-pressed={activo}
                title={activo ? "Vuelve a tocar para dejarlo pendiente" : undefined}
                onClick={() => onMarcar(fila, activo ? "pendiente" : b.estado)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none",
                  activo ? b.activo : "bg-background hover:bg-muted",
                )}
              >
                <Icono className="size-4" aria-hidden />
                {ESTILO_ESTADO[b.estado].etiqueta}
              </button>
            );
          })}
        </div>
      ) : null}
    </article>
  );
});
