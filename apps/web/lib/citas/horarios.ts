export const HORA_APERTURA = 6;
export const HORA_CIERRE = 21;

function formatoHora(minutosDesdeMedianoche: number) {
  const hh = String(Math.floor(minutosDesdeMedianoche / 60) % 24).padStart(2, "0");
  const mm = String(minutosDesdeMedianoche % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Genera opciones cada 15 minutos entre horaInicio y horaFin (en horas, 0-23).
// horaFin va una hora más allá del cierre real para que "sumarMinutos(hora, 60)"
// siempre encuentre una opción válida en el select de hora fin, incluso si la
// cita empieza justo a la hora de cierre.
export function opcionesHora(horaInicio = HORA_APERTURA, horaFin = HORA_CIERRE + 1) {
  const opciones: { value: string; label: string }[] = [];
  for (let m = horaInicio * 60; m <= horaFin * 60; m += 15) {
    const valor = formatoHora(m);
    opciones.push({ value: valor, label: valor });
  }
  return opciones;
}

export function sumarMinutos(hora: string, minutos: number) {
  const [hh, mm] = hora.split(":").map(Number);
  return formatoHora(hh * 60 + mm + minutos);
}

export function redondearA15(hora: string) {
  const [hh, mm] = hora.split(":").map(Number);
  return formatoHora(hh * 60 + Math.round(mm / 15) * 15);
}
