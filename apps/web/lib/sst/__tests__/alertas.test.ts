import { describe, expect, it } from "vitest";
import { asuntoAlertas, construirHtmlAlertasHabilitacion } from "@/lib/habilitacion/correo-alertas";
import { TEXTOS_SST, aItemCorreo, type ItemAlertaSst } from "@/lib/sst/alertas";

const item = (p: Partial<ItemAlertaSst> = {}): ItemAlertaSst => ({
  objeto_tipo: "evento_reporte",
  objeto_id: "00000000-0000-0000-0000-000000000001",
  umbrales: [1],
  fecha: "2026-10-08",
  dias: 1,
  titulo: "Reportar el accidente a la ARL y la EPS (FURAT)",
  detalle: "Ana <script> · evento del 06/10/2026",
  ruta: "/sst/eventos/00000000-0000-0000-0000-000000000001",
  ...p,
});

describe("correo de alertas del SG-SST", () => {
  it("asunto con el área", () => {
    expect(asuntoAlertas([item()], "SG-SST")).toBe("SG-SST: 1 pendiente urgente");
    expect(asuntoAlertas([item({ dias: 40 }), item({ dias: 50 })], "SG-SST")).toBe("SG-SST: 2 fechas por atender");
  });
  it("usa los textos de SST, enlaza a EWAH y escapa lo variable", () => {
    const html = construirHtmlAlertasHabilitacion({ nombreClinica: "Clínica & Co", items: [aItemCorreo(item())], baseUrl: "https://app.ewah.co/", textos: TEXTOS_SST });
    expect(html).toContain("Plazos del SG-SST de");
    expect(html).not.toContain("Fechas de habilitación");
    expect(html).toContain("https://app.ewah.co/sst/eventos/");
    expect(html).toContain("Clínica &amp; Co");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Portal oficial");
  });
});
