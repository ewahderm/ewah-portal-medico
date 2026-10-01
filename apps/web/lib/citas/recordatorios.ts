import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, REMITENTE_CORREO } from "@/lib/email/resend";
import { nombreCompleto } from "@/lib/pacientes/nombre";

type FilaRecordatorio = {
  hora_inicio: string;
  profesional_id: string;
  motivo: string | null;
  pacientes: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  } | null;
  profesional: { nombre: string; email: string } | null;
  consultorios: { sedes: { nombre: string } | null } | null;
  tipos_tratamiento: { nombre: string } | null;
};

/**
 * Calcula "mañana" en fecha de Colombia (yyyy-MM-dd) a partir del instante
 * UTC de ejecución. Válido específicamente porque este job solo se dispara
 * entre las 23:00 y las 23:59 UTC (6pm-6:59pm Colombia, offset fijo -05:00,
 * sin horario de verano — ver lib/email/ics.ts) — en esa ventana la fecha
 * calendario UTC y la de Colombia son siempre la MISMA, así que sumar un
 * día en UTC da la fecha correcta de "mañana" en Colombia. Si este job
 * alguna vez se disparara en otro horario, este cálculo dejaría de ser
 * válido y habría que pasar por un offset explícito como en ics.ts.
 */
function fechaDeManana(): string {
  return format(addDays(new Date(), 1), "yyyy-MM-dd");
}

// Observaciones es texto libre (lo escribe el staff al agendar/confirmar) y
// nombres/sedes/tratamientos en teoría también podrían llevar un carácter
// raro — sin escapar, un "<" o "&" suelto rompería el HTML del correo, y en
// el peor caso alguien podría inyectar markup. Siempre se escapa antes de
// interpolar.
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function construirHtmlRecordatorio(
  nombreProfesional: string,
  fechaTexto: string,
  citas: { hora: string; paciente: string; sede: string; tratamiento: string; observaciones: string }[],
) {
  const filas = citas
    .map(
      (c, i) => `
        <tr style="background-color: ${i % 2 === 0 ? "#ffffff" : "#f4f7f9"};">
          <td style="padding: 10px 14px; font-size: 14px; color: #0D1825; font-weight: 600; white-space: nowrap;">${escapeHtml(c.hora)}</td>
          <td style="padding: 10px 14px; font-size: 14px; color: #0D1825;">${escapeHtml(c.paciente)}</td>
          <td style="padding: 10px 14px; font-size: 14px; color: #363F4A;">${escapeHtml(c.sede)}</td>
          <td style="padding: 10px 14px; font-size: 14px; color: #363F4A;">${escapeHtml(c.tratamiento)}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #94a3b8;">${escapeHtml(c.observaciones)}</td>
        </tr>`,
    )
    .join("");

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background-color: #f4f7f9; padding: 24px;">
    <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background-color: #0D1825; padding: 20px 24px;">
        <span style="font-size: 20px; font-weight: 700; color: #ffffff;">ewah</span>
        <span style="font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #00C9EC; margin-left: 6px;">TECH</span>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #0D1825; margin: 0 0 4px;">Hola ${escapeHtml(nombreProfesional)},</p>
        <p style="font-size: 14px; color: #363F4A; margin: 0 0 20px;">
          Este es tu recordatorio de citas para <strong>mañana, ${fechaTexto}</strong>:
        </p>
        <table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #00C9EC;">
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase; letter-spacing: 0.5px;">Hora</th>
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase; letter-spacing: 0.5px;">Paciente</th>
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase; letter-spacing: 0.5px;">Sede</th>
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase; letter-spacing: 0.5px;">Tratamiento</th>
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase; letter-spacing: 0.5px;">Observaciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <p style="font-size: 13px; color: #94a3b8; margin: 24px 0 0;">
          ${citas.length} cita${citas.length === 1 ? "" : "s"} programada${citas.length === 1 ? "" : "s"} para ese día.
        </p>
      </div>
      <div style="padding: 16px 24px; background-color: #f4f7f9; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">Familia EWAH By Dra. Lorena Pinzón</p>
      </div>
    </div>
  </div>`;
}

/**
 * Envía un correo por profesional (no por cita) con el listado de sus citas
 * de mañana — hora, paciente, sede. Corre sin sesión de usuario (lo dispara
 * un cron, no una persona logueada), así que usa el cliente admin
 * (service_role, bypassa RLS) a propósito: necesita ver las citas de TODAS
 * las clínicas de la plataforma, no solo una.
 *
 * Nunca lanza — un fallo de correo (red, key inválida, un profesional sin
 * email) nunca debe tumbar el cron completo; se reporta en el resultado
 * para poder diagnosticar desde los logs.
 */
export async function enviarRecordatoriosCitasManana(
  fechaOverride?: string,
): Promise<{ fecha: string; profesionales: number; enviados: number; fallidos: number }> {
  const fecha = fechaOverride ?? fechaDeManana();

  const cliente = getResendClient();
  if (!cliente) {
    console.warn("[recordatorios] RESEND_API_KEY no está configurada — no se envió nada.");
    return { fecha, profesionales: 0, enviados: 0, fallidos: 0 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("citas")
    .select(
      `hora_inicio, profesional_id, motivo,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       profesional:usuarios!citas_profesional_id_fkey(nombre, email),
       consultorios(sedes(nombre)),
       tipos_tratamiento(nombre)`,
    )
    .eq("fecha", fecha)
    // Solo confirmadas, a pedido explícito — "agendada" todavía no la
    // confirma el paciente/la clínica, así que no amerita el recordatorio
    // de "mañana tienes esto". "atendida" no debería darse para una fecha
    // futura; "cancelada"/"no_asistio"/"reprogramada" nunca son vigentes.
    .eq("estado", "confirmada")
    .order("hora_inicio", { ascending: true });

  if (error || !data) {
    console.error("[recordatorios] No se pudieron consultar las citas de mañana:", error);
    return { fecha, profesionales: 0, enviados: 0, fallidos: 0 };
  }

  const filas = data as unknown as FilaRecordatorio[];

  // Agrupadas por profesional: un correo por médico con TODAS sus citas del
  // día, no un correo por cita — un profesional_id pertenece a un único
  // usuario, que a su vez pertenece a una única clínica, así que agrupar
  // solo por profesional_id ya es suficiente (no hace falta clinica_id).
  const porProfesional = new Map<string, { profesional: { nombre: string; email: string }; citas: FilaRecordatorio[] }>();
  for (const fila of filas) {
    if (!fila.profesional?.email) continue; // sin correo registrado: nada que hacer
    const entrada = porProfesional.get(fila.profesional_id);
    if (entrada) entrada.citas.push(fila);
    else porProfesional.set(fila.profesional_id, { profesional: fila.profesional, citas: [fila] });
  }

  const fechaTexto = format(new Date(`${fecha}T00:00:00`), "EEEE d 'de' MMMM", { locale: es });

  // El SDK de Resend no rechaza la promesa cuando la API contesta con un
  // error (ej. key inválida, dominio no verificado) — la resuelve con
  // { data: null, error: {...} }, igual que en citaCorreo.ts. Un
  // Promise.allSettled que solo mirara "rejected" habría reportado esos
  // casos como envíos exitosos (confirmado probando con una key inválida:
  // Resend devolvió 401 y aun así la promesa se resolvió) — hay que revisar
  // el campo `error` de cada resultado resuelto, no solo si la promesa
  // truena.
  const resultados = await Promise.allSettled(
    [...porProfesional.values()].map(async ({ profesional, citas }) => {
      const html = construirHtmlRecordatorio(
        profesional.nombre,
        fechaTexto,
        citas.map((c) => ({
          hora: c.hora_inicio.slice(0, 5),
          paciente: c.pacientes ? nombreCompleto(c.pacientes) : "—",
          sede: c.consultorios?.sedes?.nombre ?? "—",
          tratamiento: c.tipos_tratamiento?.nombre ?? "—",
          observaciones: c.motivo ?? "—",
        })),
      );
      const { error: errorEnvio } = await cliente.emails.send({
        from: REMITENTE_CORREO,
        to: profesional.email,
        subject: `Tus citas de mañana, ${fechaTexto}`,
        html,
      });
      if (errorEnvio) throw errorEnvio;
    }),
  );

  const fallidos = resultados.filter((r) => r.status === "rejected").length;
  for (const r of resultados) {
    if (r.status === "rejected") console.error("[recordatorios] Falló el envío:", r.reason);
  }

  return {
    fecha,
    profesionales: porProfesional.size,
    enviados: resultados.length - fallidos,
    fallidos,
  };
}
