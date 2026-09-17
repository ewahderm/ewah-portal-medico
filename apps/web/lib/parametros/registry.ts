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
    tabla: "canales_captacion",
    nombre: "Canales de captación",
    descripcion: "Cómo se enteró el paciente de la clínica (para atribución de marketing).",
    esGlobal: true,
  },
  {
    tabla: "tipos_tratamiento",
    nombre: "Tipos de tratamiento",
    descripcion: "Menú de tratamientos que ofrece tu clínica (Botox, limpieza facial, etc.).",
    esGlobal: false,
  },
  {
    tabla: "consultorios",
    nombre: "Consultorios",
    descripcion: "Salas/consultorios de tu clínica, usados para agendar citas.",
    esGlobal: false,
  },
  {
    tabla: "sedes",
    nombre: "Sedes",
    descripcion: "Sucursales físicas de tu clínica.",
    esGlobal: false,
  },
  {
    tabla: "medios_pago",
    nombre: "Medios de pago",
    descripcion: "Formas de pago que acepta tu clínica (efectivo, tarjeta, transferencia...).",
    esGlobal: false,
  },
];

export function getCatalogo(tabla: string): CatalogoConfig | undefined {
  return CATALOGOS.find((c) => c.tabla === tabla);
}
