import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { construirLibroXlsx } from "@/lib/exportar/xlsx";
import { construirPdfAutoevaluacion, crearSanitizador, hojasXlsx, partirEnLineas, type DatosExportacion } from "@/lib/habilitacion/exportar";
import type { Autoevaluacion, DetalleAutoevaluacion } from "@/lib/habilitacion/tipos";

const ae: Autoevaluacion = {
  id: "a",
  nombre: "Autoevaluación 2026",
  motivo: "renovacion_anual",
  fecha_cierre: "2026-10-08T01:30:00Z", // 7 oct 8:30 p. m. en Bogotá
  cerrado_por: "u1",
  fecha_declaracion_reps: null,
  confirmo_servicios_no_aptos: true,
  servicios_no_aptos: [{ sede: "Principal", servicio_clave: "11.2.2", servicio: "Consulta externa", no_cumple: 1 }],
  resumen: {
    totales: { evaluables: 3, cumple: 1, no_cumple: 1, no_aplica: 0, pendientes: 1 },
    estandares: [{ estandar_codigo: "talento_humano", cumple: 1, no_cumple: 1, no_aplica: 0, pendientes: 1 }],
    sedes: [],
    servicios: [
      { sede_id: "s", sede: "Principal", servicio_clave: "11.2.2", servicio: "Consulta externa", evaluables: 3, cumple: 1, no_cumple: 1, no_aplica: 0, pendientes: 1, estado: "con_incumplimientos" },
    ],
    criterios: 2,
    fecha: "2026-10-07",
  },
  ocurrencia_id: null,
  anulado: false,
  anulado_motivo: null,
  anulado_en: null,
};

const det = (p: Partial<DetalleAutoevaluacion>): DetalleAutoevaluacion => ({
  sede_id: "s",
  criterio_id: crypto.randomUUID(),
  sede_nombre: "Principal",
  servicio_clave: "11.1",
  estandar_codigo: "talento_humano",
  criterio_codigo: "11.1.TH.1",
  texto_literal: "Texto",
  estado: "cumple",
  origen: "transversal",
  remitido_desde_codigo: null,
  justificacion: null,
  evaluado_por: "u1",
  fecha_verificacion: "2026-10-01",
  evidencias: [],
  ...p,
});

const datos = (detalle: DetalleAutoevaluacion[]): DatosExportacion => ({
  clinica: { nombre: "EWAH", nit: "900" },
  autoevaluacion: ae,
  detalle,
  nombres: { u1: "Dra. Pinzón" },
});

describe("exportar autoevaluación (F10)", () => {
  it("Excel: tres hojas, fecha de cierre en hora de Colombia y sin fórmulas ejecutables", async () => {
    const hojas = hojasXlsx(
      datos([det({ justificacion: '=HYPERLINK("http://malo","clic")', evidencias: [{ tipo: "nota", descripcion: "+cmd", nombre_archivo: null, url: null, fuente: null, resumen: null, protocolo: null, creada_en: "" }] })]),
    );
    expect(hojas.map((h) => h.nombre)).toEqual(["Resumen", "Servicios", "Criterios"]);
    expect(hojas[0].filas.find((f) => f.campo === "Cerrada el")?.valor).toBe("2026-10-07");
    expect(hojas[0].filas.find((f) => f.campo === "Cumplimiento")?.valor).toBe("33 %");

    const blob = construirLibroXlsx(hojas);
    const libro = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array", cellFormula: true });
    const ws = libro.Sheets.Criterios;
    const celdas = Object.entries(ws).filter(([k]) => !k.startsWith("!")) as [string, XLSX.CellObject][];
    const peligrosa = celdas.find(([, c]) => String(c.v).startsWith("=HYPERLINK"));
    expect(peligrosa?.[1].t).toBe("s");
    expect(celdas.every(([, c]) => !c.f)).toBe(true);
  });

  it("PDF: se genera aunque el texto traiga caracteres fuera de WinAnsi", async () => {
    const bytes = await construirPdfAutoevaluacion(
      datos([
        det({ texto_literal: "Temperatura ≥ 2 °C y ≤ 8 °C → registrar ✓ 🧪 " + "palabra ".repeat(200), estado: "no_cumple" }),
        det({ criterio_codigo: "11.2.2.TH.1", origen: "remision", remitido_desde_codigo: "11.1.TH.1", estado: "pendiente" }),
      ]),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("sanitiza y parte líneas sin pasarse del ancho", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const limpiar = crearSanitizador(font);
    expect(limpiar("a ≥ b 🧪 ñ")).toBe("a >= b ? ñ");
    const lineas = partirEnLineas(`${"x".repeat(300)} corto\nsegundo párrafo`, font, 9, 100);
    expect(lineas.every((l) => font.widthOfTextAtSize(l, 9) <= 100)).toBe(true);
    expect(lineas.at(-1)).toBe("segundo párrafo");
  });
});
