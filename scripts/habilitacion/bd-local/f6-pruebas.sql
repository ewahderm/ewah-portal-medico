-- Pruebas de F6 (0067): proveedoras de evidencia, permisos y protocolos.
\set ON_ERROR_STOP 1
\set SA '''00000000-0000-0000-0000-00000000005a'''
\set SB '''00000000-0000-0000-0000-00000000005b'''

-- Calidad (solo Habilitación) ve los resúmenes de módulos que no puede abrir
select t.como('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select t.ok(count(*) = 0, 'Calidad no lee empleados de RRHH directamente') from empleados;
select t.ok(fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)->'conteos' @> '{"total": 2, "con_titulo": 1, "con_tarjeta": 1, "vacunas_vigentes": 1, "vacunas_vencidas": 1}',
  'talento humano: 2 personas, 1 con título y tarjeta, 1 vacuna vencida');
select t.ok(not (fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)::text ~* '(9876543|salari|contrato|diagn)'),
  'talento humano no devuelve salario, contrato ni diagnóstico');
-- 0085 · privacidad: Calidad no tiene rrhh/VIEW → solo conteos, ni un nombre.
select t.ok(fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)->'filas' = '[]'::jsonb
  and fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)->'filas_visibles' = 'false'::jsonb,
  '0085 · sin rrhh/VIEW el resumen de talento humano no trae filas por persona');
select t.ok(not (fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)::text ~* '(Ana Médica|Luis Auxiliar|TP-123)'),
  '0085 · sin rrhh/VIEW no aparece ningún nombre ni tarjeta en el resumen (ni en el detalle)');
select t.ok(fn_hab_resumen_evidencia('ma_temperatura_nevera', :SA)->'conteos' @> '{"neveras": 1, "dias_min": 30, "fuera_de_rango": 1}'
  and fn_hab_resumen_evidencia('ma_temperatura_nevera', :SA)->>'estado' = 'alerta'
  and fn_hab_resumen_evidencia('ma_temperatura_nevera', :SA)->'sugerencia' = 'null', 'nevera: 30/30 días, 1 fuera de 2–8 °C → alerta sin sugerencia');
select t.ok(fn_hab_resumen_evidencia('ma_extintores', :SA)->>'sugerencia' = 'no_cumple', 'extintor vencido → sugiere No cumple');
select t.ok(fn_hab_resumen_evidencia('inv_registro_sanitario', :SA)->>'detalle' like '%Gasa estéril%', 'insumo sin registro sanitario nombrado');
select t.ok(fn_hab_resumen_evidencia('inv_lotes_vencidos', :SA)->'conteos' @> '{"vencidos": 1}', 'lote vencido con existencia');
select t.ok(fn_hab_resumen_evidencia('ma_residuos', :SA)->>'estado' = 'ok' and fn_hab_resumen_evidencia('ma_limpieza', :SA)->>'estado' = 'falta',
  'residuos con registro; limpieza sin registro = falta');
select t.ok(fn_hab_resumen_evidencia('ma_temperatura_ambiente', :SA) ? 'estado'
  and fn_hab_resumen_evidencia('sistema_consentimientos', :SA) ? 'estado'
  and fn_hab_resumen_evidencia('sistema_historia_clinica', :SA)->>'estado' = 'ok', 'las 10 fuentes responden');
select t.debe_fallar(format('select fn_hab_resumen_evidencia(''drop table x'', %L)', :SA), 'desconocida');
select t.debe_fallar(format('select fn_hab_resumen_evidencia(''ma_extintores'', %L, ''{"otra":1}'')', :SA), 'inválidos');
select t.debe_fallar(format('select fn_hab_ev_rrhh_talento_humano(clinica_actual(), %L, ''{}'')', :SA), 'permission denied');

-- Evidencia por referencia y evaluación con ella
create temp table c6 as select
  (select codigo from hab_criterios where codigo = '11.1.TH.1') as th1,
  (select id from hab_criterios where codigo = '11.1.TH.1' and vigente_hasta is null) as th1_id,
  (select id from hab_criterios where codigo = '11.1.MD.4.8' and vigente_hasta is null) as md48_id;
select t.ok(count(*) = 1, 'TH.1 sugiere la fuente de RRHH') from hab_criterio_fuentes_sugeridas s, c6 where s.criterio_id = c6.th1_id;
select t.ok(fn_hab_evaluar(:SA, th1_id, 'cumple', null, null,
  '[{"tipo":"registro_modulo","descripcion":"Talento humano en RRHH","fuente_codigo":"rrhh_talento_humano"}]') is not null,
  'Cumple con evidencia de otro módulo (referencia)') from c6;
select t.ok(fuente_parametros = '{}' and sugerida_por_sistema = false, 'la referencia guarda fuente, no copia datos')
  from hab_evidencias, c6 where criterio_id = c6.th1_id and tipo = 'registro_modulo';
select t.debe_fallar(format($q$insert into hab_evidencias (clinica_id, sede_id, criterio_id, tipo, descripcion, fuente_codigo, fuente_parametros, created_by)
  values (clinica_actual(), %L, %L, 'registro_modulo', 'nevera', 'ma_temperatura_nevera', '{"nevera_id":"00000000-0000-0000-0000-000000000000"}', auth.uid())$q$, :SA, md48_id), 'nevera no pertenece') from c6;
select t.debe_fallar(format($q$insert into hab_evidencias (clinica_id, sede_id, criterio_id, tipo, descripcion, tipo_documento_normativo_id, created_by)
  values (clinica_actual(), %L, %L, 'documento_normativo', 'manual', (select id from tipos_documento_normativo where codigo = 'MANUAL_FUNCIONES'), auth.uid())$q$, :SA, th1_id), 'no es un protocolo de habilitación') from c6;

-- Protocolos de habilitación: Calidad los carga; versión la pone la BD
select t.ok(count(*) = 0, 'Calidad no ve protocolos de RRHH') from documentos_normativos;
insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo)
select clinica_actual(), id, 99, clinica_actual() || '/protocolos/' || id || '/a.pdf', 'bioseguridad v1.pdf' from tipos_documento_normativo where codigo = 'HAB_BIOSEGURIDAD';
insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo)
select clinica_actual(), id, 1, clinica_actual() || '/protocolos/' || id || '/b.pdf', 'bioseguridad v2.pdf' from tipos_documento_normativo where codigo = 'HAB_BIOSEGURIDAD';
select t.ok(array_agg(version order by version) = '{1,2}', 'versiones 1 y 2 asignadas por la BD (ignora la que manda la app)') from documentos_normativos;
select t.ok(bool_and(vigente_desde = (now() at time zone 'America/Bogota')::date), 'vigente_desde en fecha de Colombia, no UTC') from documentos_normativos;
select t.ok(version = 2 and nombre_archivo = 'bioseguridad v2.pdf', 'la vista de vigentes da la última versión') from hab_protocolos_vigentes where codigo = 'HAB_BIOSEGURIDAD';
select t.debe_fallar($q$insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo)
  select clinica_actual(), id, 1, clinica_actual() || '/normativos/x.pdf', 'x.pdf' from tipos_documento_normativo where codigo = 'MANUAL_FUNCIONES'$q$, 'row-level security');
select t.ok(fn_hab_evaluar(:SA, th1_id, 'cumple', null, 'con protocolo',
  format('[{"tipo":"documento_normativo","descripcion":"Bioseguridad","tipo_documento_normativo_id":"%s"}]', (select id from tipos_documento_normativo where codigo = 'HAB_BIOSEGURIDAD'))::jsonb) is not null,
  'evidencia de tipo protocolo de habilitación') from c6;

-- Otro rol / otra clínica
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar(format('select fn_hab_resumen_evidencia(''ma_extintores'', %L)', :SA), 'permiso');
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.debe_fallar(format('select fn_hab_resumen_evidencia(''rrhh_talento_humano'', %L)', :SA), 'no pertenece');
select t.ok(count(*) = 0, 'otra clínica no ve protocolos ajenos') from hab_protocolos_vigentes;

-- Admin de A: no borra protocolos de habilitación; RRHH sigue igual
reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
-- 0085 · con rrhh/VIEW (el admin) sí se ven los nombres, y solo esos 4 campos.
select t.ok((fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)->>'filas_visibles')::boolean
  and jsonb_array_length(fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)->'filas') = 2
  and (select bool_and(f ?& array['nombre', 'titulo', 'tarjeta', 'vacunas'] and (select count(*) from jsonb_object_keys(f)) = 4)
       from jsonb_array_elements(fn_hab_resumen_evidencia('rrhh_talento_humano', :SA)->'filas') f),
  '0085 · con rrhh/VIEW cada persona trae solo nombre, título, tarjeta y vacunas');
delete from documentos_normativos where nombre_archivo like 'bioseguridad%';
select t.ok(count(*) = 2, 'el admin no puede borrar protocolos de habilitación (sin política)') from documentos_normativos where nombre_archivo like 'bioseguridad%';
delete from documentos_normativos where nombre_archivo = 'manual.pdf';
select t.ok(count(*) = 0, 'el admin sí borra protocolos de RRHH como antes') from documentos_normativos where nombre_archivo = 'manual.pdf';
reset role;
select t.debe_fallar('update documentos_normativos set nombre_archivo = ''x'' where nombre_archivo like ''bioseguridad%''', 'no se modifican');
select t.debe_fallar('delete from documentos_normativos where nombre_archivo like ''bioseguridad%''', 'no se modifican');
