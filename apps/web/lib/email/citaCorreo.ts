import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getResendClient, construirRemitente } from "./resend";
import { generarIcsCita } from "./ics";

export type TipoCorreoCita = "agendada" | "actualizada" | "cancelada";

export type EnviarCorreoCitaParams = {
  /** Correo del paciente. Si es null/undefined/"" no se envía nada. */
  email: string | null | undefined;
  nombrePaciente: string;
  tipo: TipoCorreoCita;
  /** Fecha en formato yyyy-MM-dd, tal como se guarda en la tabla citas. */
  fecha: string;
  /** Hora en formato HH:mm o HH:mm:ss. */
  horaInicio: string;
  horaFin: string;
  nombreProfesional: string;
  nombreTratamiento: string;
  /** Solo aplica (y solo se muestra) cuando tipo === "cancelada". */
  motivo?: string | null;
  /** Id estable de la cita — hace que agendada/actualizada/cancelada
   * actualicen el MISMO evento en el calendario del paciente en vez de
   * crear uno duplicado por cada correo. */
  citaId: string;
  /** `updated_at` de la cita — se usa como SEQUENCE del .ics (ver ics.ts). */
  actualizadoEn: string;
  ubicacion?: string | null;
  /** Identidad de la clínica que atiende — el llamador ya resuelve el
   * fallback a clinicas.nombre si no hay nombre_comercial configurado. */
  clinica: {
    nombreComercial: string;
    correoNotificaciones?: string | null;
    telefono?: string | null;
  };
};

// Mismo remitente que ya se usa para el correo — el organizador del evento
// de calendario es la misma identidad que firma el correo.
function extraerEmailRemitente(remitente: string): string {
  const match = remitente.match(/<([^>]+)>/);
  return match ? match[1] : remitente;
}

function formatearFechaHora(fecha: string, horaInicio: string) {
  const fechaFormateada = format(parseISO(fecha), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  const horaFormateada = horaInicio.slice(0, 5);
  return { fechaFormateada, horaFormateada };
}

// Búsqueda de Google Maps por texto — no requiere coordenadas (sedes.direccion
// es solo texto libre) ni API key, a diferencia de un mapa embebido.
function enlaceGoogleMaps(ubicacion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ubicacion)}`;
}

function construirContenido(params: EnviarCorreoCitaParams) {
  const { fechaFormateada, horaFormateada } = formatearFechaHora(params.fecha, params.horaInicio);
  const detalle = [
    `Profesional: ${params.nombreProfesional}`,
    `Tratamiento: ${params.nombreTratamiento}`,
    `Fecha: ${fechaFormateada}`,
    `Hora: ${horaFormateada}`,
    params.ubicacion ? `Ubicación: ${params.ubicacion}` : null,
  ]
    .filter((linea): linea is string => linea !== null)
    .join("\n");
  const comoLlegar = params.ubicacion
    ? `\n\nCómo llegar: ${enlaceGoogleMaps(params.ubicacion)}`
    : "";

  const nombreClinica = params.clinica.nombreComercial;

  if (params.tipo === "agendada") {
    return {
      asunto: `Tu cita en ${nombreClinica} quedó agendada`,
      cuerpo: `Te escribimos de ${nombreClinica} para confirmarte que tienes una cita agendada:\n\n${detalle}${comoLlegar}\n\nTe esperamos con gusto.`,
    };
  }

  if (params.tipo === "cancelada") {
    const motivoTexto = params.motivo ? `\n\nMotivo: ${params.motivo}` : "";
    return {
      asunto: `Tu cita en ${nombreClinica} fue cancelada`,
      cuerpo: `Te escribimos de ${nombreClinica} para informarte que tu cita programada para el ${fechaFormateada} a las ${horaFormateada} fue cancelada.${motivoTexto}\n\nSi deseas reagendar, contáctanos con gusto.`,
    };
  }

  // "actualizada" cubre confirmaciones y reprogramaciones: en ambos casos
  // el paciente necesita ver los datos VIGENTES de la cita, no un historial.
  return {
    asunto: `Tu cita en ${nombreClinica} fue actualizada`,
    cuerpo: `Te escribimos de ${nombreClinica} para contarte que tu cita fue actualizada. Estos son los datos vigentes:\n\n${detalle}${comoLlegar}`,
  };
}

/**
 * Envía el correo de una cita (agendada/actualizada/cancelada) al paciente.
 * Nunca lanza: cualquier problema (sin correo del paciente, sin
 * RESEND_API_KEY, error de red, key inválida, rate limit, etc.) se resuelve
 * como un no-op silencioso o un log, para que la acción de la cita que lo
 * dispara siga devolviendo éxito normal.
 */
export async function enviarCorreoCita(params: EnviarCorreoCitaParams): Promise<void> {
  if (!params.email) return; // paciente sin correo registrado: no hay a quién escribirle

  const cliente = getResendClient();
  if (!cliente) {
    console.warn(
      "[email] RESEND_API_KEY no está configurada — no se envió el correo de la cita.",
    );
    return;
  }

  const { asunto, cuerpo } = construirContenido(params);
  const remitente = construirRemitente(params.clinica.nombreComercial);
  const telefonoLinea = params.clinica.telefono
    ? `\n\nSi tienes dudas, contáctanos al ${params.clinica.telefono}.`
    : "";
  const texto = `Hola ${params.nombrePaciente},\n\n${cuerpo}${telefonoLinea}\n\nEquipo de ${params.clinica.nombreComercial}`;

  const cancelada = params.tipo === "cancelada";
  const ics = generarIcsCita({
    citaId: params.citaId,
    actualizadoEn: params.actualizadoEn,
    cancelada,
    fecha: params.fecha,
    horaInicio: params.horaInicio,
    horaFin: params.horaFin,
    resumen: `${params.nombreTratamiento} — ${params.clinica.nombreComercial}`,
    descripcion: `Profesional: ${params.nombreProfesional}\nTratamiento: ${params.nombreTratamiento}`,
    ubicacion: params.ubicacion,
    organizerEmail: extraerEmailRemitente(remitente),
    organizerNombre: params.clinica.nombreComercial,
    attendeeEmail: params.email,
    attendeeNombre: params.nombrePaciente,
  });

  try {
    const { error } = await cliente.emails.send({
      from: remitente,
      to: params.email,
      replyTo: params.clinica.correoNotificaciones || undefined,
      subject: asunto,
      text: texto,
      attachments: [
        {
          filename: cancelada ? "cancelacion.ics" : "cita.ics",
          content: ics,
          contentType: `text/calendar; charset=utf-8; method=${cancelada ? "CANCEL" : "REQUEST"}`,
        },
      ],
    });
    if (error) {
      console.error("[email] Resend rechazó el correo de la cita:", error);
    }
  } catch (error) {
    console.error("[email] No se pudo enviar el correo de la cita:", error);
  }
}
