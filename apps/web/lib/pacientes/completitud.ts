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
  return camposFaltantes(paciente).length > 0;
}

// Lista en español de qué falta exactamente — un badge "Información
// pendiente" sin decir cuál campo no le sirve a nadie: quien lo ve tiene
// que abrir el formulario completo de 12+ campos a adivinar.
export function camposFaltantes(paciente: PacienteCompletitud): string[] {
  const faltantes: string[] = [];
  if (!paciente.tipo_identificacion_id || !paciente.numero_identificacion?.trim()) {
    faltantes.push("documento de identidad");
  }
  if (!paciente.email?.trim()) faltantes.push("correo");
  if (!paciente.telefono1?.trim()) faltantes.push("teléfono");
  return faltantes;
}
