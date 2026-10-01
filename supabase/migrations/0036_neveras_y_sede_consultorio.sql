-- EWAH Tech Platform — Catálogo de Neveras + dependencia Sede→Consultorio
-- Aplicar con: npx supabase db push --linked
--
-- El usuario corrigió dos cosas del módulo Medio Ambiente recién construido:
-- 1. "nevera" era un campo de texto libre — debe ser un catálogo real
--    administrado desde Parámetros, igual que Consultorios (cada nevera
--    pertenece a una sede, igual que cada consultorio).
-- 2. Faltaba el filtro/dependencia Sede→Consultorio en Temperatura y
--    Humedad (ya corregido en el código, sin cambios de esquema — ese
--    registro ya tenía consultorio_id, solo faltaba la UI).
--
-- registros_temperatura_nevera estaba vacía (confirmado antes de este
-- cambio), así que se reemplaza la columna directamente sin migrar datos.

create table neveras (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, sede_id, codigo)
);

create trigger neveras_set_updated_at
  before update on neveras
  for each row execute function set_updated_at();

create index neveras_clinica_id_idx on neveras(clinica_id);
create index neveras_sede_id_idx on neveras(sede_id);

alter table neveras enable row level security;

create policy "neveras_select_propia_clinica" on neveras
  for select using (clinica_id = clinica_actual());

create policy "neveras_insert_con_permiso" on neveras
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "neveras_update_con_permiso" on neveras
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla: una nevera "Principal" por cada sede existente, para que el
-- módulo no quede vacío de catálogo el día que se despliegue esto.
insert into neveras (clinica_id, sede_id, nombre, orden)
select s.clinica_id, s.id, 'Nevera principal', 1
from sedes s;

alter table registros_temperatura_nevera
  add column nevera_id uuid references neveras(id);

-- La tabla está vacía (confirmado), así que no hay filas que requieran
-- backfill antes de volver la columna obligatoria.
alter table registros_temperatura_nevera
  alter column nevera_id set not null;

alter table registros_temperatura_nevera drop column nevera;

create index registros_temp_nevera_nevera_idx
  on registros_temperatura_nevera(nevera_id, registrado_en desc);
