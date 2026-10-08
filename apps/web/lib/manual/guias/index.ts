import type { Guia } from "@/lib/manual/tipos";
import { CONFIGURACION, CREAR_CLINICA, USUARIOS } from "./primeros-pasos";
import { AGENDA, ATENCIONES, PACIENTES, TRATAMIENTOS } from "./atencion";
import { INVENTARIO, RRHH } from "./operacion";
import { FINANZAS_COBROS, FINANZAS_INICIO, FINANZAS_SOCIOS_CIERRE } from "./finanzas";
import { CAMPANAS, REPORTES } from "./relacion";
import { HABILITACION, MEDIO_AMBIENTE, SST } from "./cumplimiento";
import { SUSCRIPCION } from "./administracion";

// Orden de lectura del manual (también el de "anterior / siguiente"): del
// registro de la clínica al día a día y luego cumplimiento y administración.
export const GUIAS: Guia[] = [
  CREAR_CLINICA,
  CONFIGURACION,
  USUARIOS,
  PACIENTES,
  AGENDA,
  ATENCIONES,
  TRATAMIENTOS,
  INVENTARIO,
  RRHH,
  FINANZAS_INICIO,
  FINANZAS_COBROS,
  FINANZAS_SOCIOS_CIERRE,
  CAMPANAS,
  REPORTES,
  MEDIO_AMBIENTE,
  HABILITACION,
  SST,
  SUSCRIPCION,
];
