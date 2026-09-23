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
