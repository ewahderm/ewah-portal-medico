// Valor por defecto de un <input type="datetime-local"> en la hora LOCAL
// del navegador (si se usara `new Date().toISOString()` quedaría en UTC,
// adelantado/atrasado varias horas frente a lo que la persona ve en su
// reloj al momento de registrar la medición).
export function datetimeLocalAhora(): string {
  const ahora = new Date();
  const offsetMs = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora.getTime() - offsetMs).toISOString().slice(0, 16);
}

// fecha/hora/jornada son columnas `date`/`time`/`text` sin huso horario —
// a diferencia de `registrado_en` (timestamptz), lo que el input muestra
// en hora local ES el valor que se guarda, sin pasar por ISO/UTC.
export function dateLocalHoy(): string {
  return datetimeLocalAhora().slice(0, 10);
}

export function timeLocalAhora(): string {
  return datetimeLocalAhora().slice(11, 16);
}

// En el papel a veces solo se marca la jornada sin hora exacta — esto solo
// sirve como valor por defecto sugerido (lo común: ahora mismo), la
// persona que digitaliza lo corrige si el papel dice otra cosa.
export function jornadaDesdeHora(hora: string): "AM" | "PM" {
  const horas = Number(hora.slice(0, 2));
  return horas < 12 ? "AM" : "PM";
}

// `fecha` es un string "YYYY-MM-DD" sin huso horario — pasarlo por
// `new Date(...)` lo interpretaría como medianoche UTC y mostraría el día
// anterior en Colombia (UTC-5). Se formatea a mano, sin Date.
export function formatoFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function formatoHora12(hora: string): string {
  const [horaStr, minStr] = hora.split(":");
  const horas = Number(horaStr);
  const horas12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${horas12}:${minStr} ${horas < 12 ? "a. m." : "p. m."}`;
}

// Usado en las tablas de las 4 bitácoras: muestra la hora exacta si se
// registró, o la jornada (AM/PM) cuando no — nunca ambas, para no sugerir
// que hay más precisión de la que realmente hay en el dato.
export function formatoFechaHoraJornada(fecha: string, hora: string | null, jornada: string): string {
  const fechaFmt = formatoFecha(fecha);
  return hora ? `${fechaFmt} · ${formatoHora12(hora)}` : `${fechaFmt} · ${jornada}`;
}
