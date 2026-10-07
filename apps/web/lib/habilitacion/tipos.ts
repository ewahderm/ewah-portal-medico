// Tipos de filas y de RPC del módulo de Habilitación. Sin directiva (lo
// importan cliente y servidor).

import type {
  CampoCaracteristica,
  CodigoEstandar,
  EstadoEvaluacion,
  EstadoPlanMejora,
  FuenteEvidencia,
  EstadoReps,
  EstadoServicio,
  GrupoSupersalud,
  Naturaleza,
  TipoPrestador,
  UsoEdificacion,
} from "@/lib/habilitacion/constantes";

export type AccesoHabilitacion = {
  puedeVer: boolean;
  puedeEditar: boolean;
  gestion: boolean;
};

export type PerfilPrestador = {
  tipo_prestador: TipoPrestador | null;
  naturaleza: Naturaleza | null;
  estado_reps: EstadoReps;
  fecha_inscripcion_inicial: string | null;
  fecha_vencimiento_reps: string | null;
  fecha_planeada_radicacion: string | null;
  secretaria_departamento_id: string | null;
  secretaria_nombre: string | null;
  ets_codigo_verificado: boolean;
  grupo_supersalud: GrupoSupersalud | null;
  grupo_fecha_clasificacion: string | null;
  grupo_asistente: RespuestasGrupo & { sugerido?: GrupoSupersalud } | null;
  representante_legal_nombre: string | null;
  representante_legal_documento: string | null;
  updated_at: string | null;
} & Record<CampoCaracteristica, boolean | null>;

export const PERFIL_SELECT =
  "tipo_prestador, naturaleza, estado_reps, fecha_inscripcion_inicial, fecha_vencimiento_reps, fecha_planeada_radicacion, secretaria_departamento_id, secretaria_nombre, ets_codigo_verificado, grupo_supersalud, grupo_fecha_clasificacion, grupo_asistente, representante_legal_nombre, representante_legal_documento, updated_at, es_ips_nueva, es_esal, es_cooperacion_internacional, tiene_sedes_otros_departamentos, tiene_revisor_fiscal, factura_servicios_salud, es_upgd, realiza_pedt";

// Datos de la clínica que el perfil LEE de Datos básicos (0052) en vez de
// capturarlos dos veces (HU-1.1 AC3, HU-1.3 AC3).
export type ClinicaRegulatoria = {
  nombre: string;
  nit: string | null;
  codigo_habilitacion: string | null;
  departamento_id: string | null;
  tipo_persona: { codigo: string; nombre: string } | null;
  departamento: { nombre: string } | null;
};

export type TipoPrestadorCatalogo = {
  codigo: TipoPrestador;
  nombre: string;
  definicion: string | null;
};

// Respuestas del asistente de grupo Supersalud (snapshot en
// hab_perfil_prestador.grupo_asistente).
export type RespuestasGrupo = {
  nitEsEapb: boolean;
  naturaleza: Naturaleza | null;
  niifGrupo: 1 | 2 | 3 | null;
  nivelPublica: 1 | 2 | 3 | null;
  activosUvt: number | null;
  ingresosUvt: number | null;
  patrimonioUvt: number | null;
  serviciosAlta: number | null;
  serviciosMediana: number | null;
  intramuralesHospitalarios: number | null;
  anioCorte?: number;
  uvtUsada?: number | null;
};

export type ServicioNormaOpcion = {
  id: string;
  clave: string;
  nombre: string;
  complejidades: string[];
  modalidades: string[];
  telemedicina_categorias: string[];
  requiere_eleccion: boolean;
  nota: string | null;
  confianza: "alta" | "inferida";
};

// Práctica del catálogo (practicas_medicas) con los numerales de la norma a
// los que puede corresponder (hab_mapeo_practica_servicio).
export type PracticaConNumerales = {
  id: string;
  nombre: string;
  grupo: string | null;
  opciones: ServicioNormaOpcion[];
};

export type ServicioSede = {
  id: string;
  sede_id: string | null;
  practica_medica_id: string;
  servicio_norma_id: string | null;
  codigo_habilitacion: string | null;
  complejidad: string | null;
  modalidades: string[];
  telemedicina_categorias: string[];
  telemedicina_roles: string[];
  estado: EstadoServicio;
  fecha_habilitacion: string | null;
  fecha_cierre_temporal: string | null;
  practicas_medicas: { nombre: string; codigo: string | null } | null;
  hab_servicios_norma: { clave: string; nombre: string } | null;
};

export const SERVICIO_SEDE_SELECT =
  "id, sede_id, practica_medica_id, servicio_norma_id, codigo_habilitacion, complejidad, modalidades, telemedicina_categorias, telemedicina_roles, estado, fecha_habilitacion, fecha_cierre_temporal, practicas_medicas(nombre, codigo), hab_servicios_norma(clave, nombre)";

export type SedeHabilitacion = {
  id: string;
  nombre: string;
  uso_edificacion: UsoEdificacion | null;
  fecha_construccion_intervencion: string | null;
  fecha_construccion_es_aproximada: boolean;
  codigo_sede_reps: string | null;
};

export type SedeConServicios = SedeHabilitacion & {
  servicios: ServicioSede[];
};

// Conteo de criterios del motor (§1.6). `null` en total = el motor todavía
// no está disponible (migración 0065 sin aplicar) o falló.
export type ConteoCriterios = {
  total: number | null;
  evaluables: number | null;
  motorDisponible: boolean;
};

// Lo que el formulario de servicio envía para declarar o editar el detalle
// y para el preview.
export type DetalleServicioInput = {
  servicioNormaId: string | null;
  complejidad: string | null;
  modalidades: string[];
  telemedicinaCategorias: string[];
  telemedicinaRoles: string[];
};

export type PreviewCriterios = {
  error?: string;
  motorDisponible: boolean;
  agrega: number | null;
  totalSede: number | null;
  totalSedeEvaluables: number | null;
};

// ============================================================
// Autoevaluación (F5, 0066)
// ============================================================

// Fila de fn_hab_tablero_criterios: SOLO las columnas que pinta la pantalla
// (la RPC devuelve 42; con todas, el tablero de EWAH pesa ~590 KB).
export type FilaCriterio = {
  criterio_id: string;
  codigo: string;
  numero: string;
  nivel: number;
  padre_id: string | null;
  texto_literal: string;
  pagina: number | null;
  confianza: string;
  nota_vigencia: string | null;
  vigente_hasta: string | null;
  es_encabezado: boolean;
  autorresuelto: boolean;
  origen: "directo" | "transversal" | "remision";
  remitido_desde_codigo: string | null;
  en_cierre_temporal: boolean;
  servicio_clave: string;
  servicio_nombre: string;
  servicio_orden: number;
  estandar_codigo: CodigoEstandar;
  bloque_id: string;
  bloque_encabezado: string | null;
  evaluacion_id: string | null;
  estado: EstadoEvaluacion | null;
  justificacion: string | null;
  observacion: string | null;
  fecha_verificacion: string | null;
  evaluado_por: string | null;
  responsable_id: string | null;
  fecha_objetivo: string | null;
  evidencias_activas: number;
  reverificar: boolean;
  planes_abiertos: number;
};

export const FILA_CRITERIO_SELECT =
  "criterio_id, codigo, numero, nivel, padre_id, texto_literal, pagina, confianza, nota_vigencia, vigente_hasta, es_encabezado, autorresuelto, origen, remitido_desde_codigo, en_cierre_temporal, servicio_clave, servicio_nombre, servicio_orden, estandar_codigo, bloque_id, bloque_encabezado, evaluacion_id, estado, justificacion, observacion, fecha_verificacion, evaluado_por, responsable_id, fecha_objetivo, evidencias_activas, reverificar, planes_abiertos";

// Fila de fn_hab_progreso_autoevaluacion (sede × servicio × estándar).
export type FilaProgreso = {
  sede_id: string;
  servicio_norma_id: string;
  servicio_clave: string;
  estandar_codigo: CodigoEstandar;
  total: number;
  encabezados: number;
  autorresueltos: number;
  evaluables: number;
  cumple: number;
  no_cumple: number;
  no_aplica: number;
  sin_evaluar: number;
  reverificar: number;
  asignados_a_mi: number;
  planes_abiertos: number;
};

export type UsuarioClinica = { id: string; nombre: string };

export type Evidencia = {
  id: string;
  tipo: "archivo" | "nota" | "enlace" | "registro_modulo" | "documento_normativo";
  fuente_codigo: FuenteEvidencia | null;
  tipo_documento_normativo_id: string | null;
  sugerida_por_sistema: boolean;
  descripcion: string;
  nombre_archivo: string | null;
  mime: string | null;
  tamano_bytes: number | null;
  url: string | null;
  created_at: string;
  created_by: string;
  retirada_en: string | null;
  retiro_motivo: string | null;
};

export type EvaluacionHistorial = {
  id: string;
  estado: EstadoEvaluacion;
  justificacion: string | null;
  observacion: string | null;
  fecha_verificacion: string;
  evaluado_por: string;
  created_at: string;
};

export type PlanMejora = {
  id: string;
  evaluacion_id: string;
  accion: string;
  responsable_id: string;
  fecha_compromiso: string;
  estado: EstadoPlanMejora;
  cierre_nombre_archivo: string | null;
  cierre_observacion: string | null;
  fecha_cierre: string | null;
  created_at: string;
};

// Resumen vivo de una fuente (fn_hab_resumen_evidencia, 0067).
export type ResumenEvidencia = {
  fuente: FuenteEvidencia;
  estado: "ok" | "alerta" | "falta";
  titulo: string;
  detalle: string;
  sugerencia: "cumple" | "no_cumple" | null;
  enlace: string;
  filas?: { nombre: string; titulo: "ok" | "falta"; tarjeta: "ok" | "falta"; vacunas: "vigente" | "vencida" | "falta" }[];
  calculado_en: string;
};

// Última versión de un protocolo de habilitación (vista hab_protocolos_vigentes).
export type ProtocoloVigente = {
  id: string;
  tipo_documento_id: string;
  nombre: string;
  version: number;
  nombre_archivo: string;
  vigente_desde: string | null;
  created_at: string;
};

// Sugerencia curada para el criterio (hab_criterio_fuentes_sugeridas):
// una fuente de otro módulo con su resumen vivo, o un tipo de protocolo
// con su versión vigente (null = todavía no se ha cargado).
export type SugerenciaEvidencia =
  | { clase: "fuente"; fuente: FuenteEvidencia; nota: string | null; resumen: ResumenEvidencia | null; enUso: boolean }
  | { clase: "protocolo"; tipoId: string; nombre: string; vigente: ProtocoloVigente | null; enUso: boolean };

// Lo que abre el panel de detalle de un criterio.
export type DetalleCriterio = {
  evidencias: Evidencia[];
  historial: EvaluacionHistorial[];
  planes: PlanMejora[];
  sugerencias: SugerenciaEvidencia[];
  // Resumen vivo de cada evidencia registro_modulo (por fuente) y versión
  // vigente de cada protocolo usado como evidencia (por tipo).
  resumenes: Partial<Record<FuenteEvidencia, ResumenEvidencia>>;
  protocolos: Record<string, ProtocoloVigente | null>;
  nombresProtocolo: Record<string, string>;
};
