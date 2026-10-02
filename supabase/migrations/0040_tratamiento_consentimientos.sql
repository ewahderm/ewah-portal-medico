-- EWAH Tech Platform — Consentimientos informados por tratamiento
-- Aplicar con: npx supabase db push --linked
--
-- Mismo patrón de Storage+tabla que Anexos (0018_tratamiento_anexos.sql):
-- bucket privado con aislamiento por clínica vía el primer segmento de la
-- ruta. Diferencia deliberada acordada con el usuario: Anexos es una
-- sub-feature de PAGO (requireEntitlement), un consentimiento informado es
-- una necesidad clínica/legal — por eso NO lleva chequeo de entitlement,
-- solo has_permission('tratamientos','CREATE') igual que el resto del
-- núcleo clínico de Tratamientos (que tampoco está gateado por plan).
--
-- Append-only igual que Anexos/Fotos: subir un consentimiento nuevo no
-- borra el anterior (ej. si hubo que repetir el escaneo), solo admin puede
-- eliminar uno. La UI muestra el más reciente como "el" consentimiento del
-- tratamiento, pero el historial completo queda trazable.

insert into storage.buckets (id, name, public)
values ('tratamiento-consentimientos', 'tratamiento-consentimientos', false)
on conflict (id) do nothing;

create policy "tratamiento_consentimientos_storage_select" on storage.objects
  for select using (
    bucket_id = 'tratamiento-consentimientos'
    and (storage.foldername(name))[1] = clinica_actual()::text
  );

create policy "tratamiento_consentimientos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'tratamiento-consentimientos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('tratamientos', 'CREATE')
  );

create policy "tratamiento_consentimientos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'tratamiento-consentimientos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

create table tratamiento_consentimientos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tratamiento_id uuid not null references tratamientos(id) on delete cascade,
  storage_path text not null,
  nombre_archivo text not null,
  -- Número de páginas del PDF ensamblado (informativo, para mostrar en la
  -- lista sin tener que abrir el archivo) — se arma en el navegador a
  -- partir de las fotos capturadas, el servidor solo lo guarda tal cual.
  paginas int not null check (paginas > 0),
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index tratamiento_consentimientos_tratamiento_id_idx on tratamiento_consentimientos(tratamiento_id);

alter table tratamiento_consentimientos enable row level security;

create policy "tratamiento_consentimientos_select_propia_clinica" on tratamiento_consentimientos
  for select using (clinica_id = clinica_actual());

create policy "tratamiento_consentimientos_insert_con_permiso" on tratamiento_consentimientos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );

create policy "tratamiento_consentimientos_delete_admin" on tratamiento_consentimientos
  for delete using (clinica_id = clinica_actual() and es_admin());
