// Compartido entre las server actions ("use server" solo puede exportar
// funciones async) y los componentes de cliente — ver AGENTS.md del
// proyecto sobre este gotcha de Next.js.

// Resolución 1164/2002 (roja, sigue vigente para peligrosos/biosanitarios)
// + Resolución 2184/2019 + 1344/2020 (código de colores nacional,
// aplicado a salud desde jul-2022: blanca=aprovechables, negra=ordinarios).
// El usuario pidió separar explícitamente "guardianes de cortopunzantes" y
// "residuos químicos" del resto de lo rojo.
export const TIPOS_RESIDUO = [
  { value: "aprovechable", label: "Aprovechable", corriente: "no_peligroso", caneca: "blanca", peligroso: false },
  { value: "no_aprovechable", label: "No aprovechable", corriente: "no_peligroso", caneca: "negra", peligroso: false },
  { value: "organico", label: "Orgánico biodegradable", corriente: "no_peligroso", caneca: "verde", peligroso: false },
  { value: "biosanitario", label: "Biosanitario", corriente: "infeccioso", caneca: "roja", peligroso: true },
  { value: "anatomopatologico", label: "Anatomopatológico", corriente: "infeccioso", caneca: "roja", peligroso: true },
  { value: "cortopunzante", label: "Cortopunzante (guardián)", corriente: "infeccioso", caneca: "roja", peligroso: true },
  { value: "animal_infectado", label: "De animales", corriente: "infeccioso", caneca: "roja", peligroso: true },
  { value: "quimico_corrosivo", label: "Químico corrosivo", corriente: "quimico", caneca: null, peligroso: true },
  { value: "quimico_reactivo", label: "Químico reactivo", corriente: "quimico", caneca: null, peligroso: true },
  { value: "quimico_explosivo", label: "Químico explosivo", corriente: "quimico", caneca: null, peligroso: true },
  { value: "quimico_toxico", label: "Químico tóxico", corriente: "quimico", caneca: null, peligroso: true },
  { value: "quimico_inflamable", label: "Químico inflamable", corriente: "quimico", caneca: null, peligroso: true },
  { value: "radioactivo", label: "Radiactivo", corriente: "radioactivo", caneca: null, peligroso: true },
  { value: "otros_peligrosos", label: "Otros residuos peligrosos", corriente: "otros_peligrosos", caneca: null, peligroso: true },
  { value: "quimico", label: "Químico histórico (sin característica clasificada)", corriente: "quimico_historico", caneca: null, peligroso: true },
] as const;

export type TipoResiduo = (typeof TIPOS_RESIDUO)[number]["value"];
export type Caneca = (typeof TIPOS_RESIDUO)[number]["caneca"];
export type CorrienteResiduo = (typeof TIPOS_RESIDUO)[number]["corriente"];
export const ETIQUETAS_CORRIENTE: Record<CorrienteResiduo, string> = {
  no_peligroso: "No peligrosos",
  infeccioso: "Infecciosos o de riesgo biológico",
  quimico: "Peligrosos por característica química",
  radioactivo: "Radiactivos",
  otros_peligrosos: "Otros peligrosos",
  quimico_historico: "Químicos históricos sin clasificar",
};

export function infoResiduo(tipo: string) {
  return TIPOS_RESIDUO.find((t) => t.value === tipo);
}

export function esResiduoPeligroso(tipo: string): boolean {
  return infoResiduo(tipo)?.peligroso ?? false;
}

export function esTipoResiduoValido(valor: string): valor is TipoResiduo {
  return TIPOS_RESIDUO.some((t) => t.value === valor);
}

// "quimico" es el tipo genérico anterior a la clasificación por
// característica (0082): se conserva solo para mostrar registros
// históricos; un pesaje nuevo debe elegir la característica concreta.
export const TIPO_RESIDUO_LEGADO = "quimico";

export const TIPOS_RESIDUO_NUEVOS = TIPOS_RESIDUO.filter((t) => t.value !== TIPO_RESIDUO_LEGADO);

export function esTipoResiduoNuevoValido(valor: string): valor is TipoResiduo {
  return valor !== TIPO_RESIDUO_LEGADO && esTipoResiduoValido(valor);
}

// Debe coincidir con fn_residuo_es_peligroso() de la migración 0082 (lo
// verifica lib/medio-ambiente/__tests__/residuos.test.ts).
export const TIPOS_RESIDUO_PELIGROSOS: readonly TipoResiduo[] = TIPOS_RESIDUO.filter((t) => t.peligroso).map(
  (t) => t.value,
);

// Etiqueta de las listas desplegables: el recipiente primero, porque es lo
// que la persona ve físicamente al pesar.
export function etiquetaOpcionResiduo(t: (typeof TIPOS_RESIDUO)[number]): string {
  return `${t.caneca ? `Caneca ${t.caneca}` : t.peligroso ? "Peligroso" : "Sin caneca"} — ${t.label}`;
}

// Estilo de Badge más cercano al color real de la caneca (el componente
// Badge no tiene variantes de color propias). La verde lleva su propio
// color (mismos tonos emerald que las insignias de Habilitación) para no
// confundirse con la negra; el texto "Caneca verde" la nombra igual, así
// el color nunca es la única pista.
export function estiloBadgeCaneca(caneca: Exclude<Caneca, null>): {
  variant: "destructive" | "outline" | "secondary";
  className?: string;
} {
  if (caneca === "roja") return { variant: "destructive" };
  if (caneca === "blanca") return { variant: "outline" };
  if (caneca === "verde") {
    return {
      variant: "outline",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    };
  }
  return { variant: "secondary" };
}

// Resolución 3100/2019 — un baño no es un consultorio, por eso el área se
// modela con un tipo propio en vez de forzar todo bajo consultorio_id.
export const AREAS_LIMPIEZA = [
  { value: "consultorio", label: "Consultorio" },
  { value: "bano", label: "Baño" },
] as const;

export type AreaLimpieza = (typeof AREAS_LIMPIEZA)[number]["value"];

export function esAreaLimpiezaValida(valor: string): valor is AreaLimpieza {
  return AREAS_LIMPIEZA.some((a) => a.value === valor);
}

// Jornada AM/PM — dato siempre presente en el formato físico (a veces es lo
// único que se marca, sin hora exacta), por eso es obligatorio en las 4
// bitácoras mientras que la hora exacta es opcional.
export const JORNADAS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
] as const;

export type Jornada = (typeof JORNADAS)[number]["value"];

export function esJornadaValida(valor: string): valor is Jornada {
  return JORNADAS.some((j) => j.value === valor);
}
