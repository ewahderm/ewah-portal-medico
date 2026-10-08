// Dinero en el flujo de caja: leer lo que digita el usuario y mostrarlo en
// su moneda. Lógica pura (cliente y servidor).

import type { Moneda } from "@/lib/finanzas/constantes";

const FORMATOS = new Map<string, Intl.NumberFormat>();

function formato(moneda: Moneda, decimales: number) {
  const clave = `${moneda}-${decimales}`;
  let f = FORMATOS.get(clave);
  if (!f) {
    f = new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda, minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    FORMATOS.set(clave, f);
  }
  return f;
}

// Pesos sin decimales (como el resto de la app); USD y EUR con 2.
export function formatoDinero(valor: number | null | undefined, moneda: Moneda = "COP"): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return formato(moneda, moneda === "COP" ? 0 : 2).format(valor);
}

/**
 * Lee un monto como lo escribe la gente en Colombia: "12.000.000",
 * "12000000", "1.250,50", "$ 300", "1,5" o "-350.000". Los puntos son de
 * miles salvo que sean el único separador seguido de 1 o 2 dígitos
 * ("12.5" = 12,5). Devuelve null si no es un número válido o tiene más de
 * 2 decimales.
 */
export function leerMonto(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  let t = String(texto).replace(/[\s$]/g, "").replace(/COP|USD|EUR/gi, "");
  if (!t) return null;
  let signo = 1;
  if (t.startsWith("-")) {
    signo = -1;
    t = t.slice(1);
  }
  if (!/^[0-9.,]+$/.test(t)) return null;
  const comas = (t.match(/,/g) ?? []).length;
  const puntos = (t.match(/\./g) ?? []).length;
  let entero: string;
  let decimal = "";
  if (comas > 1) return null;
  if (comas === 1) {
    [entero, decimal] = t.split(",");
    if (puntos > 0 && !/^\d{1,3}(\.\d{3})+$/.test(entero)) return null;
    entero = entero.replace(/\./g, "");
  } else if (puntos === 1 && /^\d+\.\d{1,2}$/.test(t)) {
    [entero, decimal] = t.split(".");
  } else if (puntos > 0) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return null;
    entero = t.replace(/\./g, "");
  } else {
    entero = t;
  }
  if (!entero || decimal.length > 2 || !/^\d*$/.test(decimal)) return null;
  const n = Number(`${entero}.${decimal || "0"}`);
  return Number.isFinite(n) ? signo * n : null;
}

// Porcentaje como "60", "33,33", "33.33" o "50 %": hasta 2 decimales, con
// coma o punto decimal (aquí el punto nunca es de miles).
export function leerPorcentaje(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").replace(/[\s%]/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}
