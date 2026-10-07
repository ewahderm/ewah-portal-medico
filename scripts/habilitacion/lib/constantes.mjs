// Vocabularios cerrados y constantes del catálogo (§1.2.1 del diseño). Deben
// coincidir con los CHECK de la migración 0062 y con
// apps/web/lib/habilitacion/constantes.ts (F4).

export const NORMA = {
  codigo: "RES3100_2019_COMPILADA_2026-10",
  nombre:
    "Resolución 3100 de 2019 (MinSalud) — Manual de Inscripción de Prestadores y Habilitación de Servicios de Salud, con sus modificaciones vigentes (compilación consultada el 2026-10-06)",
  url_fuente: "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-3100-de-2019.pdf",
  url_compilada: "https://normograma.supersalud.gov.co/compilacion/docs/resolucion_minsaludps_3100_2019.htm",
  fecha_consulta: "2026-10-06",
  vigente_desde: "2019-11-26",
  vigente_hasta: null,
  notas:
    "Texto de 2019 cotejado con la compilación de Supersalud. Incluye Res. 2215/2020, 1317/2021, 1138/2022, 1410/2022 (11.3.7), 1719/2022, 544/2023, 648/2023, 465/2025 y 914/2025 (vigencias desde 2027-01-03). La Res. 1732/2026 nunca surtió efectos y fue revocada por la Res. 2080/2026.",
};

export const FECHA_RES_914 = "2027-01-03";

export const ESTANDARES = [
  { codigo: "talento_humano", sigla: "TH" },
  { codigo: "infraestructura", sigla: "IN" },
  { codigo: "dotacion", sigla: "DO" },
  { codigo: "medicamentos_dispositivos_insumos", sigla: "MD" },
  { codigo: "procesos_prioritarios", sigla: "PP" },
  { codigo: "historia_clinica_registros", sigla: "HC" },
  { codigo: "interdependencia", sigla: "IT" },
];
export const SIGLA = Object.fromEntries(ESTANDARES.map((e) => [e.codigo, e.sigla]));

export const COMPLEJIDADES = ["baja", "mediana", "alta", "no_aplica"];
/** Orden canónico (los arreglos se guardan en este orden: SQL determinista). */
export const MODALIDADES = [
  "intramural",
  "extramural",
  "extramural_unidad_movil",
  "extramural_jornada_salud",
  "extramural_domiciliaria",
  "telemedicina",
];
export const SUBMODALIDADES_EXTRAMURAL = ["extramural_unidad_movil", "extramural_jornada_salud", "extramural_domiciliaria"];
export const TELEMEDICINA_CATEGORIAS = ["interactiva", "no_interactiva", "telexperticia", "telemonitoreo"];
export const TELEMEDICINA_ROLES = ["prestador_remisor", "prestador_referencia"];
export const USOS_EDIFICACION = ["exclusivo_salud", "mixto"];
export const TIPOS_PRESTADOR = ["ips", "profesional_independiente", "transporte_especial", "objeto_social_diferente"];
export const GRUPOS_SUPERSALUD = ["B", "C1", "C2", "D1", "D2", "D3"];
export const TIPOS_REMISION = ["a_otro_servicio", "a_otra_complejidad", "a_otra_modalidad", "a_version_anterior"];

export const CONDICIONES_DOCUMENTO = [
  "persona_juridica",
  "persona_natural",
  "tep_solo_persona_juridica",
  "tep_solo_persona_natural",
  "entidad_publica",
  "esal",
  "cooperacion_internacional",
  "sedes_otros_departamentos",
  "edificacion_pre_1996_12_02",
  "edificacion_pre_2005_05",
  "edificacion_post_1996_mixta",
  "edificacion_pre_2010_con_urgencias_cirugia_uci",
  "telemedicina",
  "telemedicina_remisor",
  "radiaciones_ionizantes",
  "vehiculos",
  "ips_nueva",
];
export const CONDICIONES_OBLIGACION = [
  ...CONDICIONES_DOCUMENTO,
  "upgd",
  "revisor_fiscal",
  "pedt",
  "factura_servicios_salud",
  "privada_o_mixta",
  "internacion_o_urgencias",
];

export const ENTIDADES = ["secretaria_salud", "supersalud", "minsalud", "ins", "propia"];
export const PERIODICIDADES = ["mensual", "trimestral", "semestral", "anual", "eventual", "vencimiento_reps", "manual"];
export const ACTIVACIONES = ["auto", "por_confirmar", "informativa"];
export const SECCIONES_DOCUMENTO = ["radicar", "evidencia_visita"];
export const CATEGORIAS_NOVEDAD = ["prestador", "sede", "servicio", "capacidad"];
export const FUENTES_TEXTO = ["compilacion_supersalud", "pdf_ocr", "imagen"];

/** Mapeo de categorías de novedad de inscripcion.json al vocabulario de la BD. */
export const CATEGORIA_NOVEDAD_BD = {
  prestador: "prestador",
  sede: "sede",
  servicio: "servicio",
  capacidad_instalada: "capacidad",
};

/** Efecto de una novedad sobre el resto del módulo (§1.2 hab_novedades_catalogo). */
export const EFECTO_NOVEDAD = {
  apertura_servicio: "sugerir_alta_servicio",
  cierre_temporal_servicio: "alerta_cierre_temporal",
};

export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
