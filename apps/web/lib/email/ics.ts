// Genera el archivo .ics adjunto a los correos de citas, para que el
// paciente pueda agregar/actualizar/quitar la cita de su calendario con un
// clic, en vez de que el correo sea solo texto informativo.
//
// Colombia no tiene horario de verano (UTC-05:00 todo el año), así que en
// vez de emitir un bloque VTIMEZONE completo (mucho más verboso y con más
// superficie de error), se calcula directamente el instante UTC a partir
// de la hora local con el offset fijo — cualquier cliente de calendario
// entiende DTSTART/DTEND en UTC sin ambigüedad.

export type IcsEventoParams = {
  /** Estable para la vida de la cita — el mismo id en agendada/actualizada/
   * cancelada hace que el cliente de calendario actualice el MISMO evento
   * en vez de crear uno duplicado por cada correo. */
  citaId: string;
  /** Epoch en segundos, usado como SEQUENCE — RFC 5545 solo exige que
   * aumente en cada revisión del mismo evento, no que empiece en 0; usar
   * el timestamp de `updated_at` de la cita ya garantiza eso sin tener que
   * llevar un contador aparte. */
  actualizadoEn: string;
  cancelada: boolean;
  fecha: string; // yyyy-MM-dd
  horaInicio: string; // HH:mm o HH:mm:ss
  horaFin: string;
  resumen: string;
  descripcion: string;
  ubicacion?: string | null;
  organizerEmail: string;
  organizerNombre: string;
  attendeeEmail: string;
  attendeeNombre: string;
};

function aFechaIcsUtc(fecha: string, hora: string): string {
  const horaCompleta = hora.length === 5 ? `${hora}:00` : hora;
  const instante = new Date(`${fecha}T${horaCompleta}-05:00`);
  return instante.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// RFC 5545 §3.3.11: escapar backslash, coma, punto y coma, y saltos de línea.
function escaparTexto(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function generarIcsCita(params: IcsEventoParams): string {
  const uid = `cita-${params.citaId}@ewahtech.com`;
  const sequence = Math.floor(new Date(params.actualizadoEn).getTime() / 1000);
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const method = params.cancelada ? "CANCEL" : "REQUEST";
  const status = params.cancelada ? "CANCELLED" : "CONFIRMED";

  const lineas = [
    "BEGIN:VCALENDAR",
    "PRODID:-//EWAH Tech Platform//Agenda//ES",
    "VERSION:2.0",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${aFechaIcsUtc(params.fecha, params.horaInicio)}`,
    `DTEND:${aFechaIcsUtc(params.fecha, params.horaFin)}`,
    `SUMMARY:${escaparTexto(params.resumen)}`,
    `DESCRIPTION:${escaparTexto(params.descripcion)}`,
    params.ubicacion ? `LOCATION:${escaparTexto(params.ubicacion)}` : null,
    `STATUS:${status}`,
    `ORGANIZER;CN=${escaparTexto(params.organizerNombre)}:mailto:${params.organizerEmail}`,
    `ATTENDEE;CN=${escaparTexto(params.attendeeNombre)};RSVP=TRUE:mailto:${params.attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((linea): linea is string => linea !== null);

  return lineas.join("\r\n");
}
