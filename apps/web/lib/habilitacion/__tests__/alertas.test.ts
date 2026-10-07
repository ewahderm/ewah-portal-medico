import { describe, expect, it } from "vitest";
import {
  agruparPorSemaforo,
  asuntoAlertas,
  CONFLICTO_ALERTAS_ENVIADAS,
  construirHtmlAlertasHabilitacion,
  etiquetaDias,
  filasAlertasEnviadas,
  itemsAvisados,
  itemsPorCorreoAdicional,
  semaforoDeDias,
  type ItemAlerta,
} from "@/lib/habilitacion/correo-alertas";
import { escapeHtml } from "@/lib/texto";

const item = (p: Partial<ItemAlerta>): ItemAlerta => ({
  objeto_tipo: "ocurrencia",
  objeto_id: crypto.randomUUID(),
  umbrales: [30],
  fecha: "2026-11-01",
  dias: 25,
  titulo: "Reporte",
  detalle: null,
  ruta: "/habilitacion/calendario",
  portal_url: null,
  dia_no_habil: false,
  obligacion_id: null,
  correo_adicional: null,
  ...p,
});

describe("correo de alertas de habilitación (F9)", () => {
  it("semáforo con los mismos umbrales del calendario", () => {
    expect(semaforoDeDias(-3)).toBe("rojo");
    expect(semaforoDeDias(7)).toBe("rojo");
    expect(semaforoDeDias(8)).toBe("ambar");
    expect(semaforoDeDias(30)).toBe("ambar");
    expect(semaforoDeDias(31)).toBe("verde");
  });

  it("etiquetas en español con singular y plural", () => {
    expect(etiquetaDias(-1)).toBe("Vencido hace 1 día");
    expect(etiquetaDias(-4)).toBe("Vencido hace 4 días");
    expect(etiquetaDias(0)).toBe("Vence hoy");
    expect(etiquetaDias(1)).toBe("Vence en 1 día");
  });

  it("agrupa con el rojo primero y ordena por fecha", () => {
    const grupos = agruparPorSemaforo([
      item({ titulo: "verde", dias: 60, fecha: "2026-12-30" }),
      item({ titulo: "rojo tarde", dias: 5, fecha: "2026-10-12" }),
      item({ titulo: "ámbar", dias: 20, fecha: "2026-10-27" }),
      item({ titulo: "rojo vencido", dias: -2, fecha: "2026-10-05" }),
    ]);
    expect(grupos.map((g) => g.semaforo)).toEqual(["rojo", "ambar", "verde"]);
    expect(grupos[0].items.map((i) => i.titulo)).toEqual(["rojo vencido", "rojo tarde"]);
  });

  it("omite grupos vacíos", () => {
    expect(agruparPorSemaforo([item({ dias: 20 })]).map((g) => g.semaforo)).toEqual(["ambar"]);
  });

  it("el contador externo recibe solo los ítems de su obligación", () => {
    const mapa = itemsPorCorreoAdicional([
      item({ titulo: "IVA", correo_adicional: "Contador@X.co " }),
      item({ titulo: "RIPS" }),
      item({ titulo: "ICA", correo_adicional: "contador@x.co" }),
    ]);
    expect([...mapa.keys()]).toEqual(["contador@x.co"]);
    expect(mapa.get("contador@x.co")!.map((i) => i.titulo)).toEqual(["IVA", "ICA"]);
  });

  it("asunto: cuenta los urgentes", () => {
    expect(asuntoAlertas([item({ dias: 3 }), item({ dias: 20 })])).toBe("Habilitación: 1 pendiente urgente");
    expect(asuntoAlertas([item({ dias: 20 }), item({ dias: 25 })])).toBe("Habilitación: 2 fechas por atender");
  });

  it("escapa todo texto variable y no enlaza a EWAH en el correo externo", () => {
    const peligroso = item({ titulo: '<img src=x onerror="alert(1)">', detalle: "A & B", dia_no_habil: true });
    const html = construirHtmlAlertasHabilitacion({ nombreClinica: "Clínica <b>", items: [peligroso], baseUrl: "https://app.ewah.co/" });
    expect(html).not.toContain("<img");
    expect(html).toContain(escapeHtml(peligroso.titulo));
    expect(html).toContain("Clínica &lt;b&gt;");
    expect(html).toContain("https://app.ewah.co/habilitacion/calendario");
    expect(html).toContain("día no hábil");
    const externo = construirHtmlAlertasHabilitacion({ nombreClinica: "X", items: [peligroso], baseUrl: "https://app.ewah.co", externo: true });
    expect(externo).not.toContain("Ver en EWAH");
  });
});

describe("registro de lo avisado (0085)", () => {
  const items = [item({ titulo: "A", correo_adicional: "ctd@x.co" }), item({ titulo: "B" })];

  it("si el correo del equipo falla, no se registra nada aunque el contador externo lo recibiera", () => {
    const r = itemsAvisados(items, { hayEquipo: true, equipoEnviado: false, externosEnviados: new Set(["ctd@x.co"]) });
    expect(r).toEqual([]);
  });

  it("si el equipo lo recibió, se registran todos los ítems", () => {
    const r = itemsAvisados(items, { hayEquipo: true, equipoEnviado: true, externosEnviados: new Set() });
    expect(r).toHaveLength(2);
  });

  it("sin destinatarios internos, solo cuentan los ítems que recibió su contador externo", () => {
    const r = itemsAvisados(items, { hayEquipo: false, equipoEnviado: false, externosEnviados: new Set(["ctd@x.co"]) });
    expect(r.map((i) => i.titulo)).toEqual(["A"]);
    expect(itemsAvisados(items, { hayEquipo: false, equipoEnviado: false, externosEnviados: new Set() })).toEqual([]);
  });

  it("cada fila lleva la fecha objetivo y la llave de conflicto la incluye", () => {
    const filas = filasAlertasEnviadas("c1", [item({ umbrales: [30, 7], fecha: "2027-02-01" })], ["a@x.co"]);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.fecha_objetivo === "2027-02-01" && f.clinica_id === "c1")).toBe(true);
    expect(CONFLICTO_ALERTAS_ENVIADAS.split(",")).toContain("fecha_objetivo");
  });

  it("el mismo extintor con otra fecha genera filas distintas (nuevo ciclo)", () => {
    const base = { objeto_tipo: "extintor", objeto_id: "e1", umbrales: [30] };
    const a = filasAlertasEnviadas("c1", [item({ ...base, fecha: "2026-11-01" })], []);
    const b = filasAlertasEnviadas("c1", [item({ ...base, fecha: "2027-11-01" })], []);
    const llave = (f: (typeof a)[number]) => [f.objeto_tipo, f.objeto_id, f.umbral_dias, f.fecha_objetivo].join("|");
    expect(llave(a[0])).not.toBe(llave(b[0]));
  });
});
