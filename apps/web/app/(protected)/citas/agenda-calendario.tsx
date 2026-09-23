"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Views, type View, type SlotInfo } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./agenda-calendario.css";
import { CitaDetalleDialog } from "./cita-detalle-dialog";
import { CitaDialog } from "./cita-dialog";
import { redondearA15 } from "@/lib/citas/horarios";
import { nombreCompleto, type CitaRow } from "./tipos";

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

type EventoCita = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: CitaRow;
  resourceId: string;
};

const SIN_SEDE_ID = "__sin_sede__";

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
  puedeCrear,
  puedeCrearTratamiento,
  pacientes,
  tiposTratamiento,
  profesionales,
  consultorios,
  sedes,
  mediosPago,
  usuarioActualId,
  pacientesPendientes = new Set(),
}: {
  citas: CitaRow[];
  vista: "day" | "week" | "month";
  fecha: Date;
  puedeEditar: boolean;
  puedeCrear: boolean;
  puedeCrearTratamiento: boolean;
  pacientes: { id: string; nombre: string }[];
  tiposTratamiento: { id: string; nombre: string }[];
  profesionales: { id: string; nombre: string }[];
  consultorios: { id: string; nombre: string; sede_id: string }[];
  sedes: { id: string; nombre: string }[];
  mediosPago: { id: string; nombre: string }[];
  usuarioActualId: string;
  pacientesPendientes?: Set<string>;
}) {
  const router = useRouter();
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaRow | null>(null);
  const [nuevaCita, setNuevaCita] = useState<{
    fecha: string;
    horaInicio?: string;
    sedeId?: string;
  } | null>(null);

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
        resourceId: c.consultorios?.sede_id ?? SIN_SEDE_ID,
      })),
    [citas],
  );

  // Vista día: una columna por sede (react-big-calendar "resources"). Los
  // bloqueos sin consultorio (de día completo, sin sala fija) caen en una
  // columna "Sin sede" que solo aparece si ese día hay alguno — no tiene
  // sentido mostrarla vacía todos los días.
  const recursosDia = useMemo(() => {
    if (vista !== "day" || sedes.length === 0) return undefined;
    const hayBloqueoSinSede = citas.some(
      (c) => c.es_bloqueo && !c.consultorios?.sede_id,
    );
    return hayBloqueoSinSede
      ? [...sedes, { id: SIN_SEDE_ID, nombre: "Sin sede (todo el día)" }]
      : sedes;
  }, [vista, sedes, citas]);

  function navegarUrl(nuevaFecha: Date, nuevaVista: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("fecha", format(nuevaFecha, "yyyy-MM-dd"));
    params.set("vista", nuevaVista);
    router.push(`/citas?${params.toString()}`);
  }

  function handleSelectSlot(slotInfo: SlotInfo) {
    if (!puedeCrear) return;
    // En vista mes, un clic en el día completo no trae una hora útil
    // (cubre 00:00–24:00) — se deja que el usuario elija la hora en el
    // formulario. En día/semana sí trae la hora exacta del bloque clicado.
    const horaInicio =
      vista === "month" ? undefined : redondearA15(format(slotInfo.start, "HH:mm"));
    // En vista día, cada columna es una sede — si el clic vino de una
    // columna real (no la de "Sin sede"), se preselecciona esa sede.
    const resourceId = (slotInfo as SlotInfo & { resourceId?: string | number }).resourceId;
    const sedeId =
      resourceId !== undefined && String(resourceId) !== SIN_SEDE_ID
        ? String(resourceId)
        : undefined;
    setNuevaCita({ fecha: format(slotInfo.start, "yyyy-MM-dd"), horaInicio, sedeId });
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
        step={15}
        timeslots={4}
        selectable={puedeCrear}
        popup
        resources={recursosDia}
        resourceIdAccessor="id"
        resourceTitleAccessor="nombre"
        onNavigate={(nuevaFecha) => navegarUrl(nuevaFecha, vista)}
        onView={(nuevaVista) => navegarUrl(fecha, RBC_A_VISTA[nuevaVista] ?? vista)}
        onSelectSlot={handleSelectSlot}
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
          sedes={sedes}
          mediosPago={mediosPago}
          usuarioActualId={usuarioActualId}
          pacientesPendientes={pacientesPendientes}
        />
      ) : null}

      {nuevaCita ? (
        <CitaDialog
          key={`${nuevaCita.fecha}-${nuevaCita.horaInicio ?? ""}-${nuevaCita.sedeId ?? ""}`}
          pacientes={pacientes}
          profesionales={profesionales}
          consultorios={consultorios}
          sedes={sedes}
          tiposTratamiento={tiposTratamiento}
          fechaSeleccionada={nuevaCita.fecha}
          horaInicioSeleccionada={nuevaCita.horaInicio}
          sedeInicial={nuevaCita.sedeId}
          pacientesPendientes={pacientesPendientes}
          open={!!nuevaCita}
          onOpenChange={(open) => {
            if (!open) setNuevaCita(null);
          }}
        />
      ) : null}
    </div>
  );
}
