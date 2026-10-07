import { Resend } from "resend";

// Cliente perezoso: se crea solo la primera vez que hace falta, y se
// memoriza el resultado (incluido `null`) para no releer `process.env` ni
// reconstruir el cliente en cada envío.
let clienteResend: Resend | null | undefined;

/**
 * Devuelve el cliente de Resend, o `null` si RESEND_API_KEY no está
 * configurada. Nunca lanza: este entorno de desarrollo todavía no tiene la
 * key, así que build/lint/tsc deben pasar limpios sin ella, y en producción
 * el envío de correos debe hacer un no-op silencioso (con `console.warn`)
 * mientras no se configure, en vez de tumbar la acción que lo dispara.
 */
export function getResendClient(): Resend | null {
  if (clienteResend !== undefined) return clienteResend;

  const apiKey = process.env.RESEND_API_KEY;
  clienteResend = apiKey ? new Resend(apiKey) : null;
  return clienteResend;
}

// EWAH SAS todavía no tiene un dominio propio verificado en Resend, así que
// por ahora se envía desde el dominio de pruebas compartido
// `onboarding@resend.dev`. Esto funciona, pero esos correos tienden a caer
// en spam porque el dominio no es propio. El día que se verifique un
// dominio en Resend (Domains → Add Domain), basta con definir
// RESEND_FROM_EMAIL en el entorno — no hace falta tocar código.
export const REMITENTE_CORREO =
  process.env.RESEND_FROM_EMAIL || "EWAH By Dra. Lorena Pinzón <onboarding@resend.dev>";

// El dominio/dirección técnica del remitente se mantiene compartido (ver
// comentario arriba); lo único que cambia por clínica es el nombre visible
// antes de "<...>" — así cada clínica se ve como ella misma ante su
// paciente aunque el correo salga técnicamente del mismo buzón.
// El nombre lo escribe el administrador de la clínica: sin comillas,
// ángulos, comas ni saltos de línea un nombre raro no rompe el encabezado
// From (el envío fallaría) ni se hace pasar por otra dirección.
export function construirRemitente(nombreComercial?: string | null): string {
  const limpio = (nombreComercial ?? "").replace(/["<>,;\r\n\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!limpio) return REMITENTE_CORREO;
  const match = REMITENTE_CORREO.match(/<([^>]+)>/);
  const email = match ? match[1] : REMITENTE_CORREO;
  return `"${limpio}" <${email}>`;
}
