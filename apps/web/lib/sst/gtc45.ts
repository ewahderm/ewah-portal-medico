// Valoración de riesgos de la GTC 45 (2012). Puro. La BD calcula lo mismo
// en columnas generadas (0075); esto es para mostrarlo en vivo en el
// formulario. Las plantillas son peligros típicos de una clínica o un
// consultorio: puntos de partida, el usuario los ajusta.

export const CLASIFICACIONES = [
  { value: "biologico", label: "Biológico" },
  { value: "biomecanico", label: "Biomecánico" },
  { value: "psicosocial", label: "Psicosocial" },
  { value: "quimico", label: "Químico" },
  { value: "fisico", label: "Físico" },
  { value: "condiciones_seguridad", label: "Condiciones de seguridad" },
  { value: "fenomenos_naturales", label: "Fenómenos naturales" },
] as const;
export type Clasificacion = (typeof CLASIFICACIONES)[number]["value"];

export const NIVELES_DEFICIENCIA = [
  { value: 10, label: "Muy alto (10)", ayuda: "Hay peligros que pueden causar consecuencias muy graves o las medidas no sirven." },
  { value: 6, label: "Alto (6)", ayuda: "Peligros que pueden causar consecuencias significativas o medidas poco eficaces." },
  { value: 2, label: "Medio (2)", ayuda: "Peligros de consecuencias poco significativas o medidas con algo de eficacia." },
  { value: 0, label: "Bajo", ayuda: "No hay anomalías destacables o las medidas son eficaces." },
] as const;

export const NIVELES_EXPOSICION = [
  { value: 4, label: "Continua (4)", ayuda: "Varias veces en la jornada o de forma prolongada." },
  { value: 3, label: "Frecuente (3)", ayuda: "Varias veces en la jornada por periodos cortos." },
  { value: 2, label: "Ocasional (2)", ayuda: "Alguna vez en la jornada y por poco tiempo." },
  { value: 1, label: "Esporádica (1)", ayuda: "Irregularmente." },
] as const;

export const NIVELES_CONSECUENCIA = [
  { value: 100, label: "Mortal o catastrófico (100)", ayuda: "Muerte." },
  { value: 60, label: "Muy grave (60)", ayuda: "Lesiones o enfermedades con incapacidad permanente." },
  { value: 25, label: "Grave (25)", ayuda: "Lesiones o enfermedades con incapacidad temporal." },
  { value: 10, label: "Leve (10)", ayuda: "Lesiones o enfermedades que no requieren incapacidad." },
] as const;

export type NivelRiesgo = "I" | "II" | "III" | "IV";

export const ACEPTABILIDAD: Record<NivelRiesgo, { texto: string; accion: string; tono: "rojo" | "ambar" | "verde" }> = {
  I: { texto: "No aceptable", accion: "Situación crítica: intervenir de inmediato; suspender la actividad hasta controlar el riesgo.", tono: "rojo" },
  II: { texto: "No aceptable o aceptable con control específico", accion: "Corregir y adoptar medidas de control de inmediato.", tono: "rojo" },
  III: { texto: "Mejorable", accion: "Mejorar si es posible; conviene justificar la intervención y su rentabilidad.", tono: "ambar" },
  IV: { texto: "Aceptable", accion: "Mantener las medidas de control existentes y revisarlas periódicamente.", tono: "verde" },
};

export function nivelProbabilidad(np: number): "Muy alto" | "Alto" | "Medio" | "Bajo" {
  return np >= 24 ? "Muy alto" : np >= 10 ? "Alto" : np >= 6 ? "Medio" : "Bajo";
}

export function valorar(nd: number, ne: number, nc: number): { np: number; nr: number; nivel: NivelRiesgo } {
  const np = nd * ne;
  const nr = np * nc;
  const nivel: NivelRiesgo = nr >= 600 ? "I" : nr >= 150 ? "II" : nr >= 40 ? "III" : "IV";
  return { np, nr, nivel };
}

export const JERARQUIA = [
  { value: "eliminacion", label: "Eliminación" },
  { value: "sustitucion", label: "Sustitución" },
  { value: "ingenieria", label: "Control de ingeniería" },
  { value: "administrativo", label: "Control administrativo, señalización, advertencia" },
  { value: "epp", label: "Equipos y elementos de protección personal" },
] as const;

export type PlantillaPeligro = {
  clave: string;
  clasificacion: Clasificacion;
  descripcion: string;
  efectos: string;
  actividad: string;
  controlIndividuo?: string;
};

export const PLANTILLAS_SALUD: readonly PlantillaPeligro[] = [
  { clave: "bio-fluidos", clasificacion: "biologico", actividad: "Atención de pacientes", descripcion: "Contacto con sangre y fluidos corporales", efectos: "Hepatitis B y C, VIH, infecciones", controlIndividuo: "Guantes, tapabocas, protección ocular, vacunación" },
  { clave: "bio-cortopunzantes", clasificacion: "biologico", actividad: "Procedimientos con agujas y bisturí", descripcion: "Pinchazos y cortes con material cortopunzante contaminado", efectos: "Infección por agentes hemotransmisibles", controlIndividuo: "Guardián al alcance, no recapuchar, guantes" },
  { clave: "bio-respiratorio", clasificacion: "biologico", actividad: "Atención de pacientes", descripcion: "Exposición a microorganismos por vía aérea o gotas", efectos: "Infecciones respiratorias", controlIndividuo: "Tapabocas o respirador según el caso" },
  { clave: "bm-postura", clasificacion: "biomecanico", actividad: "Consulta y procedimientos", descripcion: "Postura prolongada sentado o de pie, posturas forzadas", efectos: "Lesiones osteomusculares de espalda, cuello y hombros" },
  { clave: "bm-repetitivo", clasificacion: "biomecanico", actividad: "Digitación y procedimientos manuales", descripcion: "Movimientos repetitivos de manos y muñecas", efectos: "Síndrome del túnel carpiano, tendinitis" },
  { clave: "bm-cargas", clasificacion: "biomecanico", actividad: "Movilización de pacientes", descripcion: "Manipulación manual de cargas y de pacientes", efectos: "Lumbalgia, hernias discales" },
  { clave: "ps-publico", clasificacion: "psicosocial", actividad: "Atención al público y a pacientes", descripcion: "Atención de usuarios difíciles, demandas emocionales", efectos: "Estrés, agotamiento (burnout)" },
  { clave: "ps-carga", clasificacion: "psicosocial", actividad: "Agenda de consulta", descripcion: "Carga mental, ritmo de trabajo y jornadas extensas", efectos: "Estrés, fatiga, trastornos del sueño" },
  { clave: "qu-desinfectantes", clasificacion: "quimico", actividad: "Limpieza y desinfección", descripcion: "Contacto e inhalación de desinfectantes y esterilizantes", efectos: "Dermatitis, irritación respiratoria y ocular", controlIndividuo: "Guantes de nitrilo, ventilación, fichas de seguridad" },
  { clave: "fi-radiacion", clasificacion: "fisico", actividad: "Toma de imágenes con rayos X", descripcion: "Radiación ionizante", efectos: "Efectos por dosis acumulada", controlIndividuo: "Dosimetría personal, delantal plomado" },
  { clave: "fi-iluminacion", clasificacion: "fisico", actividad: "Trabajo en consultorio y oficina", descripcion: "Iluminación deficiente o deslumbramiento", efectos: "Fatiga visual, cefalea" },
  { clave: "cs-electrico", clasificacion: "condiciones_seguridad", actividad: "Uso de equipos biomédicos", descripcion: "Contacto con equipos eléctricos o conexiones en mal estado", efectos: "Quemaduras, electrocución" },
  { clave: "cs-locativo", clasificacion: "condiciones_seguridad", actividad: "Desplazamiento por las instalaciones", descripcion: "Pisos mojados o irregulares, escaleras", efectos: "Caídas, contusiones, fracturas" },
  { clave: "cs-publico", clasificacion: "condiciones_seguridad", actividad: "Atención al público", descripcion: "Agresiones de usuarios, hurtos", efectos: "Lesiones, estrés postraumático" },
  { clave: "fn-sismo", clasificacion: "fenomenos_naturales", actividad: "Todas", descripcion: "Sismo", efectos: "Lesiones por caída de objetos o colapso", controlIndividuo: "Plan de emergencias, simulacros" },
];
