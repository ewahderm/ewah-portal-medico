// Estado de un renglón del checklist (HU-3.2). Se CALCULA al leer: guardar
// el estado crearía una segunda verdad que se desincroniza con el tiempo.
// Puro, sin E/S.

import { diasHasta } from "@/lib/habilitacion/ruta";
import type { DocumentoCatalogo, VersionDocumento } from "@/lib/habilitacion/tipos";

export type EstadoDocumento =
  | { estado: "pendiente"; detalle: string }
  | { estado: "no_aplica"; detalle: string }
  // Documento financiero que RLS le oculta a quien no tiene EDIT (0068): no se
  // puede saber si está cargado, y decir "Falta cargarlo" sería falso.
  | { estado: "sin_permiso"; detalle: string }
  | { estado: "cargado"; detalle: string }
  | { estado: "por_vencer"; detalle: string; dias: number }
  | { estado: "vencido"; detalle: string };

export const DIAS_POR_VENCER = 30;

export function estadoDocumento(
  catalogo: Pick<DocumentoCatalogo, "tiene_vencimiento" | "regla_vigencia"> | null,
  renglon: { no_aplica: boolean; no_aplica_justificacion: string | null } | null,
  vigente: Pick<VersionDocumento, "version" | "fecha_expedicion" | "fecha_vencimiento"> | null,
  fechaPlaneadaRadicacion: string | null,
  hoy: string,
): EstadoDocumento {
  if (renglon?.no_aplica) return { estado: "no_aplica", detalle: renglon.no_aplica_justificacion ?? "" };
  if (!vigente) return { estado: "pendiente", detalle: "Falta cargarlo." };

  // Regla de 30 días (certificado de existencia): no puede tener más de 30
  // días el día que radicas. Sin fecha planeada se mide contra hoy.
  if (catalogo?.regla_vigencia === "max_30_dias_radicacion") {
    if (!vigente.fecha_expedicion) {
      return { estado: "por_vencer", detalle: "Escribe la fecha de expedición: no puede tener más de 30 días al radicar.", dias: 0 };
    }
    const referencia = fechaPlaneadaRadicacion && fechaPlaneadaRadicacion >= hoy ? fechaPlaneadaRadicacion : hoy;
    const edad = -diasHasta(vigente.fecha_expedicion, referencia);
    const contra = referencia === hoy ? "hoy" : "la fecha en que piensas radicar";
    if (edad > 30) return { estado: "vencido", detalle: `Tiene ${edad} días a ${contra}: pide uno nuevo (máximo 30).` };
    const quedan = 30 - edad;
    if (quedan <= 7) return { estado: "por_vencer", detalle: `Le quedan ${quedan} días de validez para radicar.`, dias: quedan };
    return { estado: "cargado", detalle: `Versión ${vigente.version}: válido para radicar ${quedan} días más.` };
  }

  if (vigente.fecha_vencimiento) {
    const dias = diasHasta(vigente.fecha_vencimiento, hoy);
    if (dias < 0) return { estado: "vencido", detalle: `Venció hace ${-dias} día${dias === -1 ? "" : "s"}: carga la versión vigente.` };
    if (dias <= DIAS_POR_VENCER) return { estado: "por_vencer", detalle: `Vence en ${dias} día${dias === 1 ? "" : "s"}.`, dias };
  } else if (catalogo?.tiene_vencimiento) {
    return { estado: "por_vencer", detalle: "Este documento vence: escribe su fecha de vencimiento para avisarte a tiempo.", dias: 0 };
  }
  return { estado: "cargado", detalle: `Versión ${vigente.version}.` };
}
