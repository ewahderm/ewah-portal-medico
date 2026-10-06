// Forma compartida de una fila de servicio habilitado (0055) con sus
// prácticas (0056) — vive fuera de servicios-habilitados.ts porque ese
// archivo es "use server" y no puede exportar constantes.
export const SERVICIO_HABILITADO_SELECT =
  "id, codigo_habilitacion, practicas_medicas(id, codigo, nombre), clinica_practicas_servicio(id, practicas_servicio(id, nombre, complejidad, requisitos))";

export type PracticaServicio = {
  id: string;
  nombre: string;
  complejidad: string | null;
  requisitos: string | null;
};

export type ServicioHabilitado = {
  id: string;
  codigo_habilitacion: string | null;
  practicas_medicas: { id: string; codigo: string | null; nombre: string } | null;
  clinica_practicas_servicio: { id: string; practicas_servicio: PracticaServicio | null }[];
};
