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
  | "medio_ambiente";

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
    tabla: "tipos_tratamiento",
    nombre: "Tipos de tratamiento",
    descripcion: "Menú de tratamientos que ofrece tu clínica (Botox, limpieza facial, etc.).",
    esGlobal: false,
    modulo: "tratamientos",
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
];

// Consultorios, Insumos, Proveedores y Neveras se sacaron de esta lista a
// propósito: el motor genérico de arriba solo soporta nombre+código, y
// estos ya necesitan campos propios (sede, unidad de medida, datos INVIMA,
// tipo/número de identificación) que un formulario genérico no puede cubrir
// — tienen su propio diálogo y tabla (ver *-dialog.tsx / *-table.tsx en
// este mismo directorio), pero se siguen viendo como pestañas más de
// Parámetros en app/(protected)/parametros/page.tsx, agrupadas igual que
// las de arriba.

export function getCatalogo(tabla: string): CatalogoConfig | undefined {
  return CATALOGOS.find((c) => c.tabla === tabla);
}
