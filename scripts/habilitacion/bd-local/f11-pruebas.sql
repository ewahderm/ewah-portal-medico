-- Pruebas de F11 (endurecimiento, 0071): aislamiento entre clínicas en
-- TODAS las tablas hab_*, privilegios de funciones, autoría, IDOR por FK,
-- storage y anulación de la autoevaluación.
\set ON_ERROR_STOP 1
\set SA '''00000000-0000-0000-0000-00000000005a'''
select id as a from clinicas where nombre = 'Clinica A' \gset
select id as b from clinicas where nombre = 'Clinica B' \gset

-- 1. Hay datos de A en las tablas por clínica (si no, la matriz no prueba nada).
create temp table tablas_clinica as
select c.relname::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'hab\_%'
  and exists (select 1 from pg_attribute x where x.attrelid = c.oid and x.attname = 'clinica_id' and not x.attisdropped);
grant select on tablas_clinica to authenticated, anon;
do $$
declare r record; n int; vacias text[] := '{}';
begin
  for r in select t from tablas_clinica loop
    execute format('select count(*) from %I where clinica_id = (select id from clinicas where nombre = ''Clinica A'')', r.t) into n;
    if n = 0 then vacias := vacias || r.t; end if;
  end loop;
  raise notice 'OK tablas por clínica: % (sin datos de A: %)', (select count(*) from tablas_clinica), coalesce(nullif(array_to_string(vacias, ', '), ''), 'ninguna');
end $$;

-- 2. Matriz de lectura: B no ve NADA de A en ninguna tabla; anon no ve nada.
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$
declare r record; n int;
begin
  for r in select t from tablas_clinica loop
    execute format('select count(*) from %I where clinica_id <> clinica_actual()', r.t) into n;
    if n > 0 then raise exception 'FALLA: la clínica B ve % filas ajenas en %', n, r.t; end if;
  end loop;
  raise notice 'OK la clínica B no ve filas de otra clínica en ninguna tabla hab_*';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;
do $$
declare r record; n int;
begin
  for r in select c.relname::text as t from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r', 'v') and c.relname like 'hab\_%' loop
    begin
      execute format('select count(*) from %I', r.t) into n;
    exception when insufficient_privilege then n := 0;
    end;
    if n > 0 then raise exception 'FALLA: anon ve % filas en %', n, r.t; end if;
  end loop;
  raise notice 'OK anon no ve nada de habilitación (ni catálogos)';
end $$;
reset role;

-- 3. Privilegios: ninguna función definer de habilitación para anon, y
--    para authenticated solo la lista cerrada de RPC que validan sesión.
select t.ok(count(*) = 0, 'anon no ejecuta ninguna función definer de habilitación: ' || coalesce(string_agg(p.proname, ', '), ''))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.proname ~ '(hab|servicio_habilitado|tipo_normativo)'
  and has_function_privilege('anon', p.oid, 'execute');
select t.ok(coalesce(array_agg(p.proname::text order by p.proname), '{}') = array[
  'fn_hab_actualizar_codigo_prestador', 'fn_hab_actualizar_edificacion_sede', 'fn_hab_anular_novedad',
  'fn_hab_anular_ocurrencia', 'fn_hab_cerrar_autoevaluacion', 'fn_hab_pais_clinica', 'fn_hab_recalcular_mis_obligaciones',
  'fn_hab_resumen_evidencia', 'fn_tipo_normativo_es_habilitacion', 'fn_tipo_normativo_es_sgsst'],
  'authenticated solo ejecuta las RPC definer previstas: ' || coalesce(string_agg(p.proname, ', ' order by p.proname), ''))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.proname ~ '(hab|servicio_habilitado|tipo_normativo)'
  and has_function_privilege('authenticated', p.oid, 'execute');
select t.ok(bool_and(c.relrowsecurity), 'todas las tablas hab_* tienen RLS')
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'hab\_%';
select t.ok(bool_and(coalesce(c.reloptions, '{}') @> '{security_invoker=true}'), 'las vistas hab_* son security_invoker')
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'hab\_%';

-- 4. H1: la autoría sale de la sesión, no de lo que se envía.
select t.como('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
insert into hab_documentos_clinica (clinica_id, nombre_adicional, created_by, updated_by)
values (clinica_actual(), 'Documento F11', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
select t.ok(created_by = auth.uid() and updated_by = auth.uid(), 'H1: created_by/updated_by forzados al usuario de la sesión')
  from hab_documentos_clinica where nombre_adicional = 'Documento F11';
insert into hab_criterio_asignaciones (clinica_id, sede_id, criterio_id, updated_by)
select clinica_actual(), :SA, criterio_id, '00000000-0000-0000-0000-00000000000b'
from fn_hab_tablero_criterios(:SA) where not es_encabezado and not autorresuelto and responsable_id is null limit 1
returning id as asig \gset
select t.ok(updated_by = auth.uid(), 'H1: la asignación no se puede firmar como otro') from hab_criterio_asignaciones where id = :'asig';
update hab_documentos_clinica set observaciones = 'editado', created_by = '00000000-0000-0000-0000-00000000000b' where nombre_adicional = 'Documento F11';
select t.ok(created_by = auth.uid(), 'H1: al editar, created_by no cambia') from hab_documentos_clinica where nombre_adicional = 'Documento F11';

-- 5. IDOR: B usando ids de A.
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.debe_fallar(format('select fn_hab_evaluar(%L, (select id from hab_criterios limit 1), ''no_cumple'')', :SA), '.');
select t.debe_fallar(format($q$insert into hab_evidencias (clinica_id, sede_id, criterio_id, tipo, descripcion, created_by) values (clinica_actual(), %L, (select id from hab_criterios limit 1), 'nota', 'ajena', auth.uid())$q$, :SA), 'clínica|aplica|row-level');
select t.debe_fallar(format($q$insert into hab_documentos_clinica (clinica_id, sede_id, nombre_adicional) values (clinica_actual(), %L, 'Ajeno')$q$, :SA), 'clínica|sede');
select t.debe_fallar(format('select fn_hab_actualizar_edificacion_sede(%L, ''mixto'', null, false, null)', :SA), 'no pertenece|permiso');
select t.debe_fallar(format('select fn_hab_anular_ocurrencia((select id from hab_obligacion_ocurrencias where clinica_id = %L limit 1), ''intento de anular lo ajeno'')', :'a'), 'No encontramos|permiso');
select t.debe_fallar(format('select fn_hab_resumen_evidencia(''ma_extintores'', %L)', :SA), 'no pertenece');
update hab_perfil_prestador set grupo_supersalud = 'B' where clinica_id = :'a';
update hab_autoevaluaciones set fecha_declaracion_reps = current_date where clinica_id = :'a';
reset role;
select t.ok(grupo_supersalud is distinct from 'B', 'B no edita el perfil de A') from hab_perfil_prestador where clinica_id = :'a';

-- H2: el país de otra clínica no se filtra.
update clinicas set pais_operacion_id = (select id from paises where codigo = 'AR') where id = :'a';
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(fn_hab_pais_clinica(:'a') = (select id from paises where codigo = 'CO'), 'H2: B no averigua el país de A');
reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok(fn_hab_pais_clinica(:'a') = (select id from paises where codigo = 'AR'), 'H2: A sí ve el suyo');
reset role;
select t.ok(fn_hab_pais_clinica(:'a') = (select id from paises where codigo = 'AR'), 'H2: el sistema (cron) ve cualquiera');
update clinicas set pais_operacion_id = (select id from paises where codigo = 'CO') where id = :'a';

-- 6. Storage del bucket habilitacion.
select t.ok(file_size_limit = 10485760 and cardinality(allowed_mime_types) = 6, 'H5: el bucket limita tamaño y formatos') from storage.buckets where id = 'habilitacion';
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'B no ve archivos de A') from storage.objects where bucket_id = 'habilitacion';
select t.debe_fallar(format($q$insert into storage.objects (bucket_id, name) values ('habilitacion', %L || '/evidencias/x/y.pdf')$q$, :'a'), 'row-level');
reset role; select t.como('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select t.ok(count(*) = 1, 'Consulta (VIEW) ve el archivo normal y no el financiero') from storage.objects where bucket_id = 'habilitacion';
reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok(count(*) = 2, 'el administrador ve también el financiero') from storage.objects where bucket_id = 'habilitacion';
update storage.objects set name = name || '.x' where bucket_id = 'habilitacion';
delete from storage.objects where bucket_id = 'habilitacion';
select t.ok(count(*) = 2 and bool_and(name like '%.pdf'), 'nadie modifica ni borra archivos por la API') from storage.objects where bucket_id = 'habilitacion';

-- 7. H4: anular la autoevaluación reabre la ocurrencia del REPS.
select id as ae, ocurrencia_id as oc from hab_autoevaluaciones where not anulado limit 1 \gset
update hab_autoevaluaciones set anulado = true, anulado_motivo = 'Se cerró con datos de prueba' where id = :'ae';
select t.ok(estado = 'anulado', 'H4: la ocurrencia probada solo con la autoevaluación queda anulada') from hab_obligacion_ocurrencias where id = :'oc';
select t.ok(count(*) = 1, 'H4: y nace la pendiente del mismo periodo') from hab_obligacion_ocurrencias where reemplaza_id = :'oc' and estado = 'pendiente';
reset role;

-- 0086 · "hoy" en hora de Colombia: ninguna función del motor usa current_date (UTC),
--        y el resultado no depende de la zona horaria de la sesión.
select t.ok(count(*) = 0, '0086 · aplicabilidad, tablero y progreso sin current_date: ' || coalesce(string_agg(p.proname, ', '), '')) from pg_proc p where p.proname in ('fn_hab_criterio_aplica', 'fn_hab_tablero_criterios', 'fn_hab_progreso_autoevaluacion', 'fn_hab_estados_declaracion') and pg_get_functiondef(p.oid) ~* 'current_date';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
set timezone = 'Pacific/Kiritimati';
select count(*) as n_k from fn_hab_tablero_criterios(:SA) \gset
set timezone = 'Pacific/Pago_Pago';
select count(*) as n_p from fn_hab_tablero_criterios(:SA) \gset
reset timezone;
select t.ok(:n_k = :n_p and :n_k > 0, '0086 · el tablero no cambia con la zona horaria de la sesión');
reset role;
