-- ============================================================
-- 0074 · SG-SST F4 · Documentos del sistema
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F4.
-- Los documentos del SG-SST son versiones en documentos_normativos (0048)
-- con tipos de la categoría `sgsst`, igual que Habilitación hizo con los
-- suyos (0067):
--   - Se gestionan desde SG-SST (bucket `sst`, carpeta documentos/), con
--     la versión asignada por la BD bajo candado.
--   - No se modifican ni se borran (Dec. 1072: conservación de 20 años):
--     se sube una versión nueva.
--   - RRHH deja de cargarlos y de borrarlos por su pantalla.
-- Qué documento aplica a cada grupo (7/21/60/independiente) lo decide
-- lib/sst/documentos.ts; aquí solo están los tipos.

insert into tipos_documento_normativo (codigo, nombre, categoria, orden) values
  ('SST_DESIGNACION_RESPONSABLE', 'Designación del responsable del SG-SST', 'sgsst', 201),
  ('SST_AFILIACIONES', 'Soportes de afiliación a seguridad social (salud, pensión y ARL)', 'sgsst', 202),
  ('SST_PROGRAMA_CAPACITACION', 'Programa anual de capacitación en SST', 'sgsst', 203),
  ('SST_PLAN_ANUAL', 'Plan anual de trabajo del SG-SST (firmado)', 'sgsst', 204),
  ('SST_MATRIZ_PELIGROS', 'Matriz de identificación de peligros y valoración de riesgos', 'sgsst', 205),
  ('SST_MEDIDAS_CONTROL', 'Soportes de las medidas de prevención y control', 'sgsst', 206),
  ('SST_PROFESIOGRAMA', 'Profesiograma: exámenes médicos ocupacionales por cargo', 'sgsst', 207),
  ('SST_OBJETIVOS', 'Objetivos del SG-SST', 'sgsst', 208),
  ('SST_ASIGNACION_RECURSOS', 'Asignación de recursos para el SG-SST', 'sgsst', 209),
  ('SST_CONFORMACION_COPASST', 'Conformación del COPASST o designación del vigía', 'sgsst', 210),
  ('SST_CONFORMACION_CONVIVENCIA', 'Conformación del Comité de Convivencia Laboral', 'sgsst', 211),
  ('SST_ARCHIVO', 'Procedimiento de archivo y conservación documental', 'sgsst', 212),
  ('SST_PERFIL_SOCIODEMOGRAFICO', 'Perfil sociodemográfico y diagnóstico de condiciones de salud', 'sgsst', 213),
  ('SST_PROC_REPORTE_INVESTIGACION', 'Procedimiento de reporte e investigación de incidentes y accidentes', 'sgsst', 214),
  ('SST_MANTENIMIENTO', 'Programa de mantenimiento de instalaciones, equipos y herramientas', 'sgsst', 215),
  ('SST_EPP', 'Procedimiento de entrega, uso y reposición de EPP', 'sgsst', 216),
  ('SST_PLAN_EMERGENCIAS', 'Plan de prevención, preparación y respuesta ante emergencias', 'sgsst', 217),
  ('SST_BRIGADA', 'Conformación y capacitación de la brigada de emergencias', 'sgsst', 218),
  ('SST_REGLAMENTO_HIGIENE', 'Reglamento de higiene y seguridad industrial', 'sgsst', 219),
  ('SST_MATRIZ_LEGAL', 'Matriz legal en SST', 'sgsst', 220),
  ('SST_RENDICION_CUENTAS', 'Rendición de cuentas del SG-SST', 'sgsst', 221),
  ('SST_AUDITORIA', 'Informe de auditoría anual del SG-SST', 'sgsst', 222),
  ('SST_REVISION_DIRECCION', 'Revisión por la alta dirección', 'sgsst', 223),
  ('SST_PROTOCOLO_BIOLOGICO', 'Protocolo de exposición a riesgo biológico (accidente con material cortopunzante)', 'sgsst', 224)
on conflict (codigo) do nothing;

create or replace function fn_tipo_normativo_es_sgsst(p_tipo uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from tipos_documento_normativo where id = p_tipo and categoria = 'sgsst') $$;

revoke execute on function fn_tipo_normativo_es_sgsst(uuid) from public, anon;
grant execute on function fn_tipo_normativo_es_sgsst(uuid) to authenticated;

create policy "documentos_normativos_select_sst" on documentos_normativos
  for select using (
    clinica_id = clinica_actual()
    and has_permission('sst', 'VIEW')
    and fn_tipo_normativo_es_sgsst(tipo_documento_id)
  );

create policy "documentos_normativos_insert_sst" on documentos_normativos
  for insert with check (
    clinica_id = clinica_actual()
    and has_permission('sst', 'CREATE')
    and has_entitlement('sst', 'gestion')
    and fn_tipo_normativo_es_sgsst(tipo_documento_id)
    and storage_path like clinica_id::text || '/documentos/%'
  );

-- RRHH ya no carga ni borra los del SG-SST (ni los de habilitación).
drop policy "documentos_normativos_insert_con_permiso" on documentos_normativos;
create policy "documentos_normativos_insert_con_permiso" on documentos_normativos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE')
    and not fn_tipo_normativo_es_habilitacion(tipo_documento_id)
    and not fn_tipo_normativo_es_sgsst(tipo_documento_id)
  );

drop policy "documentos_normativos_delete_admin" on documentos_normativos;
create policy "documentos_normativos_delete_admin" on documentos_normativos
  for delete using (
    clinica_id = clinica_actual() and es_admin()
    and not fn_tipo_normativo_es_habilitacion(tipo_documento_id)
    and not fn_tipo_normativo_es_sgsst(tipo_documento_id)
  );

-- Versión asignada por la BD (mismo patrón que fn_hab_version_siguiente).
create or replace function fn_sst_version_siguiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_tipo_normativo_es_sgsst(new.tipo_documento_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.clinica_id::text || ':' || new.tipo_documento_id::text, 0));
  select coalesce(max(version), 0) + 1 into new.version
  from documentos_normativos
  where clinica_id = new.clinica_id and tipo_documento_id = new.tipo_documento_id;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  new.vigente_desde := fn_hab_hoy();
  return new;
end;
$$;

create trigger documentos_normativos_version_sst
  before insert on documentos_normativos
  for each row execute function fn_sst_version_siguiente();

create or replace function fn_sst_normativo_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if fn_tipo_normativo_es_sgsst(old.tipo_documento_id)
     and (tg_op = 'UPDATE' or exists (select 1 from clinicas where id = old.clinica_id)) then
    raise exception 'Los documentos del SG-SST se conservan (20 años): no se modifican ni se borran, sube una versión nueva.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger documentos_normativos_sst_inmutable
  before update or delete on documentos_normativos
  for each row execute function fn_sst_normativo_inmutable();

revoke execute on function fn_sst_version_siguiente() from public, anon, authenticated;
revoke execute on function fn_sst_normativo_inmutable() from public, anon, authenticated;
