import { getResendClient, REMITENTE_CORREO } from "@/lib/email/resend";

// Avisos de solicitudes de RRHH (0107). Nunca lanza, mismo criterio que
// citaCorreo y passwordResetCorreo: un correo que falla queda en el log y
// no tumba la acción.

async function enviar(para: string[], asunto: string, texto: string) {
  const cliente = getResendClient();
  const destinos = [...new Set(para.filter(Boolean))];
  if (!cliente || destinos.length === 0) {
    if (!cliente) console.warn("[email] RESEND_API_KEY no está configurada — no se envió el aviso de RRHH.");
    return;
  }
  try {
    const { error } = await cliente.emails.send({ from: REMITENTE_CORREO, to: destinos, subject: asunto, text: texto });
    if (error) console.error("[email] Resend rechazó el aviso de RRHH:", error);
  } catch (error) {
    console.error("[email] No se pudo enviar el aviso de RRHH:", error);
  }
}

export async function avisarSolicitudNueva(params: { aprobadores: string[]; empleado: string; descripcion: string; url: string }) {
  await enviar(
    params.aprobadores,
    `Solicitud de ${params.empleado}: ${params.descripcion}`,
    `Hola,\n\n${params.empleado} registró una solicitud que espera tu aprobación:\n\n${params.descripcion}\n\nRevísala aquí: ${params.url}\n\nEquipo de EWAH Tech`,
  );
}

export async function avisarSolicitudResuelta(params: { correo: string | null; empleado: string; descripcion: string; aprobada: boolean; comentario: string | null; url: string }) {
  if (!params.correo) return;
  const resultado = params.aprobada ? "fue aprobada" : "no fue aprobada";
  await enviar(
    [params.correo],
    `Tu solicitud ${resultado}: ${params.descripcion}`,
    `Hola ${params.empleado},\n\nTu solicitud ${resultado}:\n\n${params.descripcion}${params.comentario ? `\n\nComentario: ${params.comentario}` : ""}\n\nPuedes verla en: ${params.url}\n\nEquipo de EWAH Tech`,
  );
}
