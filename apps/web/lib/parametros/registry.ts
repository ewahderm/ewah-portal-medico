// Whitelist de catálogos administrables desde /parametros. El nombre de
// tabla NUNCA se acepta desde el cliente sin pasar por esta lista — es lo
// que hace seguro usar `tabla` como string dinámico en las consultas
// (evita que un valor arbitrario llegue a `.from(tabla)`).
// "general" = usado por 2+ módulos o lo bastante fundacional (sedes,
// identificación) que no pertenece a uno solo. Cualquier otro valor debe
// coincidir con un `codigo` real de la tabla `modulos` — se usa para
// agrupar la pantalla de Parámetros y para decidir si ese grupo se muestra
// (el grupo de un módulo que la clínica no tiene activo no aparece; el
// grupo "general" siempre aparece).
export type ModuloCatalogo =
  | "general"
  | "pacientes"
  | "tratamientos"
  | "citas"
  | "inventario"
  | "campanas"
  | "medio_ambiente"
  | "rrhh";

export type CatalogoConfig = {
  tabla: string;
  nombre: string;
  descripcion: string;
  esGlobal: boolean;
  modulo: ModuloCatalogo;
};

export const CATALOGOS: CatalogoConfig[] = [
  {
    tabla: "tipos_identificacion",
    nombre: "Tipos de identificación",
    descripcion: "Cédula, tarjeta de identidad, pasaporte, etc.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "generos",
    nombre: "Géneros",
    descripcion: "Usado en el registro de pacientes y empleados.",
    esGlobal: true,
    modulo: "pacientes",
  },
  {
    tabla: "paises",
    nombre: "Países",
    descripcion: "Nacionalidad y país de residencia de pacientes.",
    esGlobal: true,
    modulo: "pacientes",
  },
  {
    tabla: "eps",
    nombre: "EPS",
    descripcion: "Entidades Promotoras de Salud colombianas.",
    esGlobal: true,
    modulo: "pacientes",
  },
  {
    tabla: "canales_captacion",
    nombre: "Canales de captación",
    descripcion: "Cómo se enteró el paciente de la clínica (para atribución de marketing).",
    esGlobal: true,
    modulo: "campanas",
  },
  {
    tabla: "sedes",
    nombre: "Sedes",
    descripcion: "Sucursales físicas de tu clínica.",
    esGlobal: false,
    modulo: "general",
  },
  {
    tabla: "medios_pago",
    nombre: "Medios de pago",
    descripcion: "Formas de pago que acepta tu clínica (efectivo, tarjeta, transferencia...).",
    esGlobal: false,
    modulo: "tratamientos",
  },
  {
    tabla: "tipos_extintor",
    nombre: "Tipos de extintor",
    descripcion: "Catálogo de tipos de extintor (PQS, CO2, agua, espuma...) usado en Medio Ambiente.",
    esGlobal: false,
    modulo: "medio_ambiente",
  },
  {
    tabla: "empleados",
    nombre: "Empleados",
    descripcion: "Personal operativo sin acceso al sistema (limpieza, pesaje de residuos) que se puede seleccionar al registrar una bitácora.",
    esGlobal: false,
    modulo: "medio_ambiente",
  },
  {
    tabla: "tipos_vacuna",
    nombre: "Tipos de vacuna",
    descripcion: "Catálogo de vacunas que se pueden registrar en la documentación de un empleado.",
    esGlobal: false,
    modulo: "rrhh",
  },
  {
    tabla: "tipos_contrato",
    nombre: "Tipos de contrato",
    descripcion: "Mantenido por EWAH Tech — define si un tipo de contrato genera nómina laboral (vacaciones, cesantías) u honorarios.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "tipos_examen_ocupacional",
    nombre: "Tipos de examen ocupacional",
    descripcion: "Ingreso, periódico, retiro.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "tipos_cuenta_bancaria",
    nombre: "Tipos de cuenta bancaria",
    descripcion: "Ahorros, corriente.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "tipos_documento_normativo",
    nombre: "Tipos de documento normativo",
    descripcion: "Protocolos y manuales de RRHH/SG-SST/Habilitación que una clínica puede cargar.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "fondos_pension",
    nombre: "Fondos de pensión",
    descripcion: "Entidades administradoras de pensión, por país.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "fondos_cesantias",
    nombre: "Fondos de cesantías",
    descripcion: "Entidades administradoras de cesantías, por país.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "arls",
    nombre: "ARL",
    descripcion: "Administradoras de riesgos laborales, por país.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "bancos",
    nombre: "Bancos",
    descripcion: "Entidades bancarias, por país.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "clases_riesgo",
    nombre: "Clases de riesgo",
    descripcion: "Nivel de riesgo laboral de un cargo — la tarifa de ARL asociada solo aplica en Colombia.",
    esGlobal: true,
    modulo: "rrhh",
  },
  {
    tabla: "tipos_persona",
    nombre: "Tipos de persona",
    descripcion: "Persona natural o jurídica — usado en Datos básicos de la clínica y en Proveedores.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "tipos_documento_prestador",
    nombre: "Tipos de documento (prestador)",
    descripcion: "Identificación de la clínica como prestador de salud ante RIPS — distinto del tipo de identificación de pacientes/proveedores.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "roles_actor_reps",
    nombre: "Roles de actor (REPS)",
    descripcion: "Clasificación del Registro Especial de Prestadores de Salud.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "tipos_transaccion_invima",
    nombre: "Tipos de transacción INVIMA",
    descripcion: "Usado en el reporte regulatorio de la clínica ante INVIMA.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "departamentos",
    nombre: "Departamentos",
    descripcion: "Divisiones geográficas de un país — hoy solo Colombia está sembrado.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "ciudades",
    nombre: "Ciudades",
    descripcion: "Ciudades/municipios por departamento — hoy solo las capitales de Colombia están sembradas.",
    esGlobal: true,
    modulo: "general",
  },
  {
    tabla: "cups",
    nombre: "CUPS",
    descripcion: "Clasificación Única de Procedimientos en Salud — pendiente de cargar el listado oficial vigente.",
    esGlobal: true,
    modulo: "tratamientos",
  },
];

// Consultorios, Insumos, Proveedores, Neveras, Cargos y Tipos de
// tratamiento se sacaron de esta lista a propósito: el motor genérico de
// arriba solo soporta nombre+código, y estos ya necesitan campos propios
// (sede, unidad de medida, datos INVIMA, tipo/número de identificación,
// clase de riesgo, código de habilitación + CUPS) que un formulario
// genérico no puede cubrir — tienen su propio diálogo y tabla (ver
// *-dialog.tsx / *-table.tsx en este mismo directorio), pero se siguen
// viendo como pestañas más de Parámetros en
// app/(protected)/parametros/page.tsx, agrupadas igual que las de arriba.
// Tipos de tratamiento vivió en esta lista hasta 2026-10-06, cuando ganó
// `codigo_habilitacion`/`cups_id` y tuvo que graduarse al mismo patrón.

export function getCatalogo(tabla: string): CatalogoConfig | undefined {
  return CATALOGOS.find((c) => c.tabla === tabla);
}
