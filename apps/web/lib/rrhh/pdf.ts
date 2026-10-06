"use client";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatoMoneda } from "@/lib/format";

type ClinicaInfo = {
  nombre: string;
  nombreComercial: string | null;
  nit: string;
  telefonoContacto: string | null;
  logoUrl: string | null;
};

type EmpleadoInfo = {
  nombre: string;
  identificacion: string | null;
};

function descargarBytes(bytes: Uint8Array, nombreArchivo: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

async function construirEncabezado(doc: PDFDocument, page: PDFPage, font: PDFFont, fontBold: PDFFont, clinica: ClinicaInfo, titulo: string) {
  const { height, width } = page.getSize();
  let y = height - 50;

  if (clinica.logoUrl) {
    try {
      const resp = await fetch(clinica.logoUrl);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const contentType = resp.headers.get("content-type") ?? "";
      const imagen = contentType.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const escala = Math.min(100 / imagen.width, 40 / imagen.height);
      page.drawImage(imagen, {
        x: 50,
        y: y - imagen.height * escala,
        width: imagen.width * escala,
        height: imagen.height * escala,
      });
    } catch {
      // Logo no disponible o formato no soportado (SVG/WebP) — el PDF se
      // genera igual, solo con el nombre de la clínica en texto.
    }
  }

  const nombreMostrado = clinica.nombreComercial || clinica.nombre;
  page.drawText(nombreMostrado, { x: 160, y, size: 13, font: fontBold, color: rgb(0.05, 0.09, 0.15) });
  y -= 16;
  page.drawText(`NIT ${clinica.nit}`, { x: 160, y, size: 9, font, color: rgb(0.21, 0.24, 0.29) });
  if (clinica.telefonoContacto) {
    y -= 12;
    page.drawText(clinica.telefonoContacto, { x: 160, y, size: 9, font, color: rgb(0.21, 0.24, 0.29) });
  }

  y = height - 100;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;
  page.drawText(titulo, { x: 50, y, size: 14, font: fontBold, color: rgb(0.05, 0.09, 0.15) });
  return y - 28;
}

function drawFila(page: PDFPage, font: PDFFont, y: number, etiqueta: string, valor: string, opts?: { bold?: PDFFont; destacado?: boolean }) {
  const f = opts?.destacado && opts.bold ? opts.bold : font;
  const size = opts?.destacado ? 11 : 10;
  page.drawText(etiqueta, { x: 50, y, size, font: f, color: rgb(0.15, 0.17, 0.2) });
  page.drawText(valor, { x: 380, y, size, font: f, color: rgb(0.15, 0.17, 0.2) });
  return y - (opts?.destacado ? 20 : 16);
}

function drawSeccion(page: PDFPage, fontBold: PDFFont, y: number, titulo: string) {
  page.drawText(titulo, { x: 50, y, size: 10, font: fontBold, color: rgb(0, 0.15, 0.18) });
  return y - 18;
}

export async function generarPdfComprobanteNomina(datos: {
  clinica: ClinicaInfo;
  empleado: EmpleadoInfo;
  comprobante: {
    tipo_periodo: string;
    fecha_inicio: string;
    fecha_fin: string;
    salario_base: number;
    auxilio_transporte: number;
    comisiones: number;
    deduccion_salud: number;
    deduccion_pension: number;
    aporte_patronal_salud: number;
    aporte_patronal_pension: number;
    aporte_arl: number;
    aporte_parafiscales: number;
    retencion_fuente: number;
    otras_deducciones: number;
    neto_pagar: number;
    aprobado: boolean;
    aprobado_en: string | null;
  };
}) {
  const { clinica, empleado, comprobante: c } = datos;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = await construirEncabezado(doc, page, font, fontBold, clinica, "Comprobante de pago de nómina");

  y = drawFila(page, font, y, "Empleado", empleado.nombre);
  y = drawFila(page, font, y, "Identificación", empleado.identificacion ?? "—");
  y = drawFila(page, font, y, "Período", `${c.tipo_periodo === "quincenal" ? "Quincenal" : "Mensual"} · ${c.fecha_inicio} a ${c.fecha_fin}`);
  y -= 10;

  y = drawSeccion(page, fontBold, y, "DEVENGADO");
  y = drawFila(page, font, y, "Salario básico", formatoMoneda(c.salario_base));
  y = drawFila(page, font, y, "Auxilio de transporte", formatoMoneda(c.auxilio_transporte));
  if (c.comisiones) y = drawFila(page, font, y, "Comisiones", formatoMoneda(c.comisiones));
  const totalDevengado = c.salario_base + c.auxilio_transporte + c.comisiones;
  y = drawFila(page, font, y, "Total devengado", formatoMoneda(totalDevengado), { bold: fontBold, destacado: true });
  y -= 14;

  y = drawSeccion(page, fontBold, y, "DEDUCCIONES");
  y = drawFila(page, font, y, "Salud (4%)", formatoMoneda(c.deduccion_salud));
  y = drawFila(page, font, y, "Pensión (4%)", formatoMoneda(c.deduccion_pension));
  if (c.retencion_fuente) y = drawFila(page, font, y, "Retención en la fuente", formatoMoneda(c.retencion_fuente));
  if (c.otras_deducciones) y = drawFila(page, font, y, "Otras deducciones", formatoMoneda(c.otras_deducciones));
  const totalDeducciones = c.deduccion_salud + c.deduccion_pension + c.retencion_fuente + c.otras_deducciones;
  y = drawFila(page, font, y, "Total deducciones", formatoMoneda(totalDeducciones), { bold: fontBold, destacado: true });
  y -= 18;

  page.drawRectangle({ x: 45, y: y - 6, width: 505, height: 26, color: rgb(0.0, 0.79, 0.93), opacity: 0.15 });
  y = drawFila(page, fontBold, y, "NETO A PAGAR", formatoMoneda(c.neto_pagar), { bold: fontBold, destacado: true });
  y -= 24;

  y = drawSeccion(page, fontBold, y, "APORTES PATRONALES (informativo, a cargo de la clínica)");
  y = drawFila(page, font, y, "Salud", formatoMoneda(c.aporte_patronal_salud));
  y = drawFila(page, font, y, "Pensión", formatoMoneda(c.aporte_patronal_pension));
  y = drawFila(page, font, y, "ARL", formatoMoneda(c.aporte_arl));
  y = drawFila(page, font, y, "Parafiscales", formatoMoneda(c.aporte_parafiscales));
  y -= 20;

  page.drawText(
    c.aprobado && c.aprobado_en
      ? `Comprobante aprobado el ${new Date(c.aprobado_en).toLocaleDateString("es-CO")}`
      : "BORRADOR — pendiente de aprobación",
    { x: 50, y, size: 9, font: fontBold, color: c.aprobado ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.35, 0) },
  );

  const bytes = await doc.save();
  descargarBytes(bytes, `nomina-${empleado.nombre.replace(/\s+/g, "-")}-${c.fecha_inicio}.pdf`);
}

export async function generarPdfComprobanteHonorarios(datos: {
  clinica: ClinicaInfo;
  empleado: EmpleadoInfo;
  comprobante: {
    fecha_inicio: string;
    fecha_fin: string;
    valor_bruto: number;
    declarante_renta: boolean;
    tarifa_retencion: number;
    retencion_fuente: number;
    neto_pagar: number;
    requiere_factura_electronica: boolean;
    aprobado: boolean;
    aprobado_en: string | null;
  };
}) {
  const { clinica, empleado, comprobante: c } = datos;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = await construirEncabezado(doc, page, font, fontBold, clinica, "Comprobante de pago de honorarios");

  y = drawFila(page, font, y, "Contratista", empleado.nombre);
  y = drawFila(page, font, y, "Identificación", empleado.identificacion ?? "—");
  y = drawFila(page, font, y, "Período", `${c.fecha_inicio} a ${c.fecha_fin}`);
  y = drawFila(page, font, y, "Declarante de renta", c.declarante_renta ? "Sí" : "No");
  y -= 10;

  y = drawSeccion(page, fontBold, y, "DETALLE");
  y = drawFila(page, font, y, "Valor bruto pactado", formatoMoneda(c.valor_bruto));
  y = drawFila(page, font, y, `Retención en la fuente (${c.tarifa_retencion}%)`, formatoMoneda(c.retencion_fuente));
  y -= 18;

  page.drawRectangle({ x: 45, y: y - 6, width: 505, height: 26, color: rgb(0.0, 0.79, 0.93), opacity: 0.15 });
  y = drawFila(page, fontBold, y, "NETO A PAGAR", formatoMoneda(c.neto_pagar), { bold: fontBold, destacado: true });
  y -= 24;

  if (c.requiere_factura_electronica) {
    page.drawText("Este contratista superó el umbral DIAN de facturación electrónica obligatoria este año.", {
      x: 50,
      y,
      size: 9,
      font,
      color: rgb(0.7, 0.35, 0),
    });
    y -= 16;
  }

  page.drawText(
    c.aprobado && c.aprobado_en
      ? `Comprobante aprobado el ${new Date(c.aprobado_en).toLocaleDateString("es-CO")}`
      : "BORRADOR — pendiente de aprobación",
    { x: 50, y, size: 9, font: fontBold, color: c.aprobado ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.35, 0) },
  );

  const bytes = await doc.save();
  descargarBytes(bytes, `honorarios-${empleado.nombre.replace(/\s+/g, "-")}-${c.fecha_inicio}.pdf`);
}
