// Forma compartida de una fila de servicio habilitado (0055/0058/0061) —
// vive fuera de servicios-habilitados.ts porque ese archivo es "use server"
// y no puede exportar constantes.
//
// Desde 0061 una fila = práctica × sede: la misma práctica puede estar
// declarada en varias sedes, cada una con su propio código de habilitación.
// sede_id es null solo en filas creadas antes de que la clínica tuviera
// sedes (la UI las marca "Asigna una sede").
export const SERVICIO_HABILITADO_SELECT =
  "id, codigo_habilitacion, sede_id, sedes(nombre), practicas_medicas(id, codigo, nombre, complejidad, requisitos)";

export type ServicioHabilitado = {
  id: string;
  codigo_habilitacion: string | null;
  sede_id: string | null;
  sedes: { nombre: string } | null;
  practicas_medicas: {
    id: string;
    codigo: string | null;
    nombre: string;
    complejidad: string | null;
    requisitos: string | null;
  } | null;
};

// Un tipo de tratamiento apunta a la práctica (servicio general), no a la
// fila por sede (0061, decisión A): su código de habilitación depende de la
// sede donde se presta. Esto resume los códigos de la clínica para esa
// práctica — "Sede Norte: 123 · Sede Sur: sin código" — para la tabla, el
// desplegable y la exportación de Tipos de tratamiento.
export type CodigoPorSede = {
  codigo_habilitacion: string | null;
  sedes: { nombre: string } | null;
};

export function describirCodigosPorSede(filas: CodigoPorSede[] | null | undefined): string {
  if (!filas || filas.length === 0) return "";
  return filas
    .map((f) => `${f.sedes?.nombre ?? "Sin sede"}: ${f.codigo_habilitacion || "sin código"}`)
    .join(" · ");
}
