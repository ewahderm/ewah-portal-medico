// Constantes compartidas entre acciones ("use server") y componentes de
// cliente — viven aparte por el mismo gotcha ya conocido del proyecto (un
// archivo "use server" solo puede exportar funciones async).

export const TIPOS_DOCUMENTO_EMPLEADO = [
  { value: "identidad", label: "Documento de identidad" },
  { value: "tarjeta_profesional", label: "Tarjeta profesional" },
  { value: "contrato_trabajo", label: "Contrato de trabajo" },
  { value: "certificado_bancario", label: "Certificado de cuenta bancaria" },
  { value: "vacuna", label: "Vacuna" },
  { value: "examen_ocupacional", label: "Examen ocupacional" },
  { value: "certificado_laboral", label: "Certificado laboral" },
  { value: "acta_diploma", label: "Acta o diploma" },
  { value: "otro_certificado", label: "Otro certificado" },
] as const;

export type TipoDocumentoEmpleado = (typeof TIPOS_DOCUMENTO_EMPLEADO)[number]["value"];

export function labelTipoDocumento(tipo: string): string {
  return TIPOS_DOCUMENTO_EMPLEADO.find((t) => t.value === tipo)?.label ?? tipo;
}

export const ORIGEN_INCAPACIDAD = [
  { value: "enfermedad_general", label: "Enfermedad general" },
  { value: "laboral", label: "Accidente o enfermedad laboral" },
] as const;

export const TIPO_PERIODO_NOMINA = [
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
] as const;

export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;
export const TIPOS_DOCUMENTO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const TIPOS_SALARIO = [
  { value: "ordinario", label: "Ordinario" },
  { value: "integral", label: "Integral" },
] as const;

export const TIPOS_LIQUIDACION_PRESTACIONES = [
  { value: "prima_primer_semestre", label: "Prima 1er semestre (junio)" },
  { value: "fin_de_anio", label: "Fin de año (prima 2º semestre + cesantías + intereses)" },
] as const;

export function labelTipoLiquidacion(tipo: string): string {
  return TIPOS_LIQUIDACION_PRESTACIONES.find((t) => t.value === tipo)?.label ?? tipo;
}
