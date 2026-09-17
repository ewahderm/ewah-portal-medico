// Whitelist de catálogos administrables desde /parametros. El nombre de
// tabla NUNCA se acepta desde el cliente sin pasar por esta lista — es lo
// que hace seguro usar `tabla` como string dinámico en las consultas
// (evita que un valor arbitrario llegue a `.from(tabla)`).
export type CatalogoConfig = {
  tabla: string;
  nombre: string;
  descripcion: string;
  esGlobal: boolean;
};

export const CATALOGOS: CatalogoConfig[] = [
  {
    tabla: "tipos_identificacion",
    nombre: "Tipos de identificación",
    descripcion: "Cédula, tarjeta de identidad, pasaporte, etc.",
    esGlobal: true,
  },
  {
    tabla: "generos",
    nombre: "Géneros",
    descripcion: "Usado en el registro de pacientes y empleados.",
    esGlobal: true,
  },
  {
    tabla: "paises",
    nombre: "Países",
    descripcion: "Nacionalidad y país de residencia de pacientes.",
    esGlobal: true,
  },
  {
    tabla: "eps",
    nombre: "EPS",
    descripcion: "Entidades Promotoras de Salud colombianas.",
    esGlobal: true,
  },
  {
    tabla: "medios_contacto",
    nombre: "Medios de contacto",
    descripcion: "Cómo prefiere ser contactado un paciente.",
    esGlobal: true,
  },
];

export function getCatalogo(tabla: string): CatalogoConfig | undefined {
  return CATALOGOS.find((c) => c.tabla === tabla);
}
