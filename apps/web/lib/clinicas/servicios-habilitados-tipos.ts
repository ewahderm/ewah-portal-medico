// Forma compartida de una fila de servicio habilitado (0055/0058) — vive
// fuera de servicios-habilitados.ts porque ese archivo es "use server" y no
// puede exportar constantes.
export const SERVICIO_HABILITADO_SELECT =
  "id, codigo_habilitacion, practicas_medicas(id, codigo, nombre, complejidad, requisitos)";

export type ServicioHabilitado = {
  id: string;
  codigo_habilitacion: string | null;
  practicas_medicas: {
    id: string;
    codigo: string | null;
    nombre: string;
    complejidad: string | null;
    requisitos: string | null;
  } | null;
};
