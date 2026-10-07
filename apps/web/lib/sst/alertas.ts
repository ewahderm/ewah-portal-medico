import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, construirRemitente } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import { asuntoAlertas, construirHtmlAlertasHabilitacion, type ItemAlerta, type TextosCorreo } from "@/lib/habilitacion/correo-alertas";

type Resultado = { clinicas: number; enviados: number; fallidos: number; avisos: number };

// Una fila de fn_sst_alertas_pendientes (0079).
export type ItemAlertaSst = {
  objeto_tipo: string;
  objeto_id: string;
  umbrales: number[];
  fecha: string;
  dias: number;
  titulo: string;
  detalle: string | null;
  ruta: string;
};

export const TEXTOS_SST: TextosCorreo = {
  intro: "Plazos del SG-SST de",
  nota: "EWAH no reporta ante la ARL, la EPS ni el Ministerio: te recuerda los plazos. El reporte de un accidente vence a los 2 días hábiles y la investigación a los 15 días.",
  pie: "Te avisamos una sola vez por cada plazo. Revisa el estado completo en SG-SST → Diagnóstico.",
};

// Al formato del correo compartido con Habilitación (sin portal ni contador).
export function aItemCorreo(it: ItemAlertaSst): ItemAlerta {
  return { ...it, portal_url: null, dia_no_habil: false, obligacion_id: null, correo_adicional: null };
}

/**
 * Alertas diarias del SG-SST (F8). Por cada clínica con el módulo:
 *   1. ítems con un umbral alcanzado y NO avisado (fn_sst_alertas_pendientes;
 *      lo de gestión solo si el plan lo incluye);
 *   2. un correo a los usuarios con sst/VIEW o nivel 1;
 *   3. si Resend lo aceptó, registra cada (objeto, umbral) en
 *      sst_alertas_enviadas; si no, mañana se reintenta.
 * Nunca lanza (mismo criterio que las de RRHH y Habilitación).
 */
export async function enviarAlertasSst(): Promise<Resultado> {
  const cliente = getResendClient();
  if (!cliente) {
    console.warn("[alertas-sst] RESEND_API_KEY no está configurada — no se envió nada.");
    return { clinicas: 0, enviados: 0, fallidos: 0, avisos: 0 };
  }
  const admin = createAdminClient();
  const { data: lista, error } = await admin.rpc("fn_sst_clinicas_alertas");
  if (error) {
    console.error("[alertas-sst] No se pudieron leer las clínicas:", error.message);
    return { clinicas: 0, enviados: 0, fallidos: 1, avisos: 0 };
  }
  const clinicasSst = (lista ?? []) as { clinica_id: string; gestion: boolean }[];
  if (clinicasSst.length === 0) return { clinicas: 0, enviados: 0, fallidos: 0, avisos: 0 };

  const { data: clinicas } = await admin.from("clinicas").select("id, nombre, nombre_comercial").in("id", clinicasSst.map((c) => c.clinica_id));
  const nombres = new Map((clinicas ?? []).map((c) => [c.id as string, (c.nombre_comercial || c.nombre) as string]));
  const base = siteUrl();
  let enviados = 0;
  let fallidos = 0;
  let avisos = 0;

  for (const { clinica_id: clinicaId, gestion } of clinicasSst) {
    try {
      const [itemsRes, destRes] = await Promise.all([
        admin.rpc("fn_sst_alertas_pendientes", { p_clinica_id: clinicaId, p_gestion: gestion }),
        admin.rpc("fn_sst_destinatarios", { p_clinica_id: clinicaId }),
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
        subject: asuntoAlertas(items, "SG-SST"),
        html: construirHtmlAlertasHabilitacion({ nombreClinica, items: items.map(aItemCorreo), baseUrl: base, textos: TEXTOS_SST }),
      });
      if (errorEnvio) {
        fallidos++;
        console.error(`[alertas-sst] Resend rechazó el correo de ${clinicaId}:`, errorEnvio.message);
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
        .from("sst_alertas_enviadas")
        .upsert(filas, { onConflict: "objeto_tipo,objeto_id,umbral_dias", ignoreDuplicates: true });
      if (errorRegistro) console.error(`[alertas-sst] No se registró lo avisado de ${clinicaId}:`, errorRegistro.message);
      else avisos += filas.length;
    } catch (e) {
      fallidos++;
      console.error(`[alertas-sst] Falló la clínica ${clinicaId}:`, e instanceof Error ? e.message : e);
    }
  }
  return { clinicas: clinicasSst.length, enviados, fallidos, avisos };
}
