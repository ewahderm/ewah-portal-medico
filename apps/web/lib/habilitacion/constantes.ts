// Constantes del módulo de Habilitación (Res. 3100/2019). Archivo hermano
// SIN directiva: lo importan Server Components, Client Components y las
// server actions ("use server" solo puede exportar funciones async).
// Los vocabularios replican los `check` de 0061/0062 — si se agrega un valor
// en BD, se agrega aquí con su etiqueta.

export const MODULO_HABILITACION = "habilitacion";
export const FEATURE_GESTION = "gestion";

export type Opciones<T extends string> = readonly { value: T; label: string; ayuda?: string }[];

export const COMPLEJIDADES = [
  { value: "baja", label: "Baja" },
  { value: "mediana", label: "Mediana" },
  { value: "alta", label: "Alta" },
  { value: "no_aplica", label: "No se clasifica por complejidad", ayuda: "La norma no le asigna complejidad a este servicio." },
] as const satisfies Opciones<string>;
export type Complejidad = (typeof COMPLEJIDADES)[number]["value"];

export const MODALIDADES = [
  { value: "intramural", label: "Intramural", ayuda: "Dentro de tu sede." },
  { value: "extramural", label: "Extramural", ayuda: "Fuera de la sede (transporte asistencial y atención prehospitalaria)." },
  { value: "extramural_unidad_movil", label: "Extramural · unidad móvil", ayuda: "En un vehículo o unidad adaptada." },
  { value: "extramural_jornada_salud", label: "Extramural · jornada de salud", ayuda: "Brigadas o jornadas fuera de la sede." },
  { value: "extramural_domiciliaria", label: "Extramural · domiciliaria", ayuda: "En la casa del paciente." },
  { value: "telemedicina", label: "Telemedicina", ayuda: "Atención a distancia con tecnologías de la información." },
] as const satisfies Opciones<string>;
export type Modalidad = (typeof MODALIDADES)[number]["value"];

export const TELEMEDICINA_CATEGORIAS = [
  { value: "interactiva", label: "Interactiva", ayuda: "En tiempo real (videollamada)." },
  { value: "no_interactiva", label: "No interactiva", ayuda: "Asincrónica: se envía información y se responde después." },
  { value: "telexperticia", label: "Telexperticia", ayuda: "Un profesional consulta a otro." },
  { value: "telemonitoreo", label: "Telemonitoreo", ayuda: "Seguimiento remoto de datos clínicos del paciente." },
] as const satisfies Opciones<string>;
export type TelemedicinaCategoria = (typeof TELEMEDICINA_CATEGORIAS)[number]["value"];

export const TELEMEDICINA_ROLES = [
  { value: "prestador_remisor", label: "Prestador remisor", ayuda: "Tienes al paciente y pides el apoyo a distancia." },
  { value: "prestador_referencia", label: "Prestador de referencia", ayuda: "Das el apoyo a distancia a otro prestador." },
] as const satisfies Opciones<string>;
export type TelemedicinaRol = (typeof TELEMEDICINA_ROLES)[number]["value"];

export const USOS_EDIFICACION = [
  { value: "exclusivo_salud", label: "Uso exclusivo en salud", ayuda: "Toda la edificación se dedica a prestar servicios de salud." },
  { value: "mixto", label: "Uso mixto", ayuda: "Compartes la edificación con otros usos (oficinas, vivienda, comercio)." },
] as const satisfies Opciones<string>;
export type UsoEdificacion = (typeof USOS_EDIFICACION)[number]["value"];

export const ESTADOS_SERVICIO = [
  { value: "por_habilitar", label: "Por habilitar" },
  { value: "habilitado", label: "Habilitado" },
  { value: "cierre_temporal", label: "Cierre temporal" },
  { value: "cerrado", label: "Cerrado" },
] as const satisfies Opciones<string>;
export type EstadoServicio = (typeof ESTADOS_SERVICIO)[number]["value"];

export const ESTADOS_REPS = [
  { value: "no_inscrito", label: "Todavía no estoy inscrito", ayuda: "Vas a inscribirte por primera vez." },
  { value: "en_tramite", label: "Estoy en trámite", ayuda: "Ya radicaste y esperas la visita o la constancia." },
  { value: "inscrito", label: "Ya estoy inscrito", ayuda: "Tienes código de prestador y servicios habilitados." },
  { value: "inactivo", label: "Inscripción inactiva", ayuda: "Tu inscripción venció o la cerraste." },
] as const satisfies Opciones<string>;
export type EstadoReps = (typeof ESTADOS_REPS)[number]["value"];

export const NATURALEZAS = [
  { value: "privada", label: "Privada" },
  { value: "publica", label: "Pública" },
  { value: "mixta", label: "Mixta" },
] as const satisfies Opciones<string>;
export type Naturaleza = (typeof NATURALEZAS)[number]["value"];

export const TIPOS_PRESTADOR = [
  "ips",
  "profesional_independiente",
  "transporte_especial",
  "objeto_social_diferente",
] as const;
export type TipoPrestador = (typeof TIPOS_PRESTADOR)[number];

export const GRUPOS_SUPERSALUD = ["B", "C1", "C2", "D1", "D2", "D3"] as const;
export type GrupoSupersalud = (typeof GRUPOS_SUPERSALUD)[number];

// Características del prestador que deciden qué documentos y reportes le
// aplican (condiciones de hab_documentos_catalogo / hab_obligaciones_catalogo).
// Cada una es una columna boolean de hab_perfil_prestador.
export const CARACTERISTICAS_PERFIL = [
  { campo: "es_ips_nueva", label: "Es una IPS nueva", ayuda: "Se va a inscribir por primera vez." },
  { campo: "es_esal", label: "Es una entidad sin ánimo de lucro (ESAL)" },
  { campo: "es_cooperacion_internacional", label: "Es una entidad de cooperación internacional" },
  { campo: "tiene_sedes_otros_departamentos", label: "Tiene sedes en otros departamentos" },
  { campo: "tiene_revisor_fiscal", label: "Tiene revisor fiscal" },
  { campo: "factura_servicios_salud", label: "Factura servicios de salud", ayuda: "Por ejemplo a EPS o aseguradoras." },
  { campo: "es_upgd", label: "Es UPGD (notifica eventos al SIVIGILA)" },
  { campo: "realiza_pedt", label: "Realiza actividades de protección específica y detección temprana (PEDT)" },
] as const;
export type CampoCaracteristica = (typeof CARACTERISTICAS_PERFIL)[number]["campo"];

// HU-1.4 AC2: mientras el código territorial de la secretaría no esté
// verificado se envía al portal nacional del REPS.
export const PORTAL_REPS_NACIONAL = "https://prestadores.minsalud.gov.co/habilitacion/";

// Asistente de grupo Supersalud (HU-1.2): umbrales de la Circular Externa
// 20211700000005-5 de 2021, numeral 4.1 (rige desde el 30-abr-2022), con
// corte al 31 de diciembre de la vigencia anterior. Fuente:
// https://normograma.supersalud.gov.co/compilacion/docs/circular_supersalud_0005_2021.htm
// (tabla publicada como imagen; transcrita en reportes.json, F0). Son DATOS:
// si la Supersalud los cambia, se cambia esta tabla, no la lógica.
export const CITA_GRUPO_SUPERSALUD = {
  norma: "Circular Externa 20211700000005-5 de 2021 (Supersalud), numeral 4.1",
  url: "https://normograma.supersalud.gov.co/compilacion/docs/circular_supersalud_0005_2021.htm",
} as const;

export type UmbralGrupo = {
  grupo: "C1" | "C2" | "D1" | "D2";
  activosUvt: number;
  ingresosUvt: number;
  patrimonioUvt: number;
  serviciosAlta: number;
  serviciosMediana: number;
  intramuralesHospitalarios: number;
  niifGrupo?: 1 | 2;           // privada o mixta
  nivelPublica?: 2 | 3;        // pública
};

// Orden de evaluación: del grupo más exigente al menos exigente. Todos los
// umbrales son "mayor que" (literal de la circular).
export const UMBRALES_GRUPO_SUPERSALUD: readonly UmbralGrupo[] = [
  { grupo: "C1", activosUvt: 2_725_557, ingresosUvt: 2_283_426, patrimonioUvt: 1_303_324, serviciosAlta: 25, serviciosMediana: 60, intramuralesHospitalarios: 43, niifGrupo: 1, nivelPublica: 3 },
  { grupo: "C2", activosUvt: 1_235_699, ingresosUvt: 1_136_628, patrimonioUvt: 621_694, serviciosAlta: 12, serviciosMediana: 42, intramuralesHospitalarios: 28 },
  { grupo: "D1", activosUvt: 722_783, ingresosUvt: 695_267, patrimonioUvt: 385_747, serviciosAlta: 6, serviciosMediana: 33, intramuralesHospitalarios: 20, nivelPublica: 2 },
  { grupo: "D2", activosUvt: 39_538, ingresosUvt: 47_676, patrimonioUvt: 20_050, serviciosAlta: 2, serviciosMediana: 11, intramuralesHospitalarios: 6, niifGrupo: 2 },
];

export const DESCRIPCION_GRUPO: Record<GrupoSupersalud, string> = {
  B: "IPS cuyo NIT es el mismo de una EPS o entidad administradora de planes de beneficios.",
  C1: "IPS de mayor tamaño (activos, ingresos o patrimonio muy altos, NIIF Grupo 1 o nivel 3).",
  C2: "IPS grandes por cifras financieras o número de servicios.",
  D1: "IPS medianas por cifras financieras o número de servicios, o públicas de nivel 2.",
  D2: "IPS pequeñas que aplican NIIF Grupo 2 o superan los umbrales mínimos.",
  D3: "Las demás IPS (no cumplen ninguna característica de los grupos anteriores).",
};

// Ruta de habilitación (§5.6): los 6 pasos y a dónde lleva cada uno. Los
// pasos de fases futuras (F5/F7/F8) no tienen ruta todavía: se muestran
// como "Próximamente" en vez de enlazar a una página que no existe.
export const PASOS_RUTA = [
  { numero: 1, clave: "perfil", titulo: "Perfil del prestador", pregunta: "¿Qué tipo de prestador soy y ante quién respondo?", href: "/habilitacion/perfil" },
  { numero: 2, clave: "sedes", titulo: "Sedes y servicios", pregunta: "¿Qué voy a prestar y dónde?", href: "/habilitacion/sedes" },
  { numero: 3, clave: "documentos", titulo: "Documentos de inscripción", pregunta: "¿Qué tengo que radicar ante la secretaría?", href: "/habilitacion/documentos" },
  { numero: 4, clave: "autoevaluacion", titulo: "Autoevaluación", pregunta: "¿Cumplo cada criterio?", href: "/habilitacion/autoevaluacion" },
  { numero: 5, clave: "obligaciones", titulo: "Obligaciones y calendario", pregunta: "¿Qué tengo que presentar y cuándo?", href: "/habilitacion/calendario" },
  { numero: 6, clave: "tablero", titulo: "Tablero", pregunta: "¿Cómo voy y qué es urgente?", href: "/habilitacion" },
] as const;
export type ClavePaso = (typeof PASOS_RUTA)[number]["clave"];

// Subnavegación del módulo. `gestion` = solo con la sub-feature de pago;
// `disponible: false` = fase futura (se muestra deshabilitada, sin enlace).
export const SECCIONES_HABILITACION = [
  { href: "/habilitacion", label: "Resumen", gestion: false, disponible: true },
  { href: "/habilitacion/perfil", label: "Perfil", gestion: false, disponible: true },
  { href: "/habilitacion/sedes", label: "Sedes y servicios", gestion: true, disponible: true },
  { href: "/habilitacion/documentos", label: "Documentos", gestion: true, disponible: true },
  { href: "/habilitacion/autoevaluacion", label: "Autoevaluación", gestion: true, disponible: true },
  { href: "/habilitacion/calendario", label: "Calendario", gestion: false, disponible: true },
  { href: "/habilitacion/obligaciones", label: "Obligaciones", gestion: false, disponible: true },
] as const;

// ============================================================
// Autoevaluación (F5, HU-4.1 a HU-4.5). Replican los checks de 0066.
// ============================================================
export const ESTADOS_EVALUACION = [
  { value: "cumple", label: "Cumple" },
  { value: "no_cumple", label: "No cumple" },
  { value: "no_aplica", label: "No aplica" },
  { value: "pendiente", label: "Pendiente" },
] as const satisfies Opciones<string>;
export type EstadoEvaluacion = (typeof ESTADOS_EVALUACION)[number]["value"];

// Orden de la norma (hab_estandares.orden). Las etiquetas cortas son para
// las pestañas en móvil; el nombre completo viene de la BD.
export const ESTANDARES = [
  { value: "talento_humano", label: "Talento humano", sigla: "TH" },
  { value: "infraestructura", label: "Infraestructura", sigla: "IN" },
  { value: "dotacion", label: "Dotación", sigla: "DO" },
  { value: "medicamentos_dispositivos_insumos", label: "Medicamentos y dispositivos", sigla: "MD" },
  { value: "procesos_prioritarios", label: "Procesos prioritarios", sigla: "PP" },
  { value: "historia_clinica_registros", label: "Historia clínica", sigla: "HC" },
  { value: "interdependencia", label: "Interdependencia", sigla: "IT" },
] as const satisfies readonly { value: string; label: string; sigla: string }[];
export type CodigoEstandar = (typeof ESTANDARES)[number]["value"];

export const ESTADOS_PLAN_MEJORA = [
  { value: "abierta", label: "Abierta" },
  { value: "en_curso", label: "En curso" },
  { value: "cerrada", label: "Cerrada" },
] as const satisfies Opciones<string>;
export type EstadoPlanMejora = (typeof ESTADOS_PLAN_MEJORA)[number]["value"];

// Límites de texto (§3.1) — los mismos checks de 0066.
export const MAX_JUSTIFICACION = 2000;
export const MAX_OBSERVACION = 4000;
export const MIN_JUSTIFICACION_NO_APLICA = 10;
export const MIN_MOTIVO_RETIRO = 10;

// Archivos del bucket `habilitacion` (§1.5): 10 MB como RRHH; el tipo se
// decide por la FIRMA del archivo (lib/habilitacion/archivos.ts), no por el
// nombre ni por lo que diga el navegador.
export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;
export const FORMATOS_ARCHIVO = "PDF, JPG, PNG, WEBP, Word (.docx) o Excel (.xlsx)";
export const ACCEPT_ARCHIVO = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx";

// Fuentes de evidencia de otros módulos (F6, 0067): lista cerrada, igual al
// check de hab_evidencias.fuente_codigo y al `case` del dispatcher.
export const FUENTES_EVIDENCIA = [
  { value: "rrhh_talento_humano", label: "Talento humano", modulo: "RRHH" },
  { value: "ma_temperatura_nevera", label: "Temperatura de neveras", modulo: "Medio Ambiente" },
  { value: "ma_temperatura_ambiente", label: "Temperatura y humedad de consultorios", modulo: "Medio Ambiente" },
  { value: "ma_residuos", label: "Registro de residuos", modulo: "Medio Ambiente" },
  { value: "ma_limpieza", label: "Registro de limpieza", modulo: "Medio Ambiente" },
  { value: "ma_extintores", label: "Extintores", modulo: "Medio Ambiente" },
  { value: "inv_registro_sanitario", label: "Registro sanitario de insumos", modulo: "Inventario" },
  { value: "inv_lotes_vencidos", label: "Vencimiento de lotes", modulo: "Inventario" },
  { value: "sistema_consentimientos", label: "Consentimientos informados", modulo: "Tratamientos" },
  { value: "sistema_historia_clinica", label: "Historia clínica electrónica", modulo: "Pacientes" },
] as const satisfies readonly { value: string; label: string; modulo: string }[];
export type FuenteEvidencia = (typeof FUENTES_EVIDENCIA)[number]["value"];

// PDF oficial de la norma (hab_normas.url_fuente); la página del criterio
// se abre con #page=N.
export const URL_PDF_RES3100 = "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-3100-de-2019.pdf";

// URL firmada de evidencia: 60 s (contenido sensible, §1.5).
export const SEGUNDOS_URL_FIRMADA = 60;

// Trámite ante la secretaría (hab_tramite_hitos.tipo, 0068).
export const TIPOS_HITO = [
  { value: "radicado", label: "Radiqué la solicitud", ayuda: "Entregaste el formulario y los soportes en la secretaría." },
  { value: "devuelto_inconsistencias", label: "Me la devolvieron por inconsistencias" },
  { value: "codigo_asignado", label: "Me asignaron código de prestador" },
  { value: "visita_previa_programada", label: "Programaron la visita previa" },
  { value: "visita_realizada", label: "Se hizo la visita de verificación" },
  { value: "subsanacion_radicada", label: "Radiqué la subsanación" },
  { value: "constancia_expedida", label: "Me expidieron la constancia de habilitación" },
  { value: "distintivo", label: "Recibí el distintivo" },
  { value: "visita_certificacion", label: "Visita de certificación" },
] as const;
export type TipoHito = (typeof TIPOS_HITO)[number]["value"];

// Vencimiento del REPS: ámbar desde 90 días, rojo desde 30 (§5.6).
export const UMBRALES_VENCIMIENTO_REPS = { ambar: 90, rojo: 30 } as const;

export function etiquetaDe<T extends string>(opciones: Opciones<T>, valor: string | null | undefined) {
  return opciones.find((o) => o.value === valor)?.label ?? valor ?? "";
}
