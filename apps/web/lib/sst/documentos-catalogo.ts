// Documentos del SG-SST que aplican a cada grupo (Dec. 1072 de 2015, Art.
// 2.2.4.6.12, y estándares de la Res. 0312 de 2019). Puro. Los grupos están
// en revisión contra el texto oficial (docs/sgsst/diseno-tecnico-sgsst.md
// §1): la pantalla lo dice y nada se bloquea por ellos.

import type { GrupoSst } from "@/lib/sst/grupo";

type Grupo = "7" | "21" | "60" | "independiente";
export type Ciclo = "planear" | "hacer" | "verificar" | "actuar";

export type DocumentoSst = {
  codigo: string;
  ciclo: Ciclo;
  grupos: readonly Grupo[];
  explicacion: string;
  // Recomendado para el sector salud aunque no sea estándar del grupo.
  recomendado?: boolean;
};

const TODOS: readonly Grupo[] = ["7", "21", "60"];
const MEDIANOS: readonly Grupo[] = ["21", "60"];

export const DOCUMENTOS_SST: readonly DocumentoSst[] = [
  { codigo: "SST_DESIGNACION_RESPONSABLE", ciclo: "planear", grupos: TODOS, explicacion: "Carta o contrato que nombra a quien diseña y ejecuta el SG-SST, con sus responsabilidades." },
  { codigo: "SST_AFILIACIONES", ciclo: "planear", grupos: [...TODOS, "independiente"], explicacion: "Planillas PILA o certificados que muestran a todos afiliados a salud, pensión y ARL." },
  { codigo: "POLITICA_SST", ciclo: "planear", grupos: TODOS, explicacion: "Compromiso firmado por la dirección, divulgado y revisado cada año." },
  { codigo: "SST_OBJETIVOS", ciclo: "planear", grupos: MEDIANOS, explicacion: "Objetivos medibles del SG-SST, coherentes con la política." },
  { codigo: "SST_ASIGNACION_RECURSOS", ciclo: "planear", grupos: MEDIANOS, explicacion: "Recursos financieros, técnicos y humanos asignados al SG-SST." },
  { codigo: "SST_PLAN_ANUAL", ciclo: "planear", grupos: TODOS, explicacion: "Actividades del año con metas, responsables, recursos y cronograma, firmado por el empleador y el responsable." },
  { codigo: "SST_PROGRAMA_CAPACITACION", ciclo: "planear", grupos: TODOS, explicacion: "Capacitaciones del año sobre los peligros prioritarios, incluida la inducción." },
  { codigo: "SST_MATRIZ_LEGAL", ciclo: "planear", grupos: ["60"], explicacion: "Normas de SST que le aplican a la clínica y cómo se cumplen." },
  { codigo: "SST_ARCHIVO", ciclo: "planear", grupos: MEDIANOS, explicacion: "Cómo se conservan los registros del SG-SST (20 años los de salud de los trabajadores)." },
  { codigo: "SST_CONFORMACION_COPASST", ciclo: "planear", grupos: MEDIANOS, explicacion: "Acta de elección del COPASST (o designación del vigía) y su periodo de 2 años." },
  { codigo: "SST_CONFORMACION_CONVIVENCIA", ciclo: "planear", grupos: MEDIANOS, explicacion: "Acta de conformación del Comité de Convivencia Laboral (Res. 3461 de 2025)." },
  { codigo: "SST_REGLAMENTO_HIGIENE", ciclo: "planear", grupos: MEDIANOS, explicacion: "Reglamento de higiene y seguridad industrial publicado en la sede." },
  { codigo: "SST_MATRIZ_PELIGROS", ciclo: "hacer", grupos: [...TODOS, "independiente"], explicacion: "Peligros por actividad y su valoración. La puedes construir en la sección Peligros." },
  { codigo: "SST_MEDIDAS_CONTROL", ciclo: "hacer", grupos: TODOS, explicacion: "Evidencia de que las medidas de la matriz se aplican (eliminación, sustitución, ingeniería, administrativas, EPP)." },
  { codigo: "SST_PROFESIOGRAMA", ciclo: "hacer", grupos: TODOS, explicacion: "Qué evaluaciones médicas ocupacionales se hacen a cada cargo y cada cuánto (Res. 1843 de 2025)." },
  { codigo: "SST_PERFIL_SOCIODEMOGRAFICO", ciclo: "hacer", grupos: MEDIANOS, explicacion: "Descripción del personal y diagnóstico de sus condiciones de salud." },
  { codigo: "SST_PROC_REPORTE_INVESTIGACION", ciclo: "hacer", grupos: MEDIANOS, explicacion: "Cómo se reportan e investigan los incidentes, accidentes y enfermedades laborales." },
  { codigo: "SST_MANTENIMIENTO", ciclo: "hacer", grupos: MEDIANOS, explicacion: "Mantenimiento de instalaciones, equipos y herramientas." },
  { codigo: "SST_EPP", ciclo: "hacer", grupos: MEDIANOS, explicacion: "Qué EPP usa cada cargo, cómo se entrega, se repone y se capacita su uso." },
  { codigo: "SST_PLAN_EMERGENCIAS", ciclo: "hacer", grupos: [...MEDIANOS, "independiente"], explicacion: "Análisis de amenazas, rutas de evacuación, simulacros y recursos para emergencias." },
  { codigo: "SST_BRIGADA", ciclo: "hacer", grupos: MEDIANOS, explicacion: "Integrantes de la brigada, su capacitación y su dotación." },
  { codigo: "SST_PROTOCOLO_BIOLOGICO", ciclo: "hacer", grupos: [...TODOS, "independiente"], recomendado: true, explicacion: "Qué hacer ante un pinchazo o salpicadura: atención, reporte a la ARL y seguimiento serológico." },
  { codigo: "SST_RENDICION_CUENTAS", ciclo: "verificar", grupos: ["60"], explicacion: "Informe anual de quienes tienen responsabilidades en el SG-SST." },
  { codigo: "SST_AUDITORIA", ciclo: "verificar", grupos: ["60"], explicacion: "Auditoría anual del SG-SST, planificada con el COPASST." },
  { codigo: "SST_REVISION_DIRECCION", ciclo: "actuar", grupos: ["60"], explicacion: "Revisión anual de la dirección sobre el desempeño del SG-SST." },
];

export const CICLOS: { value: Ciclo; label: string }[] = [
  { value: "planear", label: "Planear" },
  { value: "hacer", label: "Hacer" },
  { value: "verificar", label: "Verificar" },
  { value: "actuar", label: "Actuar" },
];

export type ItemDocumento = DocumentoSst & { aplica: "si" | "no" };

// Con el grupo sin calcular se muestran todos los de 7 (lo mínimo) para no
// esconder nada mientras faltan datos.
export function documentosDelGrupo(grupo: GrupoSst): ItemDocumento[] {
  const g: Grupo = grupo === "sin_calcular" ? "7" : grupo;
  return DOCUMENTOS_SST.map((d) => ({ ...d, aplica: d.grupos.includes(g) ? "si" : "no" }));
}

export function resumenDocumentos(items: ItemDocumento[], cargados: Set<string>) {
  const aplican = items.filter((i) => i.aplica === "si");
  const listos = aplican.filter((i) => cargados.has(i.codigo)).length;
  return { aplican: aplican.length, listos, faltan: aplican.length - listos };
}
