// Socios (FC5): lógica pura de la pantalla de socios.

export type SaldoSocio = {
  socio_id: string;
  deuda_tarjeta: number;
  prestado_por_socio: number;
  prestado_a_socio: number;
  aportes: number;
  le_debemos: number;
  nos_debe: number;
};

export type OperacionSocio = "reembolso" | "prestamo_a_socio" | "prestamo_de_socio" | "socio_devuelve" | "clinica_devuelve";

export const OPERACIONES: Record<OperacionSocio, { titulo: string; boton: string; entra: boolean; ayuda: string }> = {
  reembolso: {
    titulo: "Reembolsar la tarjeta",
    boton: "Reembolsar",
    entra: false,
    ayuda: "Le pagas al socio lo que gastó con su tarjeta por la clínica. Sale de una cuenta de la clínica y baja la deuda.",
  },
  prestamo_a_socio: {
    titulo: "Prestarle al socio",
    boton: "Registrar préstamo",
    entra: false,
    ayuda: "Sale plata de la clínica hacia el socio. No es gasto: el socio la debe devolver. Sin intereses.",
  },
  prestamo_de_socio: {
    titulo: "El socio le presta a la clínica",
    boton: "Registrar préstamo",
    entra: true,
    ayuda: "Entra plata del socio. No es ingreso: la clínica se la debe devolver. Sin intereses.",
  },
  socio_devuelve: {
    titulo: "El socio devuelve el préstamo",
    boton: "Registrar devolución",
    entra: true,
    ayuda: "Entra plata: baja lo que el socio le debe a la clínica.",
  },
  clinica_devuelve: {
    titulo: "Devolverle el préstamo al socio",
    boton: "Registrar devolución",
    entra: false,
    ayuda: "Sale plata: baja lo que la clínica le debe al socio por su préstamo.",
  },
};

// Tope de la operación (null = sin tope): no se reembolsa ni devuelve de más.
export function topeOperacion(op: OperacionSocio, s: Pick<SaldoSocio, "deuda_tarjeta" | "prestado_a_socio" | "prestado_por_socio">, deudaTarjeta?: number): number | null {
  if (op === "reembolso") return Math.max(0, deudaTarjeta ?? s.deuda_tarjeta);
  if (op === "socio_devuelve") return Math.max(0, s.prestado_a_socio);
  if (op === "clinica_devuelve") return Math.max(0, s.prestado_por_socio);
  return null;
}

export function validarOperacionSocio(input: {
  monto: number | null;
  fecha: string;
  cuentaId: string | null;
  hoy: string;
  fechaInicio: string;
  tope: number | null;
}): string | null {
  if (!input.cuentaId) return "Elige la cuenta.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return "Elige la fecha.";
  if (input.fecha > input.hoy) return "La fecha no puede ser futura.";
  if (input.fecha < input.fechaInicio) return "La fecha es anterior al inicio del flujo de caja.";
  if (input.monto === null || !Number.isFinite(input.monto) || input.monto <= 0) return "Escribe el valor.";
  if (input.tope !== null && input.monto > input.tope) return "No puede ser más de lo pendiente.";
  return null;
}
