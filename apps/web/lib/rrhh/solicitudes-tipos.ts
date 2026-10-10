// Solicitudes de vacaciones, permisos y reposiciones (0107). Puro: tipos,
// etiquetas y validaciones que comparten el servidor y los formularios. La
// BD vuelve a validar todo.

export type TipoSolicitud = "vacaciones" | "permiso" | "reposicion";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "cancelada";
export type ModalidadPermiso = "se_repone" | "remunerado" | "no_remunerado";

export const TIPOS_SOLICITUD: { valor: TipoSolicitud; titulo: string; ayuda: string }[] = [
  { valor: "vacaciones", titulo: "Vacaciones", ayuda: "Días de descanso remunerado. Se descuentan de los días acumulados." },
  { valor: "permiso", titulo: "Permiso por horas", ayuda: "Unas horas de un día: una cita médica, una diligencia, una calamidad…" },
  { valor: "reposicion", titulo: "Reposición de horas", ayuda: "Horas que trabajaste de más para reponer un permiso." },
];

export const MODALIDADES: { valor: ModalidadPermiso; titulo: string; ayuda: string }[] = [
  { valor: "se_repone", titulo: "Se repone", ayuda: "El empleado debe reponer estas horas." },
  { valor: "remunerado", titulo: "Remunerado, no se repone", ayuda: "Se paga normal y no hay que reponerlo (ej. cita médica, calamidad)." },
  { valor: "no_remunerado", titulo: "No remunerado", ayuda: "No se repone, pero se descuenta del pago." },
];

export const ESTADOS_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

export const tituloTipo = (t: TipoSolicitud) => TIPOS_SOLICITUD.find((x) => x.valor === t)?.titulo ?? t;
export const tituloModalidad = (m: ModalidadPermiso | null) => (m ? MODALIDADES.find((x) => x.valor === m)?.titulo ?? m : null);

// 1.5 → "1 h 30 min"; 2 → "2 h".
export function formatoHoras(horas: number): string {
  const total = Math.round(horas * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatoDias(dias: number): string {
  const n = Math.round(dias * 100) / 100;
  return `${n.toLocaleString("es-CO")} ${n === 1 ? "día" : "días"}`;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export type EntradaSolicitud = {
  tipo: TipoSolicitud;
  fechaInicio?: string;
  fechaFin?: string;
  fecha?: string;
  horaInicio?: string;
  horaFin?: string;
  motivo?: string;
};

export function validarSolicitud(e: EntradaSolicitud): string | null {
  if (!TIPOS_SOLICITUD.some((t) => t.valor === e.tipo)) return "Elige qué quieres solicitar.";
  const motivo = (e.motivo ?? "").trim();
  if (motivo.length > 500) return "El motivo es demasiado largo (máximo 500 caracteres).";
  if (e.tipo === "vacaciones") {
    if (!e.fechaInicio || !FECHA.test(e.fechaInicio) || !e.fechaFin || !FECHA.test(e.fechaFin)) return "Elige desde cuándo y hasta cuándo.";
    if (e.fechaFin < e.fechaInicio) return "La fecha final no puede ser antes de la inicial.";
    return null;
  }
  if (!e.fecha || !FECHA.test(e.fecha)) return "Elige el día.";
  if (!e.horaInicio || !HORA.test(e.horaInicio) || !e.horaFin || !HORA.test(e.horaFin)) return "Elige la hora de inicio y de fin.";
  if (e.horaFin <= e.horaInicio) return "La hora de fin debe ser después de la de inicio.";
  if (e.tipo === "permiso" && motivo.length < 3) return "Escribe el motivo del permiso.";
  return null;
}

export function horasEntre(horaInicio: string, horaFin: string): number {
  const [h1, m1] = horaInicio.split(":").map(Number);
  const [h2, m2] = horaFin.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
}

export type SaldosEmpleado = {
  laboral: boolean;
  vacaciones: { generados: number; tomados: number; pendientes: number; disponibles: number };
  horas: { por_reponer: number; repuestas: number; pendientes: number };
};

export type SolicitudFila = {
  id: string;
  empleado_id: string;
  tipo: TipoSolicitud;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias: number | null;
  excede_saldo: boolean;
  fecha: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  motivo: string | null;
  estado: EstadoSolicitud;
  modalidad: ModalidadPermiso | null;
  comentario_resolucion: string | null;
  created_at: string;
  resuelto_en: string | null;
  empleado: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  resolutor: { nombre: string } | null;
};
