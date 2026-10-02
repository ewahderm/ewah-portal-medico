-- EWAH Tech Platform — Evoluciones del paciente (control/seguimiento clínico)
-- Aplicar con: npx supabase db push --linked
--
-- Hallazgo del repaso de director-proyecto (2026-10-02): hoy una cita solo
-- se marca "atendida" cuando se crea un Tratamiento (un procedimiento). Si
-- el paciente vuelve para un control post-procedimiento y no se le aplica
-- nada nuevo, no queda ningún registro clínico de esa atención — no es un
-- Tratamiento (no hay procedimiento) y `contactos_paciente` es un log
-- comercial/marketing (tipo llamada/whatsapp/email, resultado agendó
-- cita/no contestó), sin ningún campo clínico. La Resolución 1995 de 1999
-- exige que TODA atención quede en la historia clínica, no solo las
-- facturables.
--
-- Nota de evolución simple en texto libre (decisión acordada con el
-- usuario — no historia clínica estructurada por campos, menor esfuerzo,
-- cubre el hueco legal real). Puede ir ligada a un tratamiento específico
-- (su seguimiento) o solo al paciente (un control general) — ambos casos
-- son válidos, por eso tratamiento_id/cita_id son opcionales.
--
-- Append-only real: a diferencia de Fotos/Anexos/Consentimientos, aquí ni
-- siquiera un administrador puede borrar o editar — una evolución clínica
-- nunca se corrige ni se elimina, solo se agrega una anotación nueva.
--
-- Permiso: reutiliza has_permission('tratamientos','CREATE') — NO el de
-- 'pacientes' que sí usa contactos_paciente (ese es comercial). Una
-- evolución es contenido clínico tan sensible como un tratamiento: solo
-- quien puede documentar clínicamente a un paciente debe poder escribirla,
-- no cualquiera con acceso básico de registrar pacientes (recepción).

create table evoluciones_paciente (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id),
  tratamiento_id uuid references tratamientos(id),
  cita_id uuid references citas(id),
  profesional_id uuid not null references usuarios(id),
  fecha date not null default current_date,
  evolucion text not null,
  proximo_control_fecha date,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index evoluciones_paciente_paciente_id_idx on evoluciones_paciente(paciente_id, fecha desc);
create index evoluciones_paciente_cita_id_idx on evoluciones_paciente(cita_id);
create index evoluciones_paciente_tratamiento_id_idx on evoluciones_paciente(tratamiento_id);

alter table evoluciones_paciente enable row level security;

create policy "evoluciones_paciente_select_propia_clinica" on evoluciones_paciente
  for select using (clinica_id = clinica_actual());

create policy "evoluciones_paciente_insert_con_permiso" on evoluciones_paciente
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );
