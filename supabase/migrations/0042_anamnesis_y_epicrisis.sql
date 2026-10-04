-- EWAH Tech Platform — Anamnesis/examen físico inicial + epicrisis
-- Aplicar con: npx supabase db push --linked
--
-- Cierra el otro extremo del hueco de historia clínica que ya resolvió
-- evoluciones_paciente (0041) para el seguimiento sin procedimiento: la
-- puerta de entrada (anamnesis + examen físico de la primera consulta o de
-- un motivo nuevo) y el cierre (epicrisis al terminar un plan de
-- tratamiento). Resolución 1995 de 1999.
--
-- Un solo formulario fijo, sin plantilla por tipo de tratamiento:
-- tipos_tratamiento es un catálogo POR CLÍNICA con códigos libres (ver
-- 0008_tratamientos.sql) — condicionar campos por código sería frágil
-- multi-tenant. Las contraindicaciones más comunes en estética/dermatología
-- (embarazo/lactancia, isotretinoína, anticoagulantes, fototipo) ya cubren
-- la mayoría de procedimientos sin lógica condicional.
--
-- Append-only real, igual que evoluciones_paciente: ni siquiera un
-- administrador puede borrar o editar — una anamnesis nunca se corrige,
-- se agrega una nueva si hace falta.
--
-- Epicrisis NO es tabla nueva — es un tipo especial de evoluciones_paciente
-- (decisión acordada con el usuario): reusa fecha/texto/profesional/
-- tratamiento_id que esa tabla ya tiene en vez de duplicar columnas.

create table anamnesis_paciente (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id),
  tratamiento_id uuid references tratamientos(id),
  cita_id uuid references citas(id),
  profesional_id uuid not null references usuarios(id),
  fecha date not null default current_date,
  motivo_consulta text not null,
  antecedentes_personales text[] not null default '{}',
  antecedentes_otros text,
  alergias text[] not null default '{}',
  alergias_otras text,
  medicamentos_actuales text[] not null default '{}',
  medicamentos_otros text,
  habitos text[] not null default '{}',
  fototipo text,
  examen_fisico_hallazgos text,
  zona_a_tratar text,
  proximo_control_fecha date,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index anamnesis_paciente_paciente_id_idx on anamnesis_paciente(paciente_id, fecha desc);
create index anamnesis_paciente_cita_id_idx on anamnesis_paciente(cita_id);
create index anamnesis_paciente_tratamiento_id_idx on anamnesis_paciente(tratamiento_id);

alter table anamnesis_paciente enable row level security;

create policy "anamnesis_paciente_select_propia_clinica" on anamnesis_paciente
  for select using (clinica_id = clinica_actual());

create policy "anamnesis_paciente_insert_con_permiso" on anamnesis_paciente
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );

alter table evoluciones_paciente
  add column tipo text not null default 'seguimiento'
  check (tipo in ('seguimiento', 'epicrisis'));
