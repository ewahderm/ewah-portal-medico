// Lectura del reporte de transacciones de una pasarela de pago (FC4+). Todo
// aquí es puro (sin red ni archivos) para poder probarlo: el navegador lee el
// archivo y entrega filas, y esto las convierte en pagos validados.
//
// Hoy hay un formato: el reporte de transacciones de Bold. Otra pasarela se
// agrega como un perfil nuevo (columnas → pago) sin tocar el resto.

export type PagoPasarela = {
  id_externo: string;
  // Hora local de Colombia, "YYYY-MM-DD HH:mm:ss", tal cual el reporte.
  pagado_en: string;
  estado_externo: string;
  exitoso: boolean;
  compra: number;
  propina: number;
  valor_total: number;
  // Parte porcentual + parte fija (IVA incluido).
  comision: number;
  retefuente: number;
  reteica: number;
  reteiva: number;
  total_deduccion: number;
  deposito: number;
  tipo_tarjeta: string | null;
  franquicia: string | null;
  pais_tarjeta: string | null;
  canal: string | null;
  metodo: string | null;
  autorizacion: string | null;
  referencia: string | null;
};

export type ErrorFila = { fila: number; mensaje: string };

export type Lectura =
  | { ok: true; perfil: string; pagos: PagoPasarela[]; errores: ErrorFila[]; vacias: number }
  | { ok: false; error: string };

export const MAX_PAGOS_POR_REPORTE = 3000;

// ---------------------------------------------------------------- texto

// El reporte llega a veces como texto en Windows-1252 (las tildes se ven como
// "�" si se lee como UTF-8): se intenta UTF-8 estricto y, si falla, 1252.
export function decodificarTexto(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Analiza texto delimitado (tabulador, punto y coma o coma) con comillas.
export function parsearDelimitado(texto: string): string[][] {
  const muestra = texto.split(/\r?\n/).find((l) => l.trim().length > 0 && /ID\s*TRANSAC/i.test(l)) ?? texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const cuenta = (c: string) => muestra.split(c).length - 1;
  const delim = [["\t", cuenta("\t")], [";", cuenta(";")], [",", cuenta(",")]].sort((a, b) => (b[1] as number) - (a[1] as number))[0][0] as string;

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else entreComillas = false;
      } else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === delim) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda.length > 0 || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

// ---------------------------------------------------------------- valores

// "2,840,000.00", "$ 2.840.000,00", 2840000 → 2840000. null si no es un número.
export function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[$\s ]/g, "");
  if (s === "") return null;
  const negativo = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/[-()]/g, "");
  const punto = s.lastIndexOf(".");
  const coma = s.lastIndexOf(",");
  if (punto >= 0 && coma >= 0) {
    // El último separador es el decimal.
    s = punto > coma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (coma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (punto >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negativo ? -n : n;
}

const dos = (n: number) => String(n).padStart(2, "0");

// Fecha y hora a "YYYY-MM-DD HH:mm:ss". Acepta ISO, DD/MM/YYYY, el número de
// serie de Excel y un Date.
export function aFechaHora(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())} ${dos(v.getHours())}:${dos(v.getMinutes())}:${dos(v.getSeconds())}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 25569) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  let a: string, mes: string, d: string, h: string, mi: string, se: string;
  if (m) [, a, mes, d, h, mi, se] = m as unknown as string[];
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    [, d, mes, a, h, mi, se] = m as unknown as string[];
  }
  const [A, M, D, H, MI, S] = [Number(a), Number(mes), Number(d), Number(h ?? 0), Number(mi ?? 0), Number(se ?? 0)];
  if (M < 1 || M > 12 || D < 1 || D > 31 || H > 23 || MI > 59 || S > 59) return null;
  return `${A}-${dos(M)}-${dos(D)} ${dos(H)}:${dos(MI)}:${dos(S)}`;
}

// Encabezado sin tildes, en mayúsculas y solo letras y números; el "�" de un
// archivo mal codificado se descarta (COMISI�N → COMISIN).
export function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const texto = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};

// ---------------------------------------------------------------- perfiles

type Campo =
  | "id" | "fecha" | "estado" | "compra" | "propina" | "total" | "retefuente" | "reteiva" | "reteica"
  | "comisionPct" | "comisionFija" | "deduccion" | "deposito" | "tipoTarjeta" | "franquicia" | "pais"
  | "canal" | "metodo" | "autorizacion" | "referencia";

type Perfil = {
  id: string;
  nombre: string;
  // Reconoce el formato por sus encabezados.
  detecta: (encabezados: string[]) => boolean;
  // Cada campo → cómo se reconoce su encabezado (ya normalizado).
  columnas: Record<Campo, RegExp>;
  obligatorias: Campo[];
  esExitoso: (estado: string) => boolean;
};

export const PERFIL_BOLD: Perfil = {
  id: "bold",
  nombre: "Bold (reporte de transacciones)",
  detecta: (e) => e.some((h) => h.startsWith("IDTRANSACCI")) && e.some((h) => h.startsWith("DEPOSITOENCUENTA")),
  columnas: {
    id: /^IDTRANSACCI/,
    fecha: /^FECHA$/,
    estado: /^ESTADOACTUAL/,
    compra: /^VALORDELACOMPRA/,
    propina: /^PROPINA$/,
    total: /^VALORTOTAL$/,
    retefuente: /^VALORRETEFUENTE/,
    reteiva: /^VALORRETEIVA/,
    reteica: /^VALORRETEICA/,
    // "% COMISIÓN BOLD" trae el VALOR de la comisión porcentual, no el %.
    comisionPct: /^COMIS\w*BOLD$/,
    comisionFija: /^COMIS\w*BOLDFIJA$/,
    deduccion: /^TOTALDEDUCCI/,
    deposito: /^DEPOSITOENCUENTA/,
    tipoTarjeta: /^TIPOTARJETA/,
    franquicia: /^FRANQUICIA/,
    pais: /^PA\w*STARJETA$/,
    canal: /^CANALDEVENTA/,
    metodo: /^METODODEPAGO/,
    autorizacion: /^CODIGOAUTORIZACION/,
    referencia: /^REFERENCIA$/,
  },
  obligatorias: ["id", "fecha", "estado", "compra", "total", "deduccion", "deposito"],
  esExitoso: (estado) => normalizarEncabezado(estado).includes("EXITOSO"),
};

export const PERFILES: Perfil[] = [PERFIL_BOLD];

const TOLERANCIA = 0.05;

// ---------------------------------------------------------------- lectura

export function leerFilas(filas: unknown[][]): Lectura {
  // El reporte trae un título ("Ewah IPS") y filas vacías antes del encabezado.
  let inicio = -1;
  let perfil: Perfil | undefined;
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const enc = filas[i].map(normalizarEncabezado);
    const p = PERFILES.find((x) => x.detecta(enc));
    if (p) {
      inicio = i;
      perfil = p;
      break;
    }
  }
  if (inicio < 0 || !perfil) {
    return {
      ok: false,
      error: `No reconozco este archivo. Hoy se admite: ${PERFILES.map((p) => p.nombre).join(", ")}. Descarga el reporte de transacciones de la pasarela y súbelo sin editarlo.`,
    };
  }

  const encabezados = filas[inicio].map(normalizarEncabezado);
  const indice = {} as Record<Campo, number>;
  for (const campo of Object.keys(perfil.columnas) as Campo[]) {
    // La más específica gana: "COMISIONBOLDFIJA" no debe tomarse como la comisión porcentual.
    indice[campo] = encabezados.findIndex((h) => perfil.columnas[campo].test(h));
  }
  const faltan = perfil.obligatorias.filter((c) => indice[c] < 0);
  if (faltan.length) {
    return { ok: false, error: `Al reporte le faltan columnas: ${faltan.join(", ")}. Descárgalo de nuevo sin quitar columnas.` };
  }

  const pagos: PagoPasarela[] = [];
  const errores: ErrorFila[] = [];
  let vacias = 0;
  const vistos = new Set<string>();

  for (let i = inicio + 1; i < filas.length; i++) {
    const f = filas[i];
    const numFila = i + 1;
    if (!f || f.every((c) => texto(c) === null)) {
      vacias++;
      continue;
    }
    const celda = (campo: Campo) => (indice[campo] >= 0 ? f[indice[campo]] : undefined);
    const id = texto(celda("id"));
    if (!id) {
      errores.push({ fila: numFila, mensaje: "Sin ID de transacción." });
      continue;
    }
    if (vistos.has(id)) {
      errores.push({ fila: numFila, mensaje: `La transacción ${id} está repetida en el archivo.` });
      continue;
    }
    vistos.add(id);
    const pagadoEn = aFechaHora(celda("fecha"));
    if (!pagadoEn) {
      errores.push({ fila: numFila, mensaje: `${id}: la fecha no se entiende.` });
      continue;
    }
    const estado = texto(celda("estado")) ?? "";
    const exitoso = perfil.esExitoso(estado);
    const num = (campo: Campo) => aNumero(celda(campo)) ?? 0;
    const compra = num("compra");
    const valorTotal = num("total");
    const comision = Math.round((num("comisionPct") + num("comisionFija")) * 100) / 100;
    const pago: PagoPasarela = {
      id_externo: id,
      pagado_en: pagadoEn,
      estado_externo: estado,
      exitoso,
      compra,
      propina: num("propina"),
      valor_total: valorTotal,
      comision: exitoso ? comision : 0,
      retefuente: exitoso ? num("retefuente") : 0,
      reteica: exitoso ? num("reteica") : 0,
      reteiva: exitoso ? num("reteiva") : 0,
      total_deduccion: exitoso ? num("deduccion") : 0,
      deposito: exitoso ? num("deposito") : 0,
      tipo_tarjeta: texto(celda("tipoTarjeta")),
      franquicia: texto(celda("franquicia")),
      pais_tarjeta: texto(celda("pais")),
      canal: texto(celda("canal")),
      metodo: texto(celda("metodo")),
      autorizacion: texto(celda("autorizacion")),
      referencia: texto(celda("referencia")),
    };
    if (exitoso) {
      if (compra <= 0) {
        errores.push({ fila: numFila, mensaje: `${id}: el valor de la compra no es válido.` });
        continue;
      }
      const sumaPartes = pago.comision + pago.retefuente + pago.reteica + pago.reteiva;
      if (Math.abs(pago.total_deduccion - sumaPartes) > TOLERANCIA) {
        errores.push({ fila: numFila, mensaje: `${id}: la comisión y las retenciones no suman el total deducido.` });
        continue;
      }
      if (Math.abs(pago.valor_total - pago.total_deduccion - pago.deposito) > TOLERANCIA) {
        errores.push({ fila: numFila, mensaje: `${id}: el valor total menos lo deducido no es lo depositado.` });
        continue;
      }
    }
    pagos.push(pago);
  }

  if (pagos.length === 0 && errores.length === 0) return { ok: false, error: "El reporte no trae pagos." };
  if (pagos.length > MAX_PAGOS_POR_REPORTE) {
    return { ok: false, error: `El reporte trae ${pagos.length} pagos: súbelo por partes (máximo ${MAX_PAGOS_POR_REPORTE}).` };
  }
  return { ok: true, perfil: perfil.id, pagos, errores, vacias };
}

export type ResumenLectura = { total: number; exitosos: number; fallidos: number; bruto: number; comision: number; retenciones: number; deposito: number };

export function resumirPagos(pagos: PagoPasarela[]): ResumenLectura {
  const ok = pagos.filter((p) => p.exitoso);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    total: pagos.length,
    exitosos: ok.length,
    fallidos: pagos.length - ok.length,
    bruto: r(ok.reduce((s, p) => s + p.compra, 0)),
    comision: r(ok.reduce((s, p) => s + p.comision, 0)),
    retenciones: r(ok.reduce((s, p) => s + p.retefuente + p.reteica + p.reteiva, 0)),
    deposito: r(ok.reduce((s, p) => s + p.deposito, 0)),
  };
}
