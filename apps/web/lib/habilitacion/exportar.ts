// Exportar una autoevaluación cerrada (F10): Excel y PDF de la foto, tal
// como quedó (resumen y detalle congelados; no se recalcula nada). Puro: el
// Route Handler lee los datos y decide el acceso (solo administrador).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ColumnaXlsx } from "@/lib/exportar/xlsx";
import { ESTADOS_DECLARACION, ESTADOS_EVALUACION, ESTANDARES, MOTIVOS_AUTOEVALUACION, etiquetaDe } from "@/lib/habilitacion/constantes";
import { fechaColombiaDe, fechaLegible } from "@/lib/habilitacion/ruta";
import type { Autoevaluacion, DetalleAutoevaluacion, EvidenciaFoto } from "@/lib/habilitacion/tipos";

const ORIGENES: Record<DetalleAutoevaluacion["origen"], string> = {
  directo: "Del servicio",
  transversal: "Transversal (11.1)",
  remision: "Por remisión",
  autorresuelto: "Se cumple con 11.1",
  encabezado: "Encabezado",
};

export type DatosExportacion = {
  clinica: { nombre: string; nit: string | null };
  autoevaluacion: Autoevaluacion;
  detalle: DetalleAutoevaluacion[];
  nombres: Record<string, string>;
};

function porcentaje(t: Autoevaluacion["resumen"]["totales"]): string {
  const base = t.cumple + t.no_cumple + t.pendientes;
  return base === 0 ? "—" : `${Math.round((t.cumple / base) * 100)} %`;
}

export function describirEvidencia(e: EvidenciaFoto): string {
  if (e.tipo === "archivo") return `Archivo: ${e.nombre_archivo ?? e.descripcion}`;
  if (e.tipo === "enlace") return `Enlace: ${e.url ?? ""}`;
  if (e.tipo === "registro_modulo") return `${e.resumen?.titulo ?? e.descripcion}${e.resumen?.detalle ? ` — ${e.resumen.detalle}` : ""}`;
  if (e.tipo === "documento_normativo") {
    return e.protocolo ? `Protocolo: ${e.protocolo.nombre} v${e.protocolo.version}` : `Protocolo: ${e.descripcion}`;
  }
  return `Nota: ${e.descripcion}`;
}

// ============================================================
// Excel
// ============================================================
// SheetJS escribe cada texto como celda de tipo texto (t: "s"), nunca como
// fórmula: un "=HYPERLINK(...)" escrito por un usuario se ve literal en
// Excel y no se ejecuta (lo verifica la prueba de exportar).
export function hojasXlsx(d: DatosExportacion): { nombre: string; columnas: ColumnaXlsx[]; filas: Record<string, unknown>[] }[] {
  const a = d.autoevaluacion;
  const t = a.resumen.totales;
  const resumen = [
    ["Clínica", d.clinica.nombre],
    ["NIT", d.clinica.nit ?? ""],
    ["Autoevaluación", a.nombre],
    ["Motivo", etiquetaDe(MOTIVOS_AUTOEVALUACION, a.motivo)],
    ["Cerrada el", fechaColombiaDe(a.fecha_cierre)],
    ["Cerrada por", d.nombres[a.cerrado_por] ?? ""],
    ["Declarada en el REPS", a.fecha_declaracion_reps ?? "Sin registrar"],
    ["Estado", a.anulado ? `Anulada: ${a.anulado_motivo ?? ""}` : "Vigente"],
    ["Criterios en la foto", a.resumen.criterios],
    ["Evaluables", t.evaluables],
    ["Cumple", t.cumple],
    ["No cumple", t.no_cumple],
    ["No aplica", t.no_aplica],
    ["Pendiente", t.pendientes],
    ["Cumplimiento", porcentaje(t)],
  ].map(([campo, valor]) => ({ campo, valor }));

  const servicios = a.resumen.servicios.map((s) => ({
    sede: s.sede,
    servicio: `${s.servicio_clave} ${s.servicio}`,
    estado: etiquetaDe(ESTADOS_DECLARACION, s.estado),
    cumple: s.cumple,
    no_cumple: s.no_cumple,
    no_aplica: s.no_aplica,
    pendientes: s.pendientes,
  }));

  const criterios = d.detalle.map((c) => ({
    sede: c.sede_nombre,
    servicio: c.servicio_clave,
    estandar: etiquetaDe(ESTANDARES, c.estandar_codigo),
    codigo: c.criterio_codigo,
    estado: etiquetaDe(ESTADOS_EVALUACION, c.estado),
    origen: ORIGENES[c.origen] ?? c.origen,
    remitido_desde: c.remitido_desde_codigo ?? "",
    texto: c.texto_literal,
    justificacion: c.justificacion ?? "",
    verificado_el: c.fecha_verificacion ?? "",
    verificado_por: c.evaluado_por ? (d.nombres[c.evaluado_por] ?? "") : "",
    evidencias: (c.evidencias ?? []).map(describirEvidencia).join("\n"),
  }));

  return [
    { nombre: "Resumen", columnas: [{ header: "Campo", key: "campo" }, { header: "Valor", key: "valor" }], filas: resumen },
    {
      nombre: "Servicios",
      columnas: [
        { header: "Sede", key: "sede" },
        { header: "Servicio", key: "servicio" },
        { header: "Estado de declaración", key: "estado" },
        { header: "Cumple", key: "cumple" },
        { header: "No cumple", key: "no_cumple" },
        { header: "No aplica", key: "no_aplica" },
        { header: "Pendiente", key: "pendientes" },
      ],
      filas: servicios,
    },
    {
      nombre: "Criterios",
      columnas: [
        { header: "Sede", key: "sede" },
        { header: "Servicio", key: "servicio" },
        { header: "Estándar", key: "estandar" },
        { header: "Código", key: "codigo" },
        { header: "Estado", key: "estado" },
        { header: "Origen", key: "origen" },
        { header: "Remitido desde", key: "remitido_desde" },
        { header: "Texto de la norma", key: "texto" },
        { header: "Justificación", key: "justificacion" },
        { header: "Verificado el", key: "verificado_el" },
        { header: "Verificado por", key: "verificado_por" },
        { header: "Evidencias", key: "evidencias" },
      ],
      filas: criterios,
    },
  ];
}

// ============================================================
// PDF
// ============================================================
// Las fuentes estándar de PDF solo codifican WinAnsi: un "≥" o un emoji en
// el texto de la norma o de una justificación haría fallar todo el PDF. Se
// traducen los conocidos y el resto se reemplaza, carácter por carácter.
const EQUIVALENTES: Record<string, string> = { "≥": ">=", "≤": "<=", "≠": "!=", "→": "->", "←": "<-", "✓": "v", "✗": "x", "\t": " " };

export function crearSanitizador(font: PDFFont) {
  const cache = new Map<string, string>();
  return (texto: string): string => {
    let out = "";
    for (const ch of texto.replace(/\r\n?/g, "\n")) {
      let r = cache.get(ch);
      if (r === undefined) {
        r = EQUIVALENTES[ch] ?? ch;
        try {
          font.encodeText(r);
        } catch {
          r = "?";
        }
        cache.set(ch, r);
      }
      out += r;
    }
    return out;
  };
}

export function partirEnLineas(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual) lineas.push(actual);
      // Palabra más ancha que la línea (una URL): se corta a la fuerza.
      let resto = palabra;
      while (font.widthOfTextAtSize(resto, size) > ancho) {
        let n = resto.length;
        while (n > 1 && font.widthOfTextAtSize(resto.slice(0, n), size) > ancho) n--;
        lineas.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      actual = resto;
    }
    lineas.push(actual);
  }
  return lineas;
}

const MARGEN = 48;
const COLOR_TEXTO = rgb(0.05, 0.09, 0.15);
const COLOR_SUAVE = rgb(0.39, 0.45, 0.55);
const COLOR_ESTADO = {
  cumple: rgb(0.08, 0.5, 0.24),
  no_cumple: rgb(0.73, 0.11, 0.11),
  no_aplica: COLOR_SUAVE,
  pendiente: COLOR_SUAVE,
} as const;

export async function construirPdfAutoevaluacion(d: DatosExportacion): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const limpiar = crearSanitizador(font);
  const a = d.autoevaluacion;
  doc.setTitle(limpiar(a.nombre));
  doc.setCreator("EWAH");

  let page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const ancho = width - MARGEN * 2;
  let y = height - MARGEN;

  const nuevaPagina = () => {
    page = doc.addPage([595.28, 841.89]);
    y = height - MARGEN;
  };
  const asegurar = (alto: number) => {
    if (y - alto < MARGEN + 16) nuevaPagina();
  };
  const escribir = (texto: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; w?: number; gap?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.f ?? font;
    const x = opts.x ?? MARGEN;
    const lineas = partirEnLineas(limpiar(texto), f, size, opts.w ?? ancho - (x - MARGEN));
    for (const l of lineas) {
      asegurar(size + 3);
      page.drawText(l, { x, y: y - size, size, font: f, color: opts.color ?? COLOR_TEXTO });
      y -= size + 3;
    }
    y -= opts.gap ?? 0;
  };

  // Encabezado
  escribir(d.clinica.nombre, { size: 13, f: bold });
  if (d.clinica.nit) escribir(`NIT ${d.clinica.nit}`, { color: COLOR_SUAVE, gap: 6 });
  escribir(`Autoevaluación de las condiciones de habilitación — ${a.nombre}`, { size: 12, f: bold, gap: 2 });
  escribir(
    [
      etiquetaDe(MOTIVOS_AUTOEVALUACION, a.motivo),
      `cerrada el ${fechaLegible(fechaColombiaDe(a.fecha_cierre))}`,
      d.nombres[a.cerrado_por] ? `por ${d.nombres[a.cerrado_por]}` : null,
      a.fecha_declaracion_reps ? `declarada en el REPS el ${fechaLegible(a.fecha_declaracion_reps)}` : "sin fecha de declaración en el REPS",
    ]
      .filter(Boolean)
      .join(" · "),
    { color: COLOR_SUAVE },
  );
  if (a.anulado) escribir(`ANULADA: ${a.anulado_motivo ?? ""}`, { f: bold, color: COLOR_ESTADO.no_cumple });
  y -= 6;

  const t = a.resumen.totales;
  escribir(
    `Cumplimiento ${porcentaje(t)} · ${t.cumple} cumple · ${t.no_cumple} no cumple · ${t.no_aplica} no aplica · ${t.pendientes} pendientes · ${a.resumen.criterios} criterios en total`,
    { size: 10, f: bold, gap: 8 },
  );

  escribir("Servicios", { size: 11, f: bold, gap: 2 });
  for (const s of a.resumen.servicios) {
    escribir(`${s.servicio_clave} ${s.servicio} (${s.sede}): ${etiquetaDe(ESTADOS_DECLARACION, s.estado)}`, {
      color: s.estado === "con_incumplimientos" ? COLOR_ESTADO.no_cumple : COLOR_TEXTO,
    });
  }
  if (a.servicios_no_aptos.length > 0) {
    escribir("Al cerrar se confirmó que los servicios con incumplimientos o criterios sin evaluar no se podían declarar en el REPS.", { color: COLOR_SUAVE });
  }
  y -= 8;

  // Detalle: sede → estándar → criterio.
  let sedeActual = "";
  let estandarActual = "";
  const ordenEstandar = (c: string) => ESTANDARES.findIndex((e) => e.value === c);
  const filas = [...d.detalle].sort(
    (x, z) =>
      x.sede_nombre.localeCompare(z.sede_nombre) ||
      ordenEstandar(x.estandar_codigo) - ordenEstandar(z.estandar_codigo) ||
      x.servicio_clave.localeCompare(z.servicio_clave, "es", { numeric: true }) ||
      x.criterio_codigo.localeCompare(z.criterio_codigo, "es", { numeric: true }),
  );
  for (const c of filas) {
    if (c.sede_nombre !== sedeActual) {
      sedeActual = c.sede_nombre;
      estandarActual = "";
      asegurar(40);
      y -= 4;
      escribir(`Sede: ${c.sede_nombre}`, { size: 11, f: bold, gap: 2 });
    }
    if (c.estandar_codigo !== estandarActual) {
      estandarActual = c.estandar_codigo;
      asegurar(30);
      escribir(etiquetaDe(ESTANDARES, c.estandar_codigo), { size: 10, f: bold, color: rgb(0, 0.38, 0.47), gap: 2 });
    }
    asegurar(24);
    const estado = etiquetaDe(ESTADOS_EVALUACION, c.estado);
    const origen = c.origen === "directo" ? "" : ` · ${ORIGENES[c.origen]}${c.remitido_desde_codigo ? ` desde ${c.remitido_desde_codigo}` : ""}`;
    escribir(`${c.criterio_codigo} · ${estado}${origen}`, { f: bold, color: COLOR_ESTADO[c.estado] });
    escribir(c.texto_literal, { size: 8, x: MARGEN + 8 });
    if (c.justificacion) escribir(`Justificación: ${c.justificacion}`, { size: 8, x: MARGEN + 8, color: COLOR_SUAVE });
    for (const e of c.evidencias ?? []) escribir(`Evidencia: ${describirEvidencia(e)}`, { size: 8, x: MARGEN + 8, color: COLOR_SUAVE });
    y -= 4;
  }

  // Pie con número de página.
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawText(limpiar(`${a.nombre} · página ${i + 1} de ${paginas.length}`), {
      x: MARGEN,
      y: MARGEN / 2,
      size: 7,
      font,
      color: COLOR_SUAVE,
    });
  });

  return doc.save();
}
