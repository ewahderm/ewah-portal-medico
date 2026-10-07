export const FORMACIONES_RESPONSABLE = [
  { value: "tecnico", label: "Técnico en SST" },
  { value: "tecnologo", label: "Tecnólogo en SST" },
  { value: "profesional", label: "Profesional en SST" },
  { value: "especialista", label: "Especialista en SST" },
] as const;

export const MODOS_SST = [
  { value: "empleador", label: "Tengo trabajadores o contratistas", ayuda: "Clínica, consultorio o profesional que contrata personal." },
  { value: "independiente", label: "Trabajo solo", ayuda: "Profesional independiente sin trabajadores a cargo." },
] as const;

// Secciones del módulo (subnavegación). `disponible: false` se ve sin
// enlace mientras su fase no exista; nunca una ruta rota.
export const SECCIONES_SST = [
  { href: "/sst", label: "Diagnóstico", disponible: true },
  { href: "/sst/eventos", label: "Incidentes y accidentes", disponible: true },
  { href: "/sst/documentos", label: "Documentos", disponible: true },
  { href: "/sst/peligros", label: "Peligros", disponible: true },
  { href: "/sst/personas", label: "Capacitación y EPP", disponible: true },
  { href: "/sst/plan", label: "Plan y comités", disponible: true },
  { href: "/sst/estandares", label: "Estándares", disponible: true },
] as const;

export const TIPOS_EVENTO = [
  { value: "incidente", label: "Incidente", ayuda: "Pudo lastimar a alguien y no lo hizo (o solo daños materiales)." },
  { value: "accidente", label: "Accidente de trabajo", ayuda: "Alguien se lesionó por causa o con ocasión del trabajo." },
  { value: "enfermedad_laboral", label: "Enfermedad laboral", ayuda: "Diagnóstico de una enfermedad causada por el trabajo." },
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number]["value"];

export const GRAVEDADES = [
  { value: "leve", label: "Leve" },
  { value: "grave", label: "Grave" },
  { value: "mortal", label: "Mortal" },
] as const;

export const ROLES_EQUIPO = [
  { value: "jefe_inmediato", label: "Jefe inmediato" },
  { value: "copasst_vigia", label: "COPASST o vigía" },
  { value: "responsable_sst", label: "Responsable del SG-SST" },
  { value: "profesional_licencia", label: "Profesional con licencia en SST" },
  { value: "otro", label: "Otro" },
] as const;

export const METODOLOGIAS = [
  { value: "cinco_porques", label: "5 porqués" },
  { value: "arbol_causas", label: "Árbol de causas" },
  { value: "espina_pescado", label: "Espina de pescado" },
  { value: "otra", label: "Otra" },
] as const;

export const TIPOS_ACCION = [
  { value: "correctiva", label: "Correctiva" },
  { value: "preventiva", label: "Preventiva" },
  { value: "mejora", label: "De mejora" },
] as const;

export const ESTADOS_ACCION = [
  { value: "abierta", label: "Abierta" },
  { value: "en_curso", label: "En curso" },
  { value: "cerrada", label: "Cerrada" },
] as const;

export function etiqueta<T extends string>(opciones: readonly { value: T; label: string }[], v: string | null | undefined): string {
  return opciones.find((o) => o.value === v)?.label ?? (v ?? "");
}
