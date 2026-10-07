import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, construirRemitente } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import {
  asuntoAlertas,
  construirHtmlAlertasHabilitacion,
  itemsPorCorreoAdicional,
  type ItemAlerta,
} from "@/lib/habilitacion/correo-alertas";

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
 *   4. registra en hab_alertas_enviadas cada (objeto, umbral) de los correos
 *      que Resend aceptó. Resend no rechaza la promesa: devuelve `{ error }`
 *      — con error no se registra nada y se reintenta mañana.
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

      // Qué direcciones recibieron cada ítem (solo envíos aceptados).
      const recibidoPor = new Map<string, Set<string>>();
      const marcar = (lista: ItemAlerta[], correos: string[]) => {
        for (const it of lista) {
          const clave = `${it.objeto_tipo}:${it.objeto_id}`;
          const s = recibidoPor.get(clave) ?? new Set<string>();
          correos.forEach((c) => s.add(c));
          recibidoPor.set(clave, s);
        }
      };

      const envios: { para: string[]; items: ItemAlerta[]; externo: boolean }[] = [];
      if (destinatarios.length > 0) envios.push({ para: destinatarios, items, externo: false });
      for (const [correo, propios] of itemsPorCorreoAdicional(items)) {
        if (!destinatarios.includes(correo)) envios.push({ para: [correo], items: propios, externo: true });
      }

      for (const e of envios) {
        const { error: errorEnvio } = await cliente.emails.send({
          from: construirRemitente(nombreClinica),
          to: e.para,
          subject: asuntoAlertas(e.items),
          html: construirHtmlAlertasHabilitacion({ nombreClinica, items: e.items, baseUrl: base, externo: e.externo }),
        });
        if (errorEnvio) {
          fallidos++;
          console.error(`[alertas-habilitacion] Resend rechazó el correo de ${clinicaId}:`, errorEnvio.message);
          continue;
        }
        enviados++;
        marcar(e.items, e.para);
      }

      const filas = items.flatMap((it) => {
        const para = recibidoPor.get(`${it.objeto_tipo}:${it.objeto_id}`);
        if (!para) return [];
        return it.umbrales.map((umbral) => ({
          clinica_id: clinicaId,
          objeto_tipo: it.objeto_tipo,
          objeto_id: it.objeto_id,
          umbral_dias: umbral,
          destinatarios: [...para],
          proveedor_id: "resend",
        }));
      });
      if (filas.length > 0) {
        // ignoreDuplicates: si dos corridas se cruzan, la segunda no falla.
        const { error: errorRegistro } = await admin
          .from("hab_alertas_enviadas")
          .upsert(filas, { onConflict: "objeto_tipo,objeto_id,umbral_dias", ignoreDuplicates: true });
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
