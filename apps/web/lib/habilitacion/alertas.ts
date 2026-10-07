import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, construirRemitente } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import {
  asuntoAlertas,
  CONFLICTO_ALERTAS_ENVIADAS,
  construirHtmlAlertasHabilitacion,
  filasAlertasEnviadas,
  itemsAvisados,
  itemsPorCorreoAdicional,
  type ItemAlerta,
} from "@/lib/habilitacion/correo-alertas";

const PAUSA_ENTRE_CORREOS_MS = 600;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Un reintento si Resend responde 429 (límite de solicitudes). Devuelve el
// error final o null si salió. Resend no rechaza la promesa: devuelve { error }.
async function enviarConReintento(
  enviar: () => PromiseLike<{ error: { message: string; statusCode?: number | null; name?: string } | null }>,
): Promise<{ message: string } | null> {
  let r = await enviar();
  if (r.error && (r.error.statusCode === 429 || r.error.name === "rate_limit_exceeded")) {
    await pausa(1500);
    r = await enviar();
  }
  return r.error;
}

type Resultado = { clinicas: number; enviados: number; fallidos: number; avisos: number };

/**
 * Alertas diarias de habilitación (§4.4), solo clínicas con el feature
 * `gestion` (Gratis no recibe correo; la insignia del menú sí la ven todos).
 * Por clínica:
 *   1. regenera las ocurrencias (ventana deslizante de 18 meses);
 *   2. lee los ítems con un umbral de aviso alcanzado y NO avisado
 *      (fn_hab_alertas_pendientes: si un día falla, al siguiente sale);
 *   3. un correo a los usuarios con habilitacion/VIEW o nivel 1 y, aparte,
 *      uno por cada correo adicional (contador) con SOLO su obligación;
 *   4. registra en hab_alertas_enviadas cada (objeto, umbral, fecha objetivo)
 *      SOLO si el correo del EQUIPO salió (el del contador externo es aparte
 *      y no basta). Resend no rechaza la promesa: devuelve `{ error }` — con
 *      error no se registra nada y se reintenta mañana.
 * Nunca lanza (mismo criterio que enviarAlertasRrhh).
 */
export async function enviarAlertasHabilitacion(): Promise<Resultado> {
  const cliente = getResendClient();
  if (!cliente) {
    console.warn("[alertas-habilitacion] RESEND_API_KEY no está configurada — no se envió nada.");
    return { clinicas: 0, enviados: 0, fallidos: 0, avisos: 0 };
  }

  const admin = createAdminClient();
  const { data: clinicasGestion, error } = await admin.rpc("fn_hab_clinicas_con_gestion");
  if (error) {
    console.error("[alertas-habilitacion] No se pudieron leer las clínicas:", error.message);
    return { clinicas: 0, enviados: 0, fallidos: 1, avisos: 0 };
  }
  const ids = ((clinicasGestion ?? []) as unknown[]).map((x) =>
    typeof x === "string" ? x : (x as { fn_hab_clinicas_con_gestion: string }).fn_hab_clinicas_con_gestion,
  );
  if (ids.length === 0) return { clinicas: 0, enviados: 0, fallidos: 0, avisos: 0 };

  const { data: clinicas } = await admin.from("clinicas").select("id, nombre, nombre_comercial").in("id", ids);
  const nombres = new Map((clinicas ?? []).map((c) => [c.id as string, (c.nombre_comercial || c.nombre) as string]));
  const base = siteUrl();

  let enviados = 0;
  let fallidos = 0;
  let avisos = 0;

  // Secuencial por clínica: pocas clínicas y así no se dispara el límite de
  // Resend (2 req/s) ni se satura la BD con generadores en paralelo.
  for (const clinicaId of ids) {
    try {
      const gen = await admin.rpc("fn_hab_generar_ocurrencias", { p_clinica_id: clinicaId });
      if (gen.error) throw gen.error;

      const [itemsRes, destRes] = await Promise.all([
        admin.rpc("fn_hab_alertas_pendientes", { p_clinica_id: clinicaId }),
        admin.rpc("fn_hab_destinatarios", { p_clinica_id: clinicaId }),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (destRes.error) throw destRes.error;
      const items = (itemsRes.data ?? []) as ItemAlerta[];
      if (items.length === 0) continue;

      const nombreClinica = nombres.get(clinicaId) ?? "Tu clínica";
      const destinatarios = [...new Set(((destRes.data ?? []) as { email: string }[]).map((d) => d.email))];

      const envios: { para: string[]; items: ItemAlerta[]; externo: boolean }[] = [];
      if (destinatarios.length > 0) envios.push({ para: destinatarios, items, externo: false });
      for (const [correo, propios] of itemsPorCorreoAdicional(items)) {
        if (!destinatarios.includes(correo)) envios.push({ para: [correo], items: propios, externo: true });
      }

      let equipoEnviado = false;
      const externosEnviados = new Set<string>();
      for (const [i, e] of envios.entries()) {
        // Pausa entre correos: Resend limita a 2 solicitudes por segundo.
        if (i > 0) await pausa(PAUSA_ENTRE_CORREOS_MS);
        const errorEnvio = await enviarConReintento(() =>
          cliente.emails.send({
            from: construirRemitente(nombreClinica),
            to: e.para,
            subject: asuntoAlertas(e.items),
            html: construirHtmlAlertasHabilitacion({ nombreClinica, items: e.items, baseUrl: base, externo: e.externo }),
          }),
        );
        if (errorEnvio) {
          fallidos++;
          console.error(`[alertas-habilitacion] Resend rechazó el correo de ${clinicaId}:`, errorEnvio.message);
          continue;
        }
        enviados++;
        if (e.externo) externosEnviados.add(e.para[0]);
        else equipoEnviado = true;
      }

      // Solo se registra lo que llegó al EQUIPO (itemsAvisados): si su correo
      // falló pero el del contador salió, el ítem se reintenta mañana.
      const avisados = itemsAvisados(items, { hayEquipo: destinatarios.length > 0, equipoEnviado, externosEnviados });
      const filas = filasAlertasEnviadas(clinicaId, avisados, destinatarios.length > 0 ? destinatarios : [...externosEnviados]);
      if (filas.length > 0) {
        // ignoreDuplicates: si dos corridas se cruzan, la segunda no falla.
        const { error: errorRegistro } = await admin
          .from("hab_alertas_enviadas")
          .upsert(filas, { onConflict: CONFLICTO_ALERTAS_ENVIADAS, ignoreDuplicates: true });
        if (errorRegistro) console.error(`[alertas-habilitacion] No se registró lo avisado de ${clinicaId}:`, errorRegistro.message);
        else avisos += filas.length;
      }
    } catch (e) {
      fallidos++;
      console.error(`[alertas-habilitacion] Falló la clínica ${clinicaId}:`, e instanceof Error ? e.message : e);
    }
  }

  return { clinicas: ids.length, enviados, fallidos, avisos };
}
