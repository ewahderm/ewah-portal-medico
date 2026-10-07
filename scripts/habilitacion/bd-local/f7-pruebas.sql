-- Pruebas de F7 (0068): checklist, versiones append-only, trámite y
-- suficiencia patrimonial.
\set ON_ERROR_STOP 1
\set SA '''00000000-0000-0000-0000-00000000005a'''
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

create temp table d7 as select
  (select id from hab_documentos_catalogo where codigo = 'rut') as rut,
  (select id from hab_documentos_catalogo where codigo = 'licencia_construccion') as licencia,
  (select id from hab_documentos_catalogo where codigo = 'estados_financieros') as estados,
  (select id from hab_documentos_catalogo where codigo = 'declaracion_autoevaluacion') as declaracion,
  (select id from clinica_servicios_habilitados where sede_id = '00000000-0000-0000-0000-00000000005a' limit 1) as servicio;

-- Forma del renglón según el catálogo
select t.debe_fallar(format('insert into hab_documentos_clinica (clinica_id, documento_catalogo_id, sede_id) values (clinica_actual(), %L, %L)', rut, :SA), 'uno solo para toda la clínica') from d7;
select t.debe_fallar(format('insert into hab_documentos_clinica (clinica_id, documento_catalogo_id) values (clinica_actual(), %L)', licencia), 'uno por cada sede') from d7;
select t.debe_fallar(format('insert into hab_documentos_clinica (clinica_id, documento_catalogo_id) values (clinica_actual(), %L)', declaracion), 'uno por cada servicio') from d7;
select t.debe_fallar(format('insert into hab_documentos_clinica (clinica_id, documento_catalogo_id, no_aplica) values (clinica_actual(), %L, true)', rut), 'no_aplica_justificado') from d7;
insert into hab_documentos_clinica (id, clinica_id, documento_catalogo_id) select '00000000-0000-0000-0000-000000000d01', clinica_actual(), rut from d7;
insert into hab_documentos_clinica (id, clinica_id, documento_catalogo_id, sede_id) select '00000000-0000-0000-0000-000000000d02', clinica_actual(), licencia, :SA from d7;
insert into hab_documentos_clinica (id, clinica_id, documento_catalogo_id) select '00000000-0000-0000-0000-000000000d03', clinica_actual(), estados from d7;
insert into hab_documentos_clinica (clinica_id, documento_catalogo_id, servicio_habilitado_id) select clinica_actual(), declaracion, servicio from d7;
select t.debe_fallar(format('insert into hab_documentos_clinica (clinica_id, documento_catalogo_id) values (clinica_actual(), %L)', rut), 'renglon_unico') from d7;
select t.debe_fallar('update hab_documentos_clinica set sede_id = null where id = ''00000000-0000-0000-0000-000000000d02''', 'no se puede reasignar');

-- Versiones: número por la BD, ruta obligatoria, append-only
insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes, fecha_expedicion)
select clinica_actual(), '00000000-0000-0000-0000-000000000d01', 7, clinica_actual() || '/documentos/00000000-0000-0000-0000-000000000d01/a.pdf', 'rut 2025.pdf', 'application/pdf', 100, current_date - 40;
insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes, fecha_expedicion)
select clinica_actual(), '00000000-0000-0000-0000-000000000d01', 1, clinica_actual() || '/documentos/00000000-0000-0000-0000-000000000d01/b.pdf', 'rut 2026.pdf', 'application/pdf', 100, current_date - 5;
select t.ok(array_agg(version order by version) = '{1,2}', 'versiones 1 y 2 asignadas por la BD; la anterior se conserva')
  from hab_documento_versiones where documento_id = '00000000-0000-0000-0000-000000000d01';
select t.debe_fallar($q$insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes)
  select clinica_actual(), '00000000-0000-0000-0000-000000000d01', 1, clinica_actual() || '/evidencias/x/c.pdf', 'c.pdf', 'application/pdf', 10$q$, 'Ruta de archivo inválida');
select t.debe_fallar($q$insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes)
  select clinica_actual(), '00000000-0000-0000-0000-000000000d03', 1, clinica_actual() || '/documentos/00000000-0000-0000-0000-000000000d03/c.pdf', 'c.pdf', 'application/pdf', 10$q$, 'Ruta de archivo inválida');
insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes)
select clinica_actual(), '00000000-0000-0000-0000-000000000d03', 1, clinica_actual() || '/financiero/00000000-0000-0000-0000-000000000d03/e.pdf', 'estados.pdf', 'application/pdf', 10;
select t.debe_fallar($q$insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes)
  select clinica_actual(), '00000000-0000-0000-0000-000000000d01', 1, clinica_actual() || '/documentos/00000000-0000-0000-0000-000000000d01/x.exe', 'x.exe', 'application/x-msdownload', 10$q$, 'mime_check');
update hab_documento_versiones set nombre_archivo = 'otro';
select t.ok(count(*) = 0, 'update por la API sin efecto') from hab_documento_versiones where nombre_archivo = 'otro';

-- Trámite: radicado → en trámite; visita con subsanables → 8 días hábiles
select fn_hab_registrar_hito(null, 'radicado', current_date - 20, 'RAD-1', null, null, null, null, null, null, null, null);
select t.ok(estado_reps = 'en_tramite', 'radicar pone el perfil en trámite') from hab_perfil_prestador;
select fn_hab_registrar_hito('00000000-0000-0000-0000-000000000b01', 'visita_realizada', '2026-12-18', null, 'acta', true, null, null, null, null, null, null);
-- 18-dic-2026 (viernes) + 8 hábiles sin 21..25 fin de semana y 25-dic festivo: 21,22,23,24,28,29,30,31 → 31-dic
select t.ok(subsanar_hasta = '2026-12-31', 'subsanar hasta = acta + 8 días hábiles con festivos') from hab_tramite_hitos where id = '00000000-0000-0000-0000-000000000b01';
select t.debe_fallar('update hab_tramite_hitos set fecha = current_date where id = ''00000000-0000-0000-0000-000000000b01''', 'row-level|no se edita');
select t.debe_fallar('select fn_hab_registrar_hito(null, ''constancia_expedida'', current_date, null, null, null, null, null, null, null, null, current_date - 1)', 'fecha de vencimiento');
select fn_hab_registrar_hito(null, 'constancia_expedida', current_date - 1, 'CONST-9', null, null, null, null, null, null, null, (current_date + interval '4 years')::date);
select t.ok(estado_reps = 'inscrito' and fecha_vencimiento_reps is not null, 'la constancia deja el perfil inscrito con vencimiento') from hab_perfil_prestador;

-- Suficiencia patrimonial (solo IPS / transporte; lectura con EDIT)
insert into hab_suficiencia_patrimonial (clinica_id, fecha_corte, patrimonio_total, capital, obligaciones_mercantiles_360, obligaciones_laborales_360, pasivo_corriente)
select clinica_actual(), '2025-12-31', 500000000, 100000000, 0, 0, 20000000;
select t.ok(count(*) = 1, 'suficiencia registrada') from hab_suficiencia_patrimonial;

-- Solo VIEW: no ve lo financiero
reset role; select t.como('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select t.ok(count(*) = 2, 'Consulta ve las versiones no financieras') from hab_documento_versiones;
select t.ok(count(*) = 0, 'Consulta no ve estados financieros') from hab_documento_versiones where es_financiero;
select t.ok(count(*) = 0, 'Consulta no ve la suficiencia patrimonial') from hab_suficiencia_patrimonial;
select t.debe_fallar('select fn_hab_registrar_hito(null, ''radicado'', current_date, null, null, null, null, null, null, null, null, null)', 'row-level');

-- Otra clínica
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve documentos ni hitos') from (select id from hab_documentos_clinica union all select id from hab_tramite_hitos) x;
select t.debe_fallar($q$insert into hab_documento_versiones (clinica_id, documento_id, version, storage_path, nombre_archivo, mime, tamano_bytes)
  select clinica_actual(), '00000000-0000-0000-0000-000000000d01', 1, clinica_actual() || '/documentos/00000000-0000-0000-0000-000000000d01/z.pdf', 'z.pdf', 'application/pdf', 10$q$, 'no pertenece');

-- Segunda barrera
reset role;
select t.debe_fallar('delete from hab_documento_versiones', 'no se modifican ni se borran');
select t.debe_fallar('delete from hab_tramite_hitos', 'no se borra');
