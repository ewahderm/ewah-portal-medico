import { getResendClient, REMITENTE_CORREO } from "./resend";

export type EnviarCorreoRestablecerPasswordParams = {
  email: string;
  nombre: string;
  link: string;
};

/**
 * Correo de seguridad de la propia plataforma (no de una clínica) — usa el
 * remitente técnico tal cual, sin pasar por `construirRemitente()`. Un
 * correo de restablecer contraseña debe verse siempre con la identidad de
 * EWAH Tech, nunca con el nombre comercial que un administrador de clínica
 * puede editar libremente.
 *
 * Nunca lanza, mismo criterio que citaCorreo.ts: cualquier problema de
 * envío queda en log, nunca debe tumbar la acción que lo dispara.
 */
export async function enviarCorreoRestablecerPassword(
  params: EnviarCorreoRestablecerPasswordParams,
): Promise<void> {
  const cliente = getResendClient();
  if (!cliente) {
    console.warn(
      "[email] RESEND_API_KEY no está configurada — no se envió el correo de restablecer contraseña.",
    );
    return;
  }

  const texto = `Hola ${params.nombre},\n\nRecibimos una solicitud para restablecer tu contraseña en EWAH Tech. Si fuiste tú, usa este enlace (válido por un tiempo limitado):\n\n${params.link}\n\nSi no fuiste tú, puedes ignorar este correo — tu contraseña actual sigue funcionando.\n\nEquipo de EWAH Tech`;

  try {
    const { error } = await cliente.emails.send({
      from: REMITENTE_CORREO,
      to: params.email,
      subject: "Restablece tu contraseña en EWAH Tech",
      text: texto,
    });
    if (error) {
      console.error("[email] Resend rechazó el correo de restablecer contraseña:", error);
    }
  } catch (error) {
    console.error("[email] No se pudo enviar el correo de restablecer contraseña:", error);
  }
}
