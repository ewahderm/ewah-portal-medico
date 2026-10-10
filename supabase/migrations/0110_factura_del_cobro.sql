-- ============================================================
-- 0110 · La factura electrónica va en el cobro de la atención
-- ============================================================
-- El CUFE identifica una factura electrónica de la DIAN, y la factura se
-- emite por lo que paga el paciente: el cobro de la atención, no cada
-- tratamiento. Decisiones del usuario (2026-10-10):
--   * El cobro guarda número de factura, CUFE y, opcional, el PDF y el XML
--     que emite el sistema de facturación.
--   * Se registran DESPUÉS de cobrar (la factura suele salir más tarde) y se
--     pueden corregir (un CUFE mal copiado); cada cambio queda en la
--     auditoría. Lo cobrado (valor, medio, fecha) sigue sin poder editarse.
--   * Un archivo reemplazado no se borra: la auditoría guarda la ruta
--     anterior, así la factura previa sigue disponible.
-- tratamientos.cufe deja de usarse (0 filas con valor); se borra en 0111,
-- después de publicar el código que ya no la lee.

alter table cobros_atencion
  add column factura_numero text check (factura_numero is null or length(btrim(factura_numero)) between 1 and 40),
  -- CUFE: SHA-384 en hexadecimal (96 caracteres), guardado en minúsculas.
  add column factura_cufe text check (factura_cufe is null or factura_cufe ~ '^[0-9a-f]{96}$'),
  add column factura_pdf_path text,
  add column factura_xml_path text,
  add column factura_actualizada_por uuid references usuarios(id) on delete set null,
  add column factura_actualizada_en timestamptz;

-- Una factura no puede estar en dos cobros vigentes de la misma clínica.
create unique index cobros_atencion_cufe_unico on cobros_atencion (clinica_id, factura_cufe)
  where factura_cufe is not null and not anulado;

comment on column tratamientos.cufe is 'Obsoleta desde 0110: la factura va en cobros_atencion. Se borra en 0111.';

-- Lo cobrado no cambia; la anulación y los datos de la factura, sí.
create or replace function fn_cobro_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cambian text[] := array['anulado', 'anulado_motivo', 'anulado_por', 'anulado_en',
    'factura_numero', 'factura_cufe', 'factura_pdf_path', 'factura_xml_path', 'factura_actualizada_por', 'factura_actualizada_en'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cobro no se borra: anúlalo.';
  end if;
  if (to_jsonb(new) - v_cambian) is distinct from (to_jsonb(old) - v_cambian) then
    raise exception 'Un cobro no se modifica: anúlalo y cobra de nuevo.';
  end if;
  return new;
end;
$$;

-- Número y CUFE (vacío = quitarlo).
create or replace function fn_cobro_factura(p_cobro uuid, p_numero text, p_cufe text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c cobros_atencion%rowtype;
  v_numero text := nullif(btrim(coalesce(p_numero, '')), '');
  v_cufe text := nullif(lower(regexp_replace(coalesce(p_cufe, ''), '\s', '', 'g')), '');
begin
  if v_clinica is null or not has_permission('tratamientos', 'CREATE') then
    raise exception 'No tienes permiso para registrar la factura.';
  end if;
  select * into v_c from cobros_atencion where id = p_cobro and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cobro no existe.';
  end if;
  if v_c.anulado then
    raise exception 'El cobro está anulado: registra la factura en el cobro vigente.';
  end if;
  if v_numero is not null and length(v_numero) > 40 then
    raise exception 'El número de factura es demasiado largo (máximo 40 caracteres).';
  end if;
  if v_cufe is not null and v_cufe !~ '^[0-9a-f]{96}$' then
    raise exception 'El CUFE no es válido: son 96 caracteres (números y letras de la a a la f). Cópialo completo desde la factura.';
  end if;
  if v_cufe is not null and exists (
    select 1 from cobros_atencion where clinica_id = v_clinica and factura_cufe = v_cufe and not anulado and id <> v_c.id
  ) then
    raise exception 'Ese CUFE ya está registrado en otro cobro.';
  end if;
  update cobros_atencion
  set factura_numero = v_numero, factura_cufe = v_cufe, factura_actualizada_por = auth.uid(), factura_actualizada_en = now()
  where id = v_c.id;
end;
$$;

-- Archivo de la factura ya subido al bucket (p_path null = quitarlo).
create or replace function fn_cobro_factura_archivo(p_cobro uuid, p_tipo text, p_path text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c cobros_atencion%rowtype;
begin
  if v_clinica is null or not has_permission('tratamientos', 'CREATE') then
    raise exception 'No tienes permiso para registrar la factura.';
  end if;
  if p_tipo not in ('pdf', 'xml') then
    raise exception 'Tipo de archivo inválido.';
  end if;
  select * into v_c from cobros_atencion where id = p_cobro and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cobro no existe.';
  end if;
  if v_c.anulado then
    raise exception 'El cobro está anulado: registra la factura en el cobro vigente.';
  end if;
  if p_path is not null and p_path not like v_clinica::text || '/' || v_c.id::text || '/%' then
    raise exception 'La ruta del archivo no corresponde a este cobro.';
  end if;
  if p_tipo = 'pdf' then
    update cobros_atencion set factura_pdf_path = p_path, factura_actualizada_por = auth.uid(), factura_actualizada_en = now() where id = v_c.id;
  else
    update cobros_atencion set factura_xml_path = p_path, factura_actualizada_por = auth.uid(), factura_actualizada_en = now() where id = v_c.id;
  end if;
end;
$$;

revoke execute on function fn_cobro_factura(uuid, text, text) from public, anon;
grant execute on function fn_cobro_factura(uuid, text, text) to authenticated;
revoke execute on function fn_cobro_factura_archivo(uuid, text, text) from public, anon;
grant execute on function fn_cobro_factura_archivo(uuid, text, text) to authenticated;

-- Bucket privado: <clinica>/<cobro>/<archivo>. Sin borrado salvo
-- administrador: un archivo reemplazado sigue disponible por su ruta.
insert into storage.buckets (id, name, public)
values ('cobro-facturas', 'cobro-facturas', false)
on conflict (id) do nothing;

create policy "cobro_facturas_storage_select" on storage.objects
  for select using (
    bucket_id = 'cobro-facturas'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and (has_permission('tratamientos', 'VIEW') or has_permission('finanzas', 'VIEW'))
  );

create policy "cobro_facturas_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'cobro-facturas'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('tratamientos', 'CREATE')
  );

create policy "cobro_facturas_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'cobro-facturas'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );
