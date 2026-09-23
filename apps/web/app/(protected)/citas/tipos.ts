export { nombreCompleto } from "@/lib/pacientes/nombre";

export type CitaRow = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  es_bloqueo: boolean;
  todo_el_dia: boolean;
  motivo: string | null;
  paciente_id: string | null;
  profesional_id: string;
  tipo_tratamiento_id: string | null;
  pacientes: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  } | null;
  tipos_tratamiento: { nombre: string } | null;
  consultorios: { nombre: string; sede_id: string | null; sedes: { nombre: string } | null } | null;
  profesional: { nombre: string } | null;
  /** Cuántos tratamientos tiene ya esta cita (0 en la mayoría) — para
   * mostrarlo antes de abrir el detalle y evitar registros duplicados
   * por no saber que ya se atendió algo. */
  tratamientos_count: number;
};

export const ESTADO_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  atendida: "Atendida",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
  reprogramada: "Reprogramada",
};
