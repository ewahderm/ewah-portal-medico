-- EWAH Tech Platform — Personalización de marca por clínica
-- Aplicar con: npx supabase db push --linked
--
-- Hasta ahora la identidad que ve el paciente en los correos de citas y
-- recordatorios estaba escrita a mano para una sola clínica ("EWAH By Dra.
-- Lorena Pinzón"). Esto permite que cada clínica configure su propio
-- nombre comercial, logo, correo de notificaciones y teléfono — gratis
-- para toda clínica (no es una sub-feature de plan como Anexos).
--
-- Decisión confirmada con el usuario: el correo sigue saliendo del mismo
-- remitente técnico compartido (sin dominio propio verificado todavía),
-- con el nombre de la clínica como identidad visible y un Responder-a
-- personalizado — no se construye verificación de dominio por clínica en
-- esta entrega.

alter table clinicas
  add column nombre_comercial text,
  add column logo_storage_path text,
  add column correo_notificaciones text,
  add column telefono_contacto text;

-- Bucket PÚBLICO — a diferencia de todos los demás buckets de este
-- proyecto (fotos/anexos/consentimientos, todos privados con URL firmada):
-- un logo se embebe en correos vía <img>, que no pueden autenticarse ni
-- depender de una URL firmada de 10 minutos. Mismo aislamiento por carpeta
-- que los buckets privados, pero solo en escritura — la lectura es
-- pública porque el bucket lo es, sin policy de select.
insert into storage.buckets (id, name, public)
values ('clinica-logos', 'clinica-logos', true)
on conflict (id) do nothing;

create policy "clinica_logos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'clinica-logos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

create policy "clinica_logos_storage_update" on storage.objects
  for update using (
    bucket_id = 'clinica-logos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

create policy "clinica_logos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'clinica-logos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

-- `clinicas` no tiene ninguna policy de UPDATE para authenticated, a
-- propósito (ver 0001/0034) — estas dos funciones security definer son la
-- única puerta, cada una valida es_admin() y se limita a la propia clínica
-- antes de tocar la fila. Separadas (texto vs. logo) porque son dos flujos
-- distintos en la UI: el formulario de datos se guarda solo, la subida del
-- logo pasa primero por Storage y luego solo actualiza su columna.

create or replace function fn_actualizar_marca_propia_clinica(
  p_nombre_comercial text,
  p_correo_notificaciones text,
  p_telefono_contacto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede editar la marca de la clínica.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  update clinicas
  set nombre_comercial = nullif(trim(p_nombre_comercial), ''),
      correo_notificaciones = nullif(trim(p_correo_notificaciones), ''),
      telefono_contacto = nullif(trim(p_telefono_contacto), '')
  where id = v_clinica_id;
end;
$$;

create or replace function fn_actualizar_logo_propia_clinica(p_logo_storage_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar el logo de la clínica.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  update clinicas set logo_storage_path = p_logo_storage_path where id = v_clinica_id;
end;
$$;
