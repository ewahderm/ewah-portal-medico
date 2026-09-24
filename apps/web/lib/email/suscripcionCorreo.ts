import { getResendClient, REMITENTE_CORREO } from "./resend";

// Todavía no hay pasarela de pago conectada (Stripe no opera en Colombia;
// Wompi/PayU/ePayco/Mercado Pago quedan pendientes de evaluar) — mientras
// tanto, "solicitar un plan" no cobra nada, solo le avisa a EWAH por correo
// para coordinar la actualización a mano. El día que haya cobro real, este
// correo deja de ser necesario para el flujo feliz (Stripe Checkout ya
// notifica por webhook), pero puede seguir sirviendo como respaldo.
const CORREO_VENTAS_EWAH = process.env.EWAH_VENTAS_EMAIL || "ventas@ewahtech.com";

export type SolicitudPlanParams = {
  nombreClinica: string;
  nombreSolicitante: string;
  emailSolicitante: string;
  planActual: string;
  planSolicitado: string;
  mensaje: string | null;
};

/**
 * Avisa a EWAH que una clínica quiere cambiar de plan. Nunca lanza — mismo
 * criterio que enviarCorreoCita: si Resend no está configurado o falla, se
 * registra en el log y la acción que lo dispara sigue devolviendo éxito
 * (el usuario ya vio su solicitud confirmada en la UI).
 */
export async function enviarSolicitudCambioPlan(params: SolicitudPlanParams): Promise<void> {
  const cliente = getResendClient();
  if (!cliente) {
    console.warn(
      "[email] RESEND_API_KEY no está configurada — no se envió la solicitud de cambio de plan.",
    );
    return;
  }

  const texto = [
    `Clínica: ${params.nombreClinica}`,
    `Solicitado por: ${params.nombreSolicitante} (${params.emailSolicitante})`,
    `Plan actual: ${params.planActual}`,
    `Plan solicitado: ${params.planSolicitado}`,
    params.mensaje ? `Mensaje: ${params.mensaje}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { error } = await cliente.emails.send({
      from: REMITENTE_CORREO,
      to: CORREO_VENTAS_EWAH,
      subject: `Solicitud de cambio de plan — ${params.nombreClinica}`,
      text: texto,
    });
    if (error) {
      console.error("[email] Resend rechazó la solicitud de cambio de plan:", error);
    }
  } catch (error) {
    console.error("[email] No se pudo enviar la solicitud de cambio de plan:", error);
  }
}
