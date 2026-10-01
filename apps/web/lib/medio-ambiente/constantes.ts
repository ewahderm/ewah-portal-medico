// Compartido entre las server actions ("use server" solo puede exportar
// funciones async) y los componentes de cliente — ver AGENTS.md del
// proyecto sobre este gotcha de Next.js.

// Resolución 1164/2002 (roja, sigue vigente para peligrosos/biosanitarios)
// + Resolución 2184/2019 + 1344/2020 (código de colores nacional,
// aplicado a salud desde jul-2022: blanca=aprovechables, negra=ordinarios).
// El usuario pidió separar explícitamente "guardianes de cortopunzantes" y
// "residuos químicos" del resto de lo rojo.
export const TIPOS_RESIDUO = [
  { value: "biosanitario", label: "Biosanitario", caneca: "roja" },
  { value: "cortopunzante", label: "Cortopunzante (guardián)", caneca: "roja" },
  { value: "anatomopatologico", label: "Anatomopatológico", caneca: "roja" },
  { value: "quimico", label: "Químico", caneca: "roja" },
  { value: "aprovechable", label: "Aprovechable", caneca: "blanca" },
  { value: "no_aprovechable", label: "No aprovechable", caneca: "negra" },
] as const;

export type TipoResiduo = (typeof TIPOS_RESIDUO)[number]["value"];
export type Caneca = (typeof TIPOS_RESIDUO)[number]["caneca"];

export function infoResiduo(tipo: string) {
  return TIPOS_RESIDUO.find((t) => t.value === tipo);
}

export function esTipoResiduoValido(valor: string): valor is TipoResiduo {
  return TIPOS_RESIDUO.some((t) => t.value === valor);
}

// Badge variant más cercano al color real de la caneca (el componente
// Badge de este proyecto no tiene variantes rojo/blanco/negro propias).
export function badgeVarianteCaneca(caneca: Caneca): "destructive" | "outline" | "secondary" {
  if (caneca === "roja") return "destructive";
  if (caneca === "blanca") return "outline";
  return "secondary";
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
