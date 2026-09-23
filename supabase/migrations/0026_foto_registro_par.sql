-- EWAH Tech Platform — Fotos antes/después: un registro es un PAR
-- Aplicar con: npx supabase db push --linked
--
-- Corrige el diseño de la migración 0025: un registro de tratamiento_fotos
-- ya no es "una foto con etiqueta antes/despues", sino un par (foto antes +
-- foto después) con UNA sola observación compartida (zona/perspectiva). El
-- registro se puede crear con una sola de las dos fotos y completarse más
-- tarde agregando la que falta — por eso ambas columnas son nullables, con
-- un check que exige al menos una.

alter table tratamiento_fotos
  add column storage_path_antes text,
  add column storage_path_despues text;

-- Migra las filas existentes: cada una tenía una sola foto con etiqueta.
update tratamiento_fotos set storage_path_antes = storage_path where etiqueta = 'antes';
update tratamiento_fotos set storage_path_despues = storage_path where etiqueta = 'despues';

alter table tratamiento_fotos
  drop column storage_path,
  drop column etiqueta;

alter table tratamiento_fotos
  add constraint tratamiento_fotos_al_menos_una_foto
  check (storage_path_antes is not null or storage_path_despues is not null);

-- Antes cada fila era inmutable (una foto = un registro, sin política de
-- UPDATE). Ahora un registro se completa agregando la foto que falta, así
-- que hace falta UPDATE — mismo permiso que crear (CREATE), porque subir
-- la foto que falta es, en la práctica, seguir cargando evidencia del
-- mismo tratamiento.
create policy "tratamiento_fotos_update_con_permiso" on tratamiento_fotos
  for update using (clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE'))
  with check (clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE'));

-- Anexos: el usuario pidió que cada anexo también lleve observaciones,
-- igual que las fotos (0025_foto_observaciones.sql).
alter table tratamiento_anexos add column observaciones text;
