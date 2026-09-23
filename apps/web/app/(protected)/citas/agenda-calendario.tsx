"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
  type SlotInfo,
  type EventProps,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import {
  Clock,
  CircleCheck,
  CheckCheck,
  TriangleAlert,
  X,
  RotateCcw,
  Lock,
  type LucideIcon,
} from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./agenda-calendario.css";
import { CitaDetalleDialog } from "./cita-detalle-dialog";
import { CitaDialog } from "./cita-dialog";
import { redondearA15 } from "@/lib/citas/horarios";
import { nombreCompleto, ESTADO_LABEL, type CitaRow } from "./tipos";
import { colorPorProfesional } from "./colores-profesional";

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

// Insignia de estado (ícono en círculo) que se dibuja sobre cada evento y
// se reutiliza tal cual en la leyenda de "Estado" — una sola tabla para no
// duplicar la definición entre ambos lugares. El FONDO/borde del evento ya
// no depende del estado (ver eventPropGetter más abajo): esa señal ahora es
// 100% profesional, y el estado se comunica solo por esta insignia.
type EstadoInfo = {
  clave: string;
  label: string;
  Icono: LucideIcon;
  bgInsignia: string;
  colorIcono: string;
};

const ESTADOS_LEYENDA: EstadoInfo[] = [
  { clave: "agendada", label: ESTADO_LABEL.agendada, Icono: Clock, bgInsignia: "var(--ewah-cyan)", colorIcono: "var(--ewah-navy)" },
  { clave: "confirmada", label: ESTADO_LABEL.confirmada, Icono: CircleCheck, bgInsignia: "var(--ewah-cyan-dark)", colorIcono: "white" },
  { clave: "atendida", label: ESTADO_LABEL.atendida, Icono: CheckCheck, bgInsignia: "var(--ewah-navy)", colorIcono: "white" },
  { clave: "no_asistio", label: ESTADO_LABEL.no_asistio, Icono: TriangleAlert, bgInsignia: "oklch(0.75 0.15 70)", colorIcono: "var(--ewah-navy)" },
  { clave: "cancelada", label: ESTADO_LABEL.cancelada, Icono: X, bgInsignia: "var(--destructive)", colorIcono: "white" },
  { clave: "reprogramada", label: ESTADO_LABEL.reprogramada, Icono: RotateCcw, bgInsignia: "var(--ewah-slate)", colorIcono: "white" },
  { clave: "bloqueo", label: "Bloqueo", Icono: Lock, bgInsignia: "var(--ewah-navy)", colorIcono: "white" },
];

const ESTADOS_POR_CLAVE: Record<string, EstadoInfo> = Object.fromEntries(
  ESTADOS_LEYENDA.map((e) => [e.clave, e]),
);

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

// Insignia de estado dibujada sobre cada evento (components.event de
// react-big-calendar — eventPropGetter solo puede tocar estilos del
// contenedor, no puede meter un ícono adentro). En vista mes se reduce a un
// punto sólido sin ícono: no hay espacio legible en una fila de una sola
// línea, el detalle completo se sigue viendo al abrir la cita.
function EventoAgenda({
  event,
  title,
  vista,
}: EventProps<EventoCita> & { vista: "day" | "week" | "month" }) {
  const cita = event.resource;
  const info = ESTADOS_POR_CLAVE[cita.es_bloqueo ? "bloqueo" : cita.estado];
  const tachado = cita.estado === "cancelada";

  return (
    <>
      <span style={tachado ? { textDecoration: "line-through" } : undefined}>{title}</span>
      {info ? (
        vista === "month" ? (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: info.bgInsignia }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: info.bgInsignia }}
          >
            <info.Icono className="h-2.5 w-2.5" style={{ color: info.colorIcono }} strokeWidth={2.5} />
          </span>
        )
      ) : null}
    </>
  );
}

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
  insumos,
  lotes,
  puedeRegistrarConsumo,
  puedeRevertirConsumo,
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
  insumos: { id: string; nombre: string }[];
  lotes: { id: string; insumo_id: string; sede_id: string; numero_lote: string | null; cantidad_actual: number }[];
  puedeRegistrarConsumo: boolean;
  puedeRevertirConsumo: boolean;
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

  const componentesCalendario = useMemo(
    () => ({
      event: (props: EventProps<EventoCita>) => <EventoAgenda {...props} vista={vista} />,
    }),
    [vista],
  );

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
      {profesionales.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Profesional:</span>
          {profesionales.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorPorProfesional(p.id) }}
                aria-hidden
              />
              {p.nombre}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Estado:</span>
        {ESTADOS_LEYENDA.map((e) => (
          <span key={e.clave} className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: e.bgInsignia }}
              aria-hidden
            >
              <e.Icono className="h-2.5 w-2.5" style={{ color: e.colorIcono }} strokeWidth={2.5} />
            </span>
            {e.label}
          </span>
        ))}
      </div>

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
        components={componentesCalendario}
        eventPropGetter={(evento) => {
          const cita = (evento as EventoCita).resource;
          const colorProfesional = colorPorProfesional(cita.profesional_id);
          return {
            style: {
              backgroundColor: `color-mix(in oklch, ${colorProfesional}, transparent 82%)`,
              color: "var(--ewah-navy)",
              borderLeft: `5px solid ${colorProfesional}`,
            },
          };
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
          insumos={insumos}
          lotes={lotes}
          puedeRegistrarConsumo={puedeRegistrarConsumo}
          puedeRevertirConsumo={puedeRevertirConsumo}
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
