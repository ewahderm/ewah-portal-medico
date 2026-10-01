// Valor por defecto de un <input type="datetime-local"> en la hora LOCAL
// del navegador (si se usara `new Date().toISOString()` quedaría en UTC,
// adelantado/atrasado varias horas frente a lo que la persona ve en su
// reloj al momento de registrar la medición).
export function datetimeLocalAhora(): string {
  const ahora = new Date();
  const offsetMs = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora.getTime() - offsetMs).toISOString().slice(0, 16);
}
