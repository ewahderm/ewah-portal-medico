// Reglas de las cuentas de dinero y del asistente de arranque (FC1). Pura:
// la usan las acciones de servidor y los formularios. La BD (0089) vuelve
// a validar todo.

import { MONEDAS, TIPOS_CUENTA, type Moneda, type TipoCuenta } from "@/lib/finanzas/constantes";

export type CuentaEntrada = {
  nombre: string;
  tipo: string;
  moneda: string;
  // Lo que digita el usuario. En la tarjeta del socio es lo que la clínica
  // le debe (positivo); se guarda negativo porque es un pasivo.
  saldo: number;
  socioIndice?: number | null;
};

export type SocioEntrada = {
  nombre: string;
  numeroIdentificacion: string;
  porcentaje: number | null;
};

export const NO_DISPONIBLES: readonly TipoCuenta[] = ["pasarela", "tarjeta_socio"];

export function esTipoCuenta(v: string): v is TipoCuenta {
  return TIPOS_CUENTA.some((t) => t.value === v);
}

export function esMoneda(v: string): v is Moneda {
  return MONEDAS.some((m) => m.value === v);
}

export function requierePro(tipo: TipoCuenta): boolean {
  return TIPOS_CUENTA.find((t) => t.value === tipo)?.pro ?? false;
}

// Saldo que se guarda en la BD a partir de lo que el usuario digitó.
export function saldoParaGuardar(tipo: TipoCuenta, saldo: number): number {
  return tipo === "tarjeta_socio" ? -Math.abs(saldo) : saldo;
}

// Lo que se muestra al usuario: la deuda con el socio en positivo.
export function saldoParaMostrar(tipo: TipoCuenta, saldo: number): number {
  return tipo === "tarjeta_socio" ? Math.abs(saldo) : saldo;
}

export function validarCuenta(c: CuentaEntrada, opciones: { gestion: boolean; socios: number }): string | null {
  const nombre = c.nombre.trim();
  if (nombre.length < 2 || nombre.length > 60) return "Ponle un nombre a la cuenta (de 2 a 60 caracteres).";
  if (!esTipoCuenta(c.tipo)) return `"${nombre}": tipo de cuenta inválido.`;
  if (!esMoneda(c.moneda)) return `"${nombre}": moneda inválida.`;
  if (c.moneda !== "COP" && c.tipo !== "efectivo") return `"${nombre}": solo el efectivo puede estar en dólares o euros.`;
  if (requierePro(c.tipo) && !opciones.gestion) return `"${nombre}": las cuentas de pasarela y de tarjeta de socio son del plan Pro.`;
  if (!Number.isFinite(c.saldo) || Math.abs(c.saldo) > 1e13) return `"${nombre}": el saldo no es un número válido.`;
  if (c.tipo !== "banco" && c.tipo !== "tarjeta_socio" && c.saldo < 0) return `"${nombre}": el saldo no puede ser negativo.`;
  if (c.tipo === "tarjeta_socio") {
    if (c.saldo < 0) return `"${nombre}": escribe lo que se le debe al socio como un valor positivo.`;
    if (c.socioIndice === null || c.socioIndice === undefined || c.socioIndice < 0 || c.socioIndice >= opciones.socios) {
      return `"${nombre}": elige de qué socio es la tarjeta.`;
    }
  }
  return null;
}

export function validarSocio(s: SocioEntrada): string | null {
  const nombre = s.nombre.trim();
  if (nombre.length < 3 || nombre.length > 200) return "Escribe el nombre completo del socio.";
  if (!/^[0-9A-Za-z-]{3,20}$/.test(s.numeroIdentificacion.trim())) return `${nombre}: número de identificación inválido.`;
  if (s.porcentaje !== null && !(s.porcentaje > 0 && s.porcentaje <= 100)) return `${nombre}: la participación debe ser mayor que 0 y hasta 100 %.`;
  return null;
}

// Validación por paso del asistente; validarAsistente las combina.
export function validarFechaInicio(fecha: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elige la fecha de inicio.";
  if (fecha > hoy) return "La fecha de inicio no puede ser futura.";
  if (fecha < "2000-01-01") return "La fecha de inicio es demasiado antigua.";
  return null;
}

export function validarSocios(socios: SocioEntrada[], gestion: boolean): string | null {
  if (socios.length > 20) return "Demasiados socios.";
  if (socios.length > 0 && !gestion) return "Los socios son del plan Pro.";
  for (const s of socios) {
    const e = validarSocio(s);
    if (e) return e;
  }
  const ids = socios.map((s) => s.numeroIdentificacion.trim());
  if (new Set(ids).size !== ids.length) return "Hay dos socios con la misma identificación.";
  const total = socios.reduce((t, s) => t + (s.porcentaje ?? 0), 0);
  if (total > 100) return "La participación de los socios suma más del 100 %.";
  return null;
}

export function validarCuentas(cuentas: CuentaEntrada[], opciones: { gestion: boolean; socios: number }): string | null {
  if (cuentas.length === 0) return "Agrega al menos una cuenta.";
  if (cuentas.length > 30) return "Demasiadas cuentas.";
  for (const c of cuentas) {
    const e = validarCuenta(c, opciones);
    if (e) return e;
  }
  const nombres = cuentas.map((c) => c.nombre.trim().toLowerCase());
  if (new Set(nombres).size !== nombres.length) return "Hay dos cuentas con el mismo nombre.";
  return null;
}

export function validarAsistente(
  entrada: { fechaInicio: string; hoy: string; cuentas: CuentaEntrada[]; socios: SocioEntrada[] },
  gestion: boolean,
): string | null {
  return (
    validarFechaInicio(entrada.fechaInicio, entrada.hoy) ??
    validarSocios(entrada.socios, gestion) ??
    validarCuentas(entrada.cuentas, { gestion, socios: entrada.socios.length })
  );
}

export type CuentaConSaldo = { id: string; nombre: string; tipo: TipoCuenta; moneda: Moneda; saldo: number; socio_id: string | null };

export type ResumenCuentas = {
  disponible: Record<Moneda, number>;
  porAbonar: number;
  deudaSocios: number;
  deudaPorSocio: Map<string, number>;
};

// Totales del tablero. La pasarela es plata por llegar y la tarjeta del
// socio es deuda: ninguna cuenta como disponible.
export function resumirCuentas(cuentas: CuentaConSaldo[]): ResumenCuentas {
  const r: ResumenCuentas = { disponible: { COP: 0, USD: 0, EUR: 0 }, porAbonar: 0, deudaSocios: 0, deudaPorSocio: new Map() };
  for (const c of cuentas) {
    if (c.tipo === "pasarela") r.porAbonar += c.saldo;
    else if (c.tipo === "tarjeta_socio") {
      const deuda = Math.max(0, -c.saldo);
      r.deudaSocios += deuda;
      if (c.socio_id) r.deudaPorSocio.set(c.socio_id, (r.deudaPorSocio.get(c.socio_id) ?? 0) + deuda);
    } else r.disponible[c.moneda] += c.saldo;
  }
  return r;
}
