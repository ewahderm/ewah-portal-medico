// Ingresos desde tratamientos (FC3): lógica pura que comparten la pantalla
// de cobros, el tablero y la configuración de medios de pago.

export type SituacionIngreso =
  | "por_generar"
  | "por_cobrar"
  | "sin_valor"
  | "medio_sin_cuenta"
  | "fecha_futura"
  | "anulado_con_ingreso"
  | "corregido_sin_anular"
  | "anulado_liquidado"
  | "en_flujo"
  | "excluido";

export type IngresoPendiente = {
  tratamiento_id: string;
  fecha: string;
  valor: number | null;
  situacion: SituacionIngreso;
  movimiento_id: string | null;
  medio_pago_id: string;
  medio_pago: string | null;
  tratamiento: string | null;
  // null si quien consulta no puede ver pacientes ni tratamientos.
  paciente: string | null;
  sede_id: string;
  // Solo en la vista de excluidos: por qué se decidió no meterlo.
  motivo?: string | null;
};

export const SITUACIONES: Record<SituacionIngreso, { titulo: string; ayuda: string }> = {
  por_generar: {
    titulo: "Listos para registrar",
    ayuda: "Su medio de pago ya tiene cuenta. Ponlos al día para que entren al flujo de caja.",
  },
  por_cobrar: {
    titulo: "Por cobrar",
    ayuda: "Tratamientos a crédito. Registra el cobro cuando el paciente pague.",
  },
  sin_valor: {
    titulo: "Sin valor",
    ayuda: "El tratamiento no tiene valor. Corrígelo en Tratamientos o registra aquí lo que se cobró.",
  },
  medio_sin_cuenta: {
    titulo: "Medio de pago sin cuenta",
    ayuda: "Asigna a qué cuenta llega ese medio de pago y ponlos al día, o registra el cobro de cada uno.",
  },
  fecha_futura: {
    titulo: "Con fecha futura",
    ayuda: "Entrarán cuando llegue su fecha, al poner al día.",
  },
  corregido_sin_anular: {
    titulo: "Corregidos sin anular el original",
    ayuda: "El tratamiento tiene un registro corregido pero no se anuló: los dos cuentan como ingreso. Anula el que sobra en Tratamientos.",
  },
  anulado_liquidado: {
    titulo: "Anulados con el cobro ya abonado",
    ayuda:
      "El tratamiento se anuló, pero la pasarela ya abonó ese cobro. Si devolviste la plata al paciente, registra la salida; si fue un error de la liquidación, anúlala en Bold y pon al día.",
  },
  en_flujo: {
    titulo: "Ya en el flujo",
    ayuda: "Tratamientos cuyo ingreso ya está registrado en el flujo de caja (los 200 más recientes).",
  },
  excluido: {
    titulo: "Excluidos del flujo",
    ayuda: "Tratamientos que decidiste no meter en el flujo de caja. Puedes volver a incluirlos cuando quieras.",
  },
  anulado_con_ingreso: {
    titulo: "Anulados con ingreso",
    ayuda: "El tratamiento se anuló pero su ingreso sigue registrado. Al poner al día se anula.",
  },
};

// Destino de un medio de pago en la configuración: sin asignar, crédito o
// el id de una cuenta.
export type DestinoMedio = "sin" | "credito" | string;

export function destinoDeConfig(c: { cuenta_id: string | null; es_credito: boolean } | undefined): DestinoMedio {
  if (!c) return "sin";
  if (c.es_credito) return "credito";
  return c.cuenta_id ?? "sin";
}

export function configDeDestino(destino: DestinoMedio): { cuenta_id: string | null; es_credito: boolean } {
  if (destino === "credito") return { cuenta_id: null, es_credito: true };
  if (destino === "sin" || !destino) return { cuenta_id: null, es_credito: false };
  return { cuenta_id: destino, es_credito: false };
}

export type ResumenPendientes = {
  // Lo que "Poner al día" resuelve solo.
  porGenerar: { cantidad: number; valor: number };
  anuladosConIngreso: number;
  porCobrar: { cantidad: number; valor: number };
  // Lo que pide una acción de la persona (sin valor, medio sin cuenta).
  porRevisar: number;
  fechaFutura: number;
  // Medios sin cuenta, con cuántos tratamientos y por cuánto.
  mediosSinCuenta: { medioPagoId: string; nombre: string; cantidad: number; valor: number }[];
};

export function resumirPendientes(pendientes: IngresoPendiente[]): ResumenPendientes {
  const r: ResumenPendientes = {
    porGenerar: { cantidad: 0, valor: 0 },
    anuladosConIngreso: 0,
    porCobrar: { cantidad: 0, valor: 0 },
    porRevisar: 0,
    fechaFutura: 0,
    mediosSinCuenta: [],
  };
  const medios = new Map<string, ResumenPendientes["mediosSinCuenta"][number]>();
  for (const p of pendientes) {
    const valor = p.valor ?? 0;
    switch (p.situacion) {
      case "por_generar":
        r.porGenerar.cantidad++;
        r.porGenerar.valor += valor;
        break;
      case "anulado_con_ingreso":
        r.anuladosConIngreso++;
        break;
      case "por_cobrar":
        r.porCobrar.cantidad++;
        r.porCobrar.valor += valor;
        break;
      case "fecha_futura":
        r.fechaFutura++;
        break;
      case "medio_sin_cuenta": {
        r.porRevisar++;
        const m = medios.get(p.medio_pago_id) ?? { medioPagoId: p.medio_pago_id, nombre: p.medio_pago ?? "Medio de pago", cantidad: 0, valor: 0 };
        m.cantidad++;
        m.valor += valor;
        medios.set(p.medio_pago_id, m);
        break;
      }
      case "sin_valor":
      case "corregido_sin_anular":
      case "anulado_liquidado":
        r.porRevisar++;
        break;
    }
  }
  r.mediosSinCuenta = [...medios.values()].sort((a, b) => b.cantidad - a.cantidad);
  return r;
}

export function validarCobro(input: { monto: number | null; fecha: string; cuentaId: string | null; hoy: string; fechaInicio: string }): string | null {
  if (!input.cuentaId) return "Elige a qué cuenta llegó la plata.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return "Elige la fecha del cobro.";
  if (input.fecha > input.hoy) return "La fecha no puede ser futura.";
  if (input.fecha < input.fechaInicio) return "La fecha es anterior al inicio del flujo de caja.";
  if (input.monto === null || !Number.isFinite(input.monto) || input.monto <= 0) return "Escribe el valor cobrado.";
  if (input.monto > 9_999_999_999) return "El valor es demasiado grande.";
  return null;
}

// Vistas de la pantalla de cobros: lo pendiente (por defecto), lo que ya
// entró al flujo de caja y lo que la clínica decidió no meter en él.
export type VistaCobros = "pendientes" | "en_flujo" | "excluidos";

export const VISTAS_COBROS: { valor: VistaCobros; titulo: string }[] = [
  { valor: "pendientes", titulo: "Pendientes" },
  { valor: "en_flujo", titulo: "Ya en el flujo" },
  { valor: "excluidos", titulo: "Excluidos" },
];

export function vistaDeParametro(v: string | string[] | undefined): VistaCobros {
  return v === "en_flujo" || v === "excluidos" ? v : "pendientes";
}

// Situaciones en las que se puede decidir no meter el tratamiento en el
// flujo (las demás ya tienen un ingreso vivo que primero hay que anular).
const EXCLUIBLES: SituacionIngreso[] = ["por_generar", "por_cobrar", "sin_valor", "medio_sin_cuenta", "fecha_futura"];

export function sePuedeExcluir(situacion: SituacionIngreso): boolean {
  return EXCLUIBLES.includes(situacion);
}

export const MOTIVO_EXCLUSION_MIN = 10;

export function validarMotivoExclusion(motivo: string): string | null {
  const m = motivo.trim();
  if (m.length < MOTIVO_EXCLUSION_MIN) return `Explica por qué no entra al flujo de caja (al menos ${MOTIVO_EXCLUSION_MIN} caracteres).`;
  if (m.length > 500) return "El motivo es demasiado largo (máximo 500 caracteres).";
  return null;
}
