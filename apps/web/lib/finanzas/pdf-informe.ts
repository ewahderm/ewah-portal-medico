"use client";

// PDF del informe de flujo de efectivo (FC6), armado en el navegador con
// pdf-lib (como los desprendibles de RRHH).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatoDinero } from "@/lib/finanzas/dinero";
import type { Informe } from "@/lib/finanzas/informe";

type Datos = {
  titulo: string;
  desde: string;
  hasta: string;
  sede: string | null;
  informe: Informe;
  saldoInicial: number | null;
  saldoFinal: number | null;
  efecto: number | null;
};

// Las fuentes estándar de PDF solo traen WinAnsi: se quitan caracteres
// fuera de ese juego (el "−" tipográfico, por ejemplo).
const texto = (t: string) => t.replace(/[−–]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\u2018\u2019\u201C\u201D\u2026]/g, "");

export async function descargarInformePdf(d: Datos) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([595, 842]);
  let y = 800;
  const margen = 48;
  const ancho = 595 - margen * 2;

  const nuevaPagina = () => {
    page = doc.addPage([595, 842]);
    y = 800;
  };
  const linea = (izq: string, der: string | null, f: PDFFont = fuente, tam = 10, sangria = 0) => {
    if (y < 60) nuevaPagina();
    // Una línea por renglón: lo que no cabe se corta con "...".
    const maxIzq = ancho - 140 - sangria;
    let t0 = texto(izq);
    if (der !== null && f.widthOfTextAtSize(t0, tam) > maxIzq) {
      while (t0.length > 1 && f.widthOfTextAtSize(`${t0}...`, tam) > maxIzq) t0 = t0.slice(0, -1);
      t0 = `${t0}...`;
    }
    page.drawText(t0, { x: margen + sangria, y, size: tam, font: f, maxWidth: der === null ? ancho : undefined });
    if (der !== null) {
      const t = texto(der);
      page.drawText(t, { x: margen + ancho - f.widthOfTextAtSize(t, tam), y, size: tam, font: f });
    }
    y -= tam + 6;
  };
  const separador = () => {
    page.drawLine({ start: { x: margen, y: y + 4 }, end: { x: margen + ancho, y: y + 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 4;
  };

  linea(`Flujo de efectivo - ${d.titulo}`, null, negrita, 16);
  linea(`Del ${d.desde} al ${d.hasta}${d.sede ? ` - sede ${d.sede}` : ""}. Metodo directo, por actividades (NIIF para Pymes, seccion 7).`, null, fuente, 9);
  y -= 6;
  if (d.saldoInicial !== null) linea("Efectivo al inicio del periodo", formatoDinero(d.saldoInicial), negrita);
  for (const b of d.informe.bloques) {
    y -= 4;
    linea(b.titulo, null, negrita, 11);
    for (const r of b.entradas) linea(r.nombre, formatoDinero(r.valor), fuente, 10, 12);
    for (const r of b.salidas) linea(r.nombre, formatoDinero(-r.valor), fuente, 10, 12);
    if (!b.entradas.length && !b.salidas.length) linea("Sin movimientos", null, fuente, 10, 12);
    separador();
    linea(`Efectivo neto de ${b.titulo.replace("Actividades de ", "")}`, formatoDinero(b.neto), negrita);
  }
  y -= 4;
  linea("Aumento (disminucion) neto del efectivo", formatoDinero(d.informe.variacion), negrita);
  if (d.efecto) linea("Efecto de la tasa de cambio en las divisas", formatoDinero(d.efecto));
  if (d.saldoFinal !== null) linea("Efectivo al final del periodo", formatoDinero(d.saldoFinal), negrita);
  y -= 10;
  linea("Generado por EWAH. Informe de gestion del flujo de caja; la contabilidad formal la valida el contador.", null, fuente, 8);

  const bytes = await doc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flujo-de-efectivo-${d.desde}-a-${d.hasta}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
