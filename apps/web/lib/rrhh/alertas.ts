import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, construirRemitente } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/texto";

const VENTANA_DIAS = 30;

type Alerta = { tipo: string; descripcion: string; urgente: boolean };

function construirHtmlAlertas(nombreClinica: string, alertas: Alerta[]): string {
  const filas = alertas
    .map(
      (a, i) => `
        <tr style="background-color: ${i % 2 === 0 ? "#ffffff" : "#f4f7f9"};">
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: ${a.urgente ? "#dc2626" : "#0097B7"};">${escapeHtml(a.tipo)}</td>
          <td style="padding: 10px 14px; font-size: 14px; color: #0D1825;">${escapeHtml(a.descripcion)}</td>
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
        <p style="font-size: 15px; color: #0D1825; margin: 0 0 20px;">
          Alertas de Recursos Humanos de <strong>${escapeHtml(nombreClinica)}</strong>:
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #00C9EC;">
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase;">Tipo</th>
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #0D1825; text-transform: uppercase;">Detalle</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div style="padding: 16px 24px; background-color: #f4f7f9; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">Equipo de ${escapeHtml(nombreClinica)}</p>
      </div>
    </div>
  </div>`;
}

/**
 * Revisa, por clínica: vacunas vencidas/por vencer y contratos a término
 * fijo próximos a vencer. El plazo de reporte de accidentes a la ARL lo
 * avisa SG-SST (lib/sst/alertas.ts, con festivos y una vez por plazo).
 * Un correo diario por clínica al/los administrador(es), nunca lanza
 * (mismo criterio que enviarRecordatoriosCitasManana).
 *
 * Los exámenes ocupacionales periódicos también los avisa SG-SST (según
 * la periodicidad del profesiograma).
 */
export async function enviarAlertasRrhh(): Promise<{ clinicas: number; enviados: number; fallidos: number }> {
  const cliente = getResendClient();
  if (!cliente) {
    console.warn("[alertas-rrhh] RESEND_API_KEY no está configurada — no se envió nada.");
    return { clinicas: 0, enviados: 0, fallidos: 0 };
  }

  const admin = createAdminClient();
  const hoy = format(new Date(), "yyyy-MM-dd");
  const limite = format(addDays(new Date(), VENTANA_DIAS), "yyyy-MM-dd");

  const [vacunasRes, contratosRes, adminsRes] = await Promise.all([
    admin
      .from("documentos_empleado")
      .select("fecha_vencimiento, nombre_personalizado, tipo_vacuna_id, empleados!inner(id, nombre, clinica_id, activo), tipos_vacuna(nombre)")
      .eq("tipo", "vacuna")
      .not("fecha_vencimiento", "is", null)
      .lte("fecha_vencimiento", limite)
      .eq("empleados.activo", true),
    admin
      .from("empleados")
      .select("id, nombre, clinica_id, fecha_fin_contrato")
      .eq("activo", true)
      .not("fecha_fin_contrato", "is", null)
      .gte("fecha_fin_contrato", hoy)
      .lte("fecha_fin_contrato", limite),
    admin
      .from("usuarios")
      .select("email, clinica_id, roles!inner(nivel)")
      .eq("activo", true)
      .eq("roles.nivel", 1),
  ]);

  const porClinica = new Map<string, { nombreClinica: string; alertas: Alerta[] }>();

  function entrada(clinicaId: string, nombreClinica: string) {
    let e = porClinica.get(clinicaId);
    if (!e) {
      e = { nombreClinica, alertas: [] };
      porClinica.set(clinicaId, e);
    }
    return e;
  }

  for (const v of vacunasRes.data ?? []) {
    const emp = v.empleados as unknown as { id: string; nombre: string; clinica_id: string } | null;
    if (!emp) continue;
    const vencida = v.fecha_vencimiento! < hoy;
    const nombreVacuna = (v.tipos_vacuna as unknown as { nombre: string } | null)?.nombre ?? "Vacuna";
    entrada(emp.clinica_id, "").alertas.push({
      tipo: vencida ? "Vacuna vencida" : "Vacuna por vencer",
      descripcion: `${emp.nombre} — ${nombreVacuna} (vence ${v.fecha_vencimiento})`,
      urgente: vencida,
    });
  }

  for (const c of contratosRes.data ?? []) {
    entrada(c.clinica_id, "").alertas.push({
      tipo: "Contrato por vencer",
      descripcion: `${c.nombre} — contrato termina el ${c.fecha_fin_contrato}`,
      urgente: false,
    });
  }

  const emailsAdminPorClinica = new Map<string, string[]>();
  for (const u of adminsRes.data ?? []) {
    if (!u.email) continue;
    const lista = emailsAdminPorClinica.get(u.clinica_id) ?? [];
    lista.push(u.email);
    emailsAdminPorClinica.set(u.clinica_id, lista);
  }

  // Nombre comercial por clínica, para el encabezado del correo.
  const clinicaIds = [...porClinica.keys()];
  const { data: clinicas } = clinicaIds.length
    ? await admin.from("clinicas").select("id, nombre, nombre_comercial").in("id", clinicaIds)
    : { data: [] };
  for (const c of clinicas ?? []) {
    const e = porClinica.get(c.id);
    if (e) e.nombreClinica = c.nombre_comercial || c.nombre;
  }

  const resultados = await Promise.allSettled(
    [...porClinica.entries()].map(async ([clinicaId, { nombreClinica, alertas }]) => {
      const emails = emailsAdminPorClinica.get(clinicaId);
      if (!emails?.length || alertas.length === 0) return;
      const html = construirHtmlAlertas(nombreClinica, alertas);
      const { error } = await cliente.emails.send({
        from: construirRemitente(nombreClinica),
        to: emails,
        subject: `Alertas de RRHH — ${format(new Date(), "d 'de' MMMM", { locale: es })}`,
        html,
      });
      if (error) throw error;
    }),
  );

  const fallidos = resultados.filter((r) => r.status === "rejected").length;
  for (const r of resultados) {
    if (r.status === "rejected") console.error("[alertas-rrhh] Falló el envío:", r.reason);
  }

  return { clinicas: porClinica.size, enviados: resultados.length - fallidos, fallidos };
}
