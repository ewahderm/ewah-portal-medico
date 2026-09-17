-- EWAH Tech Platform — Módulo Agenda (Citas)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
--
-- Decisiones acordadas con el usuario antes de construir este módulo:
--  - La cita incluye consultorio/sala (no solo profesional) para evitar
--    choques de espacio físico, además de choques de agenda del profesional.
--  - Los choques de horario (mismo profesional o mismo consultorio) NO se
--    bloquean en base de datos: se advierte en la aplicación pero se
--    permite guardar igual (puede ser intencional, ej. procedimientos
--    cortos simultáneos). Por eso no hay un exclusion constraint aquí.
--  - Estados: agendada, confirmada, atendida, cancelada, no_asistio.
--  - Un "bloqueo de horario" (vacaciones, almuerzo, capacitación) vive en
--    la misma tabla que las citas (para verse en la misma agenda) pero
--    con es_bloqueo=true y sin paciente/tratamiento asociado.
--  - Al marcar una cita como "atendida" se crea un tratamiento (en la app,
--    ver lib/tratamientos/actions.ts) y esta tabla guarda tratamiento_id
--    para quedar enlazada — evita capturar los mismos datos dos veces.

-- ============================================================
-- Catálogo por-clínica: Consultorios (vía Parámetros)
-- ============================================================
create table consultorios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

create trigger consultorios_set_updated_at
  before update on consultorios
  for each row execute function set_updated_at();

create index consultorios_clinica_id_idx on consultorios(clinica_id);

alter table consultorios enable row level security;

create policy "consultorios_select_propia_clinica" on consultorios
  for select using (clinica_id = clinica_actual());

create policy "consultorios_insert_con_permiso" on consultorios
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "consultorios_update_con_permiso" on consultorios
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla mínima solo para EWAH S.A.S. — se renombra/amplía desde /parametros.
insert into consultorios (clinica_id, codigo, nombre, orden)
select id, 'C1', 'Consultorio 1', 1
from clinicas where nit = '901759965';

-- ============================================================
-- Citas (y bloqueos de horario)
-- ============================================================
create table citas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid references pacientes(id),
  profesional_id uuid not null references usuarios(id),
  consultorio_id uuid not null references consultorios(id),
  tipo_tratamiento_id uuid references tipos_tratamiento(id),
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  estado text not null default 'agendada'
    check (estado in ('agendada', 'confirmada', 'atendida', 'cancelada', 'no_asistio')),
  es_bloqueo boolean not null default false,
  motivo text,
  tratamiento_id uuid references tratamientos(id),
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hora_fin > hora_inicio),
  -- Una cita real (no bloqueo) siempre tiene paciente y tipo de tratamiento.
  check (es_bloqueo or (paciente_id is not null and tipo_tratamiento_id is not null))
);

create trigger citas_set_updated_at
  before update on citas
  for each row execute function set_updated_at();

create trigger citas_auditoria
  after insert or update or delete on citas
  for each row execute function fn_auditoria();

create index citas_clinica_fecha_idx on citas(clinica_id, fecha);
create index citas_profesional_fecha_idx on citas(profesional_id, fecha);
create index citas_consultorio_fecha_idx on citas(consultorio_id, fecha);
create index citas_paciente_id_idx on citas(paciente_id);

alter table citas enable row level security;

create policy "citas_select_propia_clinica" on citas
  for select using (clinica_id = clinica_actual());

create policy "citas_insert_con_permiso" on citas
  for insert with check (
    clinica_id = clinica_actual() and has_permission('citas', 'CREATE')
  );

create policy "citas_update_con_permiso" on citas
  for update using (
    clinica_id = clinica_actual() and has_permission('citas', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- Registrar el módulo en RBAC
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('citas', 'Agenda', 'Agenda de citas y bloqueos de horario', '/citas', 4, false);

insert into clinica_modulos (clinica_id, modulo_id)
select c.id, m.id from clinicas c cross join modulos m where m.codigo = 'citas'
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'citas' and p.codigo in ('VIEW', 'CREATE', 'EDIT')
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas que se registren
-- de ahora en adelante también reciban el módulo Agenda habilitado.
create or replace function bootstrap_clinica(
  p_nombre_clinica text,
  p_nit text,
  p_admin_id uuid,
  p_admin_nombre text,
  p_admin_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_rol_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_admin_id) then
    raise exception 'p_admin_id % no existe en auth.users', p_admin_id;
  end if;

  if exists (select 1 from usuarios where id = p_admin_id) then
    raise exception 'Ese usuario ya pertenece a una clínica';
  end if;

  insert into clinicas (nombre, nit, plan)
  values (p_nombre_clinica, p_nit, 'trial')
  returning id into v_clinica_id;

  insert into roles (clinica_id, nombre, descripcion, nivel)
  values (v_clinica_id, 'Administrador', 'Acceso total, bypass de RBAC (nivel=1)', 1)
  returning id into v_rol_id;

  insert into usuarios (id, clinica_id, rol_id, nombre, email)
  values (p_admin_id, v_clinica_id, v_rol_id, p_admin_nombre, p_admin_email);

  insert into clinica_modulos (clinica_id, modulo_id)
  select v_clinica_id, id from modulos where codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas');

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas');

  return v_clinica_id;
end;
$$;
