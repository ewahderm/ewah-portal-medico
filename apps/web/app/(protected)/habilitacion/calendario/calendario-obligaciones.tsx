"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Views, type EventProps, type View } from "react-big-calendar";
import { format } from "date-fns";
import { CalendarCheckIcon, ClipboardListIcon, FileClockIcon, type LucideIcon } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizerEs, mensajesCalendario } from "@/components/calendario/calendario-base";
import { estadoOcurrencia, porConfirmar, type Semaforo } from "@/lib/habilitacion/semaforo";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import type { ObligacionClinica, Ocurrencia } from "@/lib/habilitacion/tipos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OcurrenciaDialog, type PermisosOcurrencia } from "../_components/ocurrencia-dialog";
import { ESTILO_SEMAFORO, SemaforoBadge } from "../_components/semaforo-badge";

export type OtroEvento = { id: string; tipo: "plan" | "documento"; fecha: string; titulo: string; detalle: string };

type Evento = {
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  resource:
    | { clase: "ocurrencia"; o: Ocurrencia; c: ObligacionClinica; semaforo: Semaforo; etiqueta: string }
    | { clase: "otro"; e: OtroEvento; semaforo: Semaforo; etiqueta: string };
};

// Una dimensión por canal visual (lección de la Agenda): el COLOR dice el
// semáforo y el ÍCONO dice el tipo (reporte, plan de mejora, documento).
const ICONO_TIPO: Record<string, LucideIcon> = { ocurrencia: CalendarCheckIcon, plan: ClipboardListIcon, documento: FileClockIcon };
const LEYENDA_TIPO = [
  { label: "Reporte u obligación", Icono: CalendarCheckIcon },
  { label: "Plan de mejora", Icono: ClipboardListIcon },
  { label: "Vence un documento", Icono: FileClockIcon },
];
const LEYENDA_SEMAFORO: { s: Semaforo; label: string }[] = [
  { s: "rojo", label: "Vencida o ≤ 7 días" },
  { s: "ambar", label: "8 a 30 días" },
  { s: "verde", label: "Más de 30 días" },
  { s: "gris", label: "Presentada / no aplica" },
  { s: "por_confirmar", label: "Por confirmar" },
];
const MENSAJES = mensajesCalendario({ evento: "Obligación", sinEventos: "No hay fechas en este rango." });

// "YYYY-MM-DD" → Date local a medianoche (sin pasar por UTC).
function aFecha(f: string) {
  const [a, m, d] = f.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

function EventoCelda({ event }: EventProps<Evento>) {
  const r = event.resource;
  const Icono = ICONO_TIPO[r.clase === "ocurrencia" ? "ocurrencia" : r.e.tipo];
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs" title={`${event.title} — ${r.etiqueta}`}>
      <Icono className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{event.title}</span>
    </span>
  );
}

export function CalendarioObligaciones({
  fecha,
  vista,
  hoy,
  config,
  ocurrencias,
  otros,
  permisos,
}: {
  fecha: string;
  vista: "month" | "agenda";
  hoy: string;
  config: ObligacionClinica[];
  ocurrencias: Ocurrencia[];
  otros: OtroEvento[];
  permisos: PermisosOcurrencia;
}) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Evento["resource"] | null>(null);

  const eventos = useMemo<Evento[]>(() => {
    const porObligacion = new Map(config.map((c) => [c.obligacion_id, c]));
    const lista: Evento[] = [];
    for (const o of ocurrencias) {
      const c = porObligacion.get(o.obligacion_id);
      if (!c) continue;
      const e = estadoOcurrencia(o, hoy, porConfirmar(c));
      const d = aFecha(o.fecha_limite);
      lista.push({ title: c.hab_obligaciones_catalogo.nombre, start: d, end: d, allDay: true, resource: { clase: "ocurrencia", o, c, semaforo: e.semaforo, etiqueta: e.etiqueta } });
    }
    for (const x of otros) {
      const e = estadoOcurrencia({ estado: "pendiente", fecha_limite: x.fecha, fecha_presentacion: null }, hoy);
      const d = aFecha(x.fecha);
      lista.push({ title: x.titulo, start: d, end: d, allDay: true, resource: { clase: "otro", e: x, semaforo: e.semaforo, etiqueta: e.etiqueta } });
    }
    return lista;
  }, [config, ocurrencias, otros, hoy]);

  function navegar(nuevaFecha: Date, nuevaVista: "month" | "agenda") {
    const q = new URLSearchParams({ fecha: format(nuevaFecha, "yyyy-MM-dd"), vista: nuevaVista });
    router.push(`/habilitacion/calendario?${q.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-foreground">Semáforo:</span>
          {LEYENDA_SEMAFORO.map((l) => (
            <span key={l.s} className="inline-flex items-center gap-1">
              <span className="size-3 rounded-sm border" style={{ backgroundColor: `color-mix(in oklch, ${ESTILO_SEMAFORO[l.s].color}, transparent 75%)`, borderColor: ESTILO_SEMAFORO[l.s].color }} aria-hidden />
              {l.label}
            </span>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-foreground">Tipo:</span>
          {LEYENDA_TIPO.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1">
              <l.Icono className="size-3.5" aria-hidden /> {l.label}
            </span>
          ))}
        </span>
      </div>

      <div className="h-[44rem] rounded-xl border bg-card p-2">
        <Calendar
          localizer={localizerEs}
          culture="es"
          messages={MENSAJES}
          events={eventos}
          date={aFecha(fecha)}
          view={vista as View}
          views={[Views.MONTH, Views.AGENDA]}
          length={90}
          popup
          onNavigate={(d) => navegar(d, vista)}
          onView={(v) => navegar(aFecha(fecha), v === Views.AGENDA ? "agenda" : "month")}
          onSelectEvent={(e) => setSeleccion((e as Evento).resource)}
          components={{ event: EventoCelda }}
          eventPropGetter={(e) => {
            const c = ESTILO_SEMAFORO[(e as Evento).resource.semaforo].color;
            const punteado = (e as Evento).resource.semaforo === "por_confirmar";
            return {
              style: {
                backgroundColor: `color-mix(in oklch, ${c}, transparent 82%)`,
                color: "var(--foreground)",
                borderLeft: `4px ${punteado ? "dashed" : "solid"} ${c}`,
              },
            };
          }}
        />
      </div>

      {seleccion?.clase === "ocurrencia" ? (
        <OcurrenciaDialog
          ocurrencia={seleccion.o}
          obligacion={seleccion.c.hab_obligaciones_catalogo}
          porConfirmar={porConfirmar(seleccion.c)}
          permisos={permisos}
          onCerrar={() => setSeleccion(null)}
        />
      ) : null}
      {seleccion?.clase === "otro" ? (
        <Dialog open onOpenChange={(o) => !o && setSeleccion(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {seleccion.e.titulo} <SemaforoBadge semaforo={seleccion.semaforo} etiqueta={seleccion.etiqueta} />
              </DialogTitle>
              <DialogDescription>
                {fechaLegible(seleccion.e.fecha)} · {seleccion.e.detalle}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button nativeButton={false} render={<Link href={seleccion.e.tipo === "plan" ? "/habilitacion/autoevaluacion?estado=no_cumple" : "/habilitacion/documentos"} />}>
                {seleccion.e.tipo === "plan" ? "Ir a la autoevaluación" : "Ir a documentos"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
