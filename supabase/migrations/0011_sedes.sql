-- EWAH Tech Platform — Sedes (sucursales físicas de una clínica)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
--
-- El usuario señaló que una clínica puede operar en más de una sede
-- física, y eso hay que reflejarlo desde Agenda (filtrar/agendar por
-- sede) y más adelante en Inventario (el stock de insumos vive por
-- sede, no por clínica completa). Este módulo introduce el concepto a
-- nivel de datos: cada Consultorio pertenece a una Sede.
--
-- Decisión: NO se crea una relación profesional↔sede — cualquier
-- profesional puede atender en cualquier sede de la clínica por ahora
-- (el consultorio elegido ya determina la sede de la cita). Si más
-- adelante hace falta restringir el personal a sedes específicas, se
-- agrega una tabla usuario_sedes sin tocar lo de aquí.

-- ============================================================
-- Catálogo por-clínica: Sedes (vía Parámetros)
-- ============================================================
create table sedes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  direccion text,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

create trigger sedes_set_updated_at
  before update on sedes
  for each row execute function set_updated_at();

create index sedes_clinica_id_idx on sedes(clinica_id);

alter table sedes enable row level security;

create policy "sedes_select_propia_clinica" on sedes
  for select using (clinica_id = clinica_actual());

create policy "sedes_insert_con_permiso" on sedes
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "sedes_update_con_permiso" on sedes
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla solo para EWAH S.A.S.
insert into sedes (clinica_id, codigo, nombre, orden)
select id, 'S1', 'Sede Principal', 1
from clinicas where nit = '901759965';

-- ============================================================
-- Consultorios ahora pertenecen a una Sede
-- ============================================================
alter table consultorios add column sede_id uuid references sedes(id);

update consultorios c
set sede_id = s.id
from sedes s
where c.clinica_id = s.clinica_id and s.codigo = 'S1' and c.sede_id is null;

alter table consultorios alter column sede_id set not null;

-- El código de consultorio ahora es único por sede, no por toda la
-- clínica (dos sedes pueden cada una tener su propio "C1").
alter table consultorios drop constraint consultorios_clinica_id_codigo_key;
alter table consultorios add constraint consultorios_clinica_sede_codigo_key
  unique (clinica_id, sede_id, codigo);

create index consultorios_sede_id_idx on consultorios(sede_id);
