-- EWAH Tech Platform — Medio Ambiente: jornada AM/PM + empleado responsable
-- Aplicar con: npx supabase db push --linked
--
-- Decisiones confirmadas por el usuario (ver conversación):
--  1. NO se agrega hora de fin en ninguna bitácora — se descartó esa opción.
--  2. "Jornada" (AM/PM) aplica a las 4 bitácoras (temperatura consultorio,
--     temperatura nevera, residuos, limpieza), no solo a las 2 que se
--     llenan en papel.
--  3. En el papel a veces solo se marca la jornada sin hora exacta, así
--     que la hora pasa a ser OPCIONAL y jornada es el dato siempre
--     presente. Esto obliga a partir el antiguo `registrado_en timestamptz
--     not null` en `fecha date not null` + `hora time null` + `jornada
--     text not null`.
--  4. El responsable físico de limpieza/pesaje de residuos (alguien sin
--     acceso al sistema) se registra con un catálogo real `empleados`
--     (mismo patrón que tipos_extintor/neveras), NO texto libre. created_by
--     se mantiene intacto en registros_limpieza/registros_residuos como
--     "quién digitalizó" — empleado_id es un dato nuevo y separado.

-- ============================================================
-- 0. Catálogo de empleados (personal sin acceso al sistema)
-- ============================================================
create table empleados (
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

create trigger empleados_set_updated_at
  before update on empleados
  for each row execute function set_updated_at();

create index empleados_clinica_id_idx on empleados(clinica_id);

alter table empleados enable row level security;

create policy "empleados_select_propia_clinica" on empleados
  for select using (clinica_id = clinica_actual());

create policy "empleados_insert_con_permiso" on empleados
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "empleados_update_con_permiso" on empleados
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 1. fecha + hora (opcional) + jornada, reemplazando registrado_en, en
--    las 4 bitácoras de Medio Ambiente.
-- ============================================================

-- -- Temperatura y humedad de consultorios --
alter table registros_temperatura_consultorio
  add column fecha date,
  add column hora time,
  add column jornada text;

update registros_temperatura_consultorio
set fecha = registrado_en::date,
    hora = registrado_en::time,
    jornada = case when extract(hour from registrado_en) < 12 then 'AM' else 'PM' end;

alter table registros_temperatura_consultorio
  alter column fecha set not null,
  alter column jornada set not null,
  add constraint registros_temp_consultorio_jornada_check check (jornada in ('AM', 'PM'));

drop index if exists registros_temp_consultorio_clinica_idx;
drop index if exists registros_temp_consultorio_consultorio_idx;
alter table registros_temperatura_consultorio drop column registrado_en;

create index registros_temp_consultorio_clinica_idx
  on registros_temperatura_consultorio(clinica_id, fecha desc);
create index registros_temp_consultorio_consultorio_idx
  on registros_temperatura_consultorio(consultorio_id, fecha desc);

-- -- Temperatura de neveras --
alter table registros_temperatura_nevera
  add column fecha date,
  add column hora time,
  add column jornada text;

update registros_temperatura_nevera
set fecha = registrado_en::date,
    hora = registrado_en::time,
    jornada = case when extract(hour from registrado_en) < 12 then 'AM' else 'PM' end;

alter table registros_temperatura_nevera
  alter column fecha set not null,
  alter column jornada set not null,
  add constraint registros_temp_nevera_jornada_check check (jornada in ('AM', 'PM'));

drop index if exists registros_temp_nevera_clinica_idx;
drop index if exists registros_temp_nevera_sede_idx;
alter table registros_temperatura_nevera drop column registrado_en;

create index registros_temp_nevera_clinica_idx
  on registros_temperatura_nevera(clinica_id, fecha desc);
create index registros_temp_nevera_sede_idx
  on registros_temperatura_nevera(sede_id, fecha desc);

-- -- Peso de residuos --
alter table registros_residuos
  add column fecha date,
  add column hora time,
  add column jornada text,
  add column empleado_id uuid references empleados(id);

update registros_residuos
set fecha = registrado_en::date,
    hora = registrado_en::time,
    jornada = case when extract(hour from registrado_en) < 12 then 'AM' else 'PM' end;

alter table registros_residuos
  alter column fecha set not null,
  alter column jornada set not null,
  add constraint registros_residuos_jornada_check check (jornada in ('AM', 'PM'));

drop index if exists registros_residuos_clinica_idx;
drop index if exists registros_residuos_sede_idx;
alter table registros_residuos drop column registrado_en;

create index registros_residuos_clinica_idx
  on registros_residuos(clinica_id, fecha desc);
create index registros_residuos_sede_idx
  on registros_residuos(sede_id, fecha desc);

-- -- Limpieza de consultorios y baños --
alter table registros_limpieza
  add column fecha date,
  add column hora time,
  add column jornada text,
  add column empleado_id uuid references empleados(id);

update registros_limpieza
set fecha = registrado_en::date,
    hora = registrado_en::time,
    jornada = case when extract(hour from registrado_en) < 12 then 'AM' else 'PM' end;

alter table registros_limpieza
  alter column fecha set not null,
  alter column jornada set not null,
  add constraint registros_limpieza_jornada_check check (jornada in ('AM', 'PM'));

drop index if exists registros_limpieza_clinica_idx;
drop index if exists registros_limpieza_sede_idx;
alter table registros_limpieza drop column registrado_en;

create index registros_limpieza_clinica_idx
  on registros_limpieza(clinica_id, fecha desc);
create index registros_limpieza_sede_idx
  on registros_limpieza(sede_id, fecha desc);
