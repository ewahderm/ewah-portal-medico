// Configuración base de react-big-calendar compartida por la Agenda
// (citas) y el calendario de obligaciones de Habilitación: localizador
// es-CO con date-fns y mensajes en español. Solo presentación; sin
// conocimiento de citas ni de obligaciones (diseño de Habilitación §5.3).

import { dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";

export const localizerEs = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: es }),
  getDay,
  locales: { es },
});

export function mensajesCalendario({ evento, sinEventos }: { evento: string; sinEventos: string }) {
  return {
    today: "Hoy",
    previous: "Atrás",
    next: "Siguiente",
    month: "Mes",
    week: "Semana",
    day: "Día",
    agenda: "Agenda",
    date: "Fecha",
    time: "Hora",
    event: evento,
    noEventsInRange: sinEventos,
    showMore: (total: number) => `+${total} más`,
  };
}
