-- EWAH Tech Platform — Contactos de paciente (registro tipo CRM)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
--
-- El usuario pidió que la ficha del paciente funcione como un CRM
-- integrado: además de Tratamientos y Citas, un registro de cada
-- llamada/mensaje/seguimiento hecho al paciente (marketing, recordatorios,
-- postventa). No existía ningún concepto parecido en el legado ni en la
-- plataforma nueva — es un módulo nuevo.
--
-- Decisiones: registro append-only (no tiene sentido "editar" el
-- historial de qué se dijo en una llamada — si hay que corregir algo se
-- agrega un contacto nuevo, igual de simple que se ve en la práctica un
-- log de CRM). No se creó un módulo de RBAC nuevo — reutiliza los
-- permisos de 'pacientes' (VIEW para ver la pestaña, CREATE para
-- registrar un contacto) para no inflar la matriz de permisos por una
-- función tan chica.

create table contactos_paciente (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('llamada', 'whatsapp', 'email', 'presencial')),
  nota text not null,
  resultado text check (resultado in ('agendo_cita', 'no_contesto', 'rechazo', 'pendiente', 'otro')),
  proxima_accion_fecha date,
  proxima_accion_nota text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index contactos_paciente_paciente_id_idx on contactos_paciente(paciente_id, fecha desc);
create index contactos_paciente_clinica_id_idx on contactos_paciente(clinica_id);

alter table contactos_paciente enable row level security;

create policy "contactos_paciente_select_propia_clinica" on contactos_paciente
  for select using (clinica_id = clinica_actual());

create policy "contactos_paciente_insert_con_permiso" on contactos_paciente
  for insert with check (
    clinica_id = clinica_actual() and has_permission('pacientes', 'CREATE')
  );
