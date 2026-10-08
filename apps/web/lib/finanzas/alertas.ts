import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, construirRemitente } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import { asuntoAlertas, construirHtmlAlertasHabilitacion, type TextosCorreo } from "@/lib/habilitacion/correo-alertas";
import { aItemCorreo, type ItemAlertaSst } from "@/lib/sst/alertas";

type Resultado = { clinicas: number; enviados: number; fallidos: number; avisos: number };

export const TEXTOS_FINANZAS: TextosCorreo = {
  intro: "Flujo de caja de",
  nota: "Pendientes del flujo de caja: cobros de la pasarela sin abonar, deudas con socios, el cierre del mes anterior e ingresos por revisar.",
  pie: "Te avisamos una sola vez por cada pendiente (los ingresos por revisar, una vez por semana). Revísalos en Flujo de caja.",
};

/**
 * Alertas diarias del flujo de caja (FC6, plan Pro). Por cada clínica con
 * el flujo de caja activado:
 *   1. pendientes no avisados (fn_fin_alertas_pendientes, 0098);
 *   2. un correo a los usuarios de nivel 1 o con finanzas/APPROVE;
 *   3. si Resend lo aceptó, registra lo avisado en fin_alertas_enviadas.
 * Nunca lanza (mismo criterio que las de SG-SST).
 */
export async function enviarAlertasFinanzas(): Promise<Resultado> {
  const cliente = getResendClient();
  if (!cliente) {
    console.warn("[alertas-finanzas] RESEND_API_KEY no está configurada — no se envió nada.");
    return { clinicas: 0, enviados: 0, fallidos: 0, avisos: 0 };
  }
  const admin = createAdminClient();
  const { data: lista, error } = await admin.rpc("fn_fin_clinicas_alertas");
  if (error) {
    console.error("[alertas-finanzas] No se pudieron leer las clínicas:", error.message);
    return { clinicas: 0, enviados: 0, fallidos: 1, avisos: 0 };
  }
  const ids = ((lista ?? []) as { clinica_id: string }[]).map((c) => c.clinica_id);
  if (ids.length === 0) return { clinicas: 0, enviados: 0, fallidos: 0, avisos: 0 };

  const { data: clinicas } = await admin.from("clinicas").select("id, nombre, nombre_comercial").in("id", ids);
  const nombres = new Map((clinicas ?? []).map((c) => [c.id as string, (c.nombre_comercial || c.nombre) as string]));
  const base = siteUrl();
  let enviados = 0;
  let fallidos = 0;
  let avisos = 0;

  for (const clinicaId of ids) {
    try {
      const [itemsRes, destRes] = await Promise.all([
        admin.rpc("fn_fin_alertas_pendientes", { p_clinica_id: clinicaId }),
        admin.rpc("fn_fin_destinatarios", { p_clinica_id: clinicaId }),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (destRes.error) throw destRes.error;
      const items = (itemsRes.data ?? []) as ItemAlertaSst[];
      const para = [...new Set(((destRes.data ?? []) as { email: string }[]).map((d) => d.email))];
      if (items.length === 0 || para.length === 0) continue;

      const nombreClinica = nombres.get(clinicaId) ?? "Tu clínica";
      const { error: errorEnvio } = await cliente.emails.send({
        from: construirRemitente(nombreClinica),
        to: para,
        subject: asuntoAlertas(items, "Flujo de caja"),
        html: construirHtmlAlertasHabilitacion({ nombreClinica, items: items.map(aItemCorreo), baseUrl: base, textos: TEXTOS_FINANZAS }),
      });
      if (errorEnvio) {
        fallidos++;
        console.error(`[alertas-finanzas] Resend rechazó el correo de ${clinicaId}:`, errorEnvio.message);
        continue;
      }
      enviados++;
      const filas = items.flatMap((it) =>
        it.umbrales.map((umbral) => ({
          clinica_id: clinicaId,
          objeto_tipo: it.objeto_tipo,
          objeto_id: it.objeto_id,
          umbral_dias: umbral,
          destinatarios: para,
          proveedor_id: "resend",
        })),
      );
      const { error: errorRegistro } = await admin
        .from("fin_alertas_enviadas")
        .upsert(filas, { onConflict: "objeto_tipo,objeto_id,umbral_dias", ignoreDuplicates: true });
      if (errorRegistro) console.error(`[alertas-finanzas] No se registró lo avisado de ${clinicaId}:`, errorRegistro.message);
      else avisos += filas.length;
    } catch (e) {
      fallidos++;
      console.error(`[alertas-finanzas] Falló la clínica ${clinicaId}:`, e instanceof Error ? e.message : e);
    }
  }
  return { clinicas: ids.length, enviados, fallidos, avisos };
}
