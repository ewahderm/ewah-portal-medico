// Tipos de filas y de RPC del módulo de Habilitación. Sin directiva (lo
// importan cliente y servidor).

import type {
  CampoCaracteristica,
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
