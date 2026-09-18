-- EWAH Tech Platform — Anexos de Tratamientos (exámenes diagnósticos,
-- ecografías, radiografías, doppler)
-- Aplicar con: npx supabase db push --linked
--
-- Mismo patrón que "Fotos antes/después" (0008_tratamientos.sql): bucket
-- privado de Storage con aislamiento por clínica vía el primer segmento
-- de la ruta del archivo. Diferencias acordadas con el usuario: acepta
-- PDF además de imágenes (son informes/resultados, no solo fotos), y
-- lleva una categoría fija en vez de la etiqueta antes/después.

insert into storage.buckets (id, name, public)
values ('tratamiento-anexos', 'tratamiento-anexos', false)
on conflict (id) do nothing;

create policy "tratamiento_anexos_storage_select" on storage.objects
  for select using (
    bucket_id = 'tratamiento-anexos'
    and (storage.foldername(name))[1] = clinica_actual()::text
  );

create policy "tratamiento_anexos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'tratamiento-anexos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('tratamientos', 'CREATE')
  );

create policy "tratamiento_anexos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'tratamiento-anexos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

create table tratamiento_anexos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tratamiento_id uuid not null references tratamientos(id) on delete cascade,
  storage_path text not null,
  nombre_archivo text not null,
  content_type text not null,
  categoria text not null check (
    categoria in ('examen_diagnostico', 'ecografia', 'radiografia', 'doppler', 'otro')
  ),
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index tratamiento_anexos_tratamiento_id_idx on tratamiento_anexos(tratamiento_id);

alter table tratamiento_anexos enable row level security;

create policy "tratamiento_anexos_select_propia_clinica" on tratamiento_anexos
  for select using (clinica_id = clinica_actual());

create policy "tratamiento_anexos_insert_con_permiso" on tratamiento_anexos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );

create policy "tratamiento_anexos_delete_admin" on tratamiento_anexos
  for delete using (clinica_id = clinica_actual() and es_admin());
