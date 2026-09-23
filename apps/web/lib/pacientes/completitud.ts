// Un paciente puede crearse desde Agenda con solo nombre, apellido, correo
// y teléfono (ver crearPacienteRapido) — el documento de identidad se deja
// pendiente a propósito porque muchas veces no se comparte por teléfono o
// WhatsApp, y se completa en el consultorio. Mientras falte cualquiera de
// estos campos, el paciente queda "con información pendiente": no se puede
// registrar un tratamiento para él (ver lib/tratamientos/actions.ts) hasta
// completarlos desde el formulario completo de Pacientes.
export type PacienteCompletitud = {
  tipo_identificacion_id: string | null;
  numero_identificacion: string | null;
  email: string | null;
  telefono1: string | null;
};

export function tieneInfoPendiente(paciente: PacienteCompletitud): boolean {
  return (
    !paciente.tipo_identificacion_id ||
    !paciente.numero_identificacion?.trim() ||
    !paciente.email?.trim() ||
    !paciente.telefono1?.trim()
  );
}
