// Correo diario de alertas de habilitación (§4.4 pasos 3 y 4). Puro: arma
// los grupos por semáforo y el HTML; el envío y el registro de lo avisado
// viven en alertas.ts. Todo texto variable se escapa.

import { escapeHtml } from "@/lib/texto";
import { UMBRALES_SEMAFORO } from "@/lib/habilitacion/semaforo";

export type ObjetoAlerta = "ocurrencia" | "documento_version" | "plan_mejora" | "extintor" | "grupo";

// Una fila de fn_hab_alertas_pendientes.
export type ItemAlerta = {
  objeto_tipo: ObjetoAlerta;
  objeto_id: string;
  umbrales: number[];
  fecha: string;
  dias: number;
  titulo: string;
  detalle: string | null;
  ruta: string;
  portal_url: string | null;
  dia_no_habil: boolean;
  obligacion_id: string | null;
  correo_adicional: string | null;
};

export type GrupoSemaforo = { semaforo: "rojo" | "ambar" | "verde"; titulo: string; items: ItemAlerta[] };

const COLORES = {
  rojo: { fondo: "#fef2f2", texto: "#b91c1c", borde: "#fecaca" },
  ambar: { fondo: "#fffbeb", texto: "#b45309", borde: "#fde68a" },
  verde: { fondo: "#f0fdf4", texto: "#15803d", borde: "#bbf7d0" },
} as const;

export function semaforoDeDias(dias: number): GrupoSemaforo["semaforo"] {
  return dias <= UMBRALES_SEMAFORO.rojo ? "rojo" : dias <= UMBRALES_SEMAFORO.ambar ? "ambar" : "verde";
}

export function etiquetaDias(dias: number): string {
  if (dias < 0) return `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "Vence hoy";
  return `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
}

// Rojo primero; dentro de cada grupo, por fecha (la más urgente arriba).
export function agruparPorSemaforo(items: ItemAlerta[]): GrupoSemaforo[] {
  const grupos: GrupoSemaforo[] = [
    { semaforo: "rojo", titulo: "Vencido o en los próximos 7 días", items: [] },
    { semaforo: "ambar", titulo: "En los próximos 30 días", items: [] },
    { semaforo: "verde", titulo: "Con tiempo", items: [] },
  ];
  for (const it of [...items].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo))) {
    grupos.find((g) => g.semaforo === semaforoDeDias(it.dias))!.items.push(it);
  }
  return grupos.filter((g) => g.items.length > 0);
}

// Correos aparte para los contadores externos: cada dirección recibe SOLO
// los ítems de su obligación (no se le expone el resto del estado).
export function itemsPorCorreoAdicional(items: ItemAlerta[]): Map<string, ItemAlerta[]> {
  const mapa = new Map<string, ItemAlerta[]>();
  for (const it of items) {
    const correo = it.correo_adicional?.trim().toLowerCase();
    if (!correo) continue;
    mapa.set(correo, [...(mapa.get(correo) ?? []), it]);
  }
  return mapa;
}

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

export function asuntoAlertas(items: ItemAlerta[]): string {
  const rojos = items.filter((i) => semaforoDeDias(i.dias) === "rojo").length;
  return rojos > 0
    ? `Habilitación: ${rojos} pendiente${rojos === 1 ? "" : "s"} urgente${rojos === 1 ? "" : "s"}`
    : `Habilitación: ${items.length} fecha${items.length === 1 ? "" : "s"} por atender`;
}

export function construirHtmlAlertasHabilitacion({
  nombreClinica,
  items,
  baseUrl,
  externo = false,
}: {
  nombreClinica: string;
  items: ItemAlerta[];
  baseUrl: string;
  // Contador externo: sin enlaces a EWAH (no tiene cuenta).
  externo?: boolean;
}): string {
  const base = baseUrl.replace(/\/$/, "");
  const grupos = agruparPorSemaforo(items)
    .map((g) => {
      const c = COLORES[g.semaforo];
      const filas = g.items
        .map((it) => {
          const enlaces = [
            externo ? null : `<a href="${escapeHtml(base + it.ruta)}" style="color:#0097B7;">Ver en EWAH</a>`,
            it.portal_url ? `<a href="${escapeHtml(it.portal_url)}" style="color:#0097B7;">Portal oficial</a>` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return `
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
              <div style="font-size: 14px; font-weight: 600; color: #0D1825;">${escapeHtml(it.titulo)}</div>
              ${it.detalle ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">${escapeHtml(it.detalle)}</div>` : ""}
              ${it.dia_no_habil ? `<div style="font-size: 12px; color: #b45309; margin-top: 2px;">Cae en día no hábil: preséntalo antes (la fecha no se corre).</div>` : ""}
              ${enlaces ? `<div style="font-size: 12px; margin-top: 4px;">${enlaces}</div>` : ""}
            </td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; white-space: nowrap; text-align: right;">
              <div style="font-size: 13px; font-weight: 700; color: ${c.texto};">${escapeHtml(etiquetaDias(it.dias))}</div>
              <div style="font-size: 12px; color: #64748b;">${escapeHtml(fechaLarga(it.fecha))}</div>
            </td>
          </tr>`;
        })
        .join("");
      return `
        <div style="margin: 0 0 20px; border: 1px solid ${c.borde}; border-radius: 10px; overflow: hidden;">
          <div style="background-color: ${c.fondo}; padding: 10px 14px; font-size: 13px; font-weight: 700; color: ${c.texto};">
            ${escapeHtml(g.titulo)} (${g.items.length})
          </div>
          <table style="width: 100%; border-collapse: collapse;">${filas}</table>
        </div>`;
    })
    .join("");

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background-color: #f4f7f9; padding: 24px;">
    <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background-color: #0D1825; padding: 20px 24px;">
        <span style="font-size: 20px; font-weight: 700; color: #ffffff;">ewah</span>
        <span style="font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #00C9EC; margin-left: 6px;">TECH</span>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #0D1825; margin: 0 0 6px;">
          Fechas de habilitación de <strong>${escapeHtml(nombreClinica)}</strong> que necesitan tu atención:
        </p>
        <p style="font-size: 12px; color: #64748b; margin: 0 0 20px;">
          EWAH no radica nada ante las entidades: te recuerda las fechas. Las fechas límite son las de la norma y no se corren por festivos.
        </p>
        ${grupos}
      </div>
      <div style="padding: 16px 24px; background-color: #f4f7f9; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          ${externo ? `Recibes este aviso porque ${escapeHtml(nombreClinica)} te registró como contacto de esta obligación.` : `Te avisamos una sola vez por cada plazo (días antes configurados en Habilitación → Obligaciones).`}
        </p>
      </div>
    </div>
  </div>`;
}
