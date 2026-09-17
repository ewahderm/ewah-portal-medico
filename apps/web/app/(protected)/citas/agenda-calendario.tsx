"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./agenda-calendario.css";
import { CitaDetalleDialog } from "./cita-detalle-dialog";
import type { CitaRow } from "./tipos";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: es }),
  getDay,
  locales: { es },
});

const MENSAJES = {
  today: "Hoy",
  previous: "Atrás",
  next: "Siguiente",
  month: "Mes",
  week: "Semana",
  day: "Día",
  agenda: "Agenda",
  date: "Fecha",
  time: "Hora",
  event: "Cita",
  noEventsInRange: "No hay citas en este rango.",
  showMore: (total: number) => `+${total} más`,
};

const ESTADO_COLOR: Record<string, { bg: string; color: string }> = {
  agendada: { bg: "color-mix(in oklch, var(--ewah-cyan), transparent 80%)", color: "var(--ewah-navy)" },
  confirmada: { bg: "var(--ewah-cyan)", color: "var(--ewah-navy)" },
  atendida: { bg: "var(--ewah-navy)", color: "white" },
  cancelada: { bg: "var(--muted)", color: "var(--muted-foreground)" },
  no_asistio: { bg: "color-mix(in oklch, var(--destructive), transparent 70%)", color: "var(--destructive)" },
};

const BLOQUEO_COLOR = { bg: "var(--ewah-slate)", color: "white" };

function combinarFechaHora(fecha: string, hora: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function nombreCompleto(p: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}) {
  return [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

type EventoCita = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: CitaRow;
};

const VISTA_A_RBC: Record<string, View> = {
  day: Views.DAY,
  week: Views.WEEK,
  month: Views.MONTH,
};
const RBC_A_VISTA: Record<string, string> = {
  [Views.DAY]: "day",
  [Views.WEEK]: "week",
  [Views.MONTH]: "month",
};

export function AgendaCalendario({
  citas,
  vista,
  fecha,
  puedeEditar,
  puedeCrearTratamiento,
  pacientes,
  tiposTratamiento,
  profesionales,
  usuarioActualId,
}: {
  citas: CitaRow[];
  vista: "day" | "week" | "month";
  fecha: Date;
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  pacientes: { id: string; nombre: string }[];
  tiposTratamiento: { id: string; nombre: string }[];
  profesionales: { id: string; nombre: string }[];
  usuarioActualId: string;
}) {
  const router = useRouter();
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaRow | null>(null);

  const eventos = useMemo<EventoCita[]>(
    () =>
      citas.map((c) => ({
        id: c.id,
        title: c.es_bloqueo
          ? `Bloqueo${c.motivo ? `: ${c.motivo}` : ""}`
          : c.pacientes
            ? nombreCompleto(c.pacientes)
            : "Cita",
        start: combinarFechaHora(c.fecha, c.hora_inicio),
        end: combinarFechaHora(c.fecha, c.hora_fin),
        resource: c,
      })),
    [citas],
  );

  function navegarUrl(nuevaFecha: Date, nuevaVista: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("fecha", format(nuevaFecha, "yyyy-MM-dd"));
    params.set("vista", nuevaVista);
    router.push(`/citas?${params.toString()}`);
  }

  return (
    <div className="ewah-agenda" style={{ height: "70vh" }}>
      <Calendar
        localizer={localizer}
        culture="es"
        messages={MENSAJES}
        events={eventos}
        date={fecha}
        view={VISTA_A_RBC[vista]}
        views={[Views.DAY, Views.WEEK, Views.MONTH]}
        min={new Date(1970, 0, 1, 6, 0)}
        max={new Date(1970, 0, 1, 21, 0)}
        popup
        onNavigate={(nuevaFecha) => navegarUrl(nuevaFecha, vista)}
        onView={(nuevaVista) => navegarUrl(fecha, RBC_A_VISTA[nuevaVista] ?? vista)}
        onSelectEvent={(evento) => setCitaSeleccionada((evento as EventoCita).resource)}
        eventPropGetter={(evento) => {
          const cita = (evento as EventoCita).resource;
          const colores = cita.es_bloqueo ? BLOQUEO_COLOR : ESTADO_COLOR[cita.estado];
          return { style: { backgroundColor: colores.bg, color: colores.color } };
        }}
      />

      {citaSeleccionada ? (
        <CitaDetalleDialog
          cita={citaSeleccionada}
          open={!!citaSeleccionada}
          onOpenChange={(open) => {
            if (!open) setCitaSeleccionada(null);
          }}
          puedeEditar={puedeEditar}
          puedeCrearTratamiento={puedeCrearTratamiento}
          pacientes={pacientes}
          tiposTratamiento={tiposTratamiento}
          profesionales={profesionales}
          usuarioActualId={usuarioActualId}
        />
      ) : null}
    </div>
  );
}
