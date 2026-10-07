-- Pruebas de SG-SST F9 (endurecimiento): matriz de aislamiento sobre TODAS
-- las tablas sst_* (y accidentes_trabajo), privilegios de las funciones
-- definer, storage y autoría.
\set ON_ERROR_STOP 1
select id as a from clinicas where nombre = 'Clinica A' \gset

create temp table tablas_sst as
select c.relname::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'sst\_%' or c.relname = 'accidentes_trabajo')
  and exists (select 1 from pg_attribute x where x.attrelid = c.oid and x.attname = 'clinica_id' and not x.attisdropped);
grant select on tablas_sst to authenticated, anon;
do $$
declare r record; n int; vacias text[] := '{}';
begin
  for r in select t from tablas_sst loop
    execute format('select count(*) from %I where clinica_id = (select id from clinicas where nombre = ''Clinica A'')', r.t) into n;
    if n = 0 then vacias := vacias || r.t; end if;
  end loop;
  raise notice 'OK tablas SST por clínica: % (sin datos de A: %)', (select count(*) from tablas_sst), coalesce(nullif(array_to_string(vacias, ', '), ''), 'ninguna');
end $$;

select t.ok(bool_and(c.relrowsecurity), 'todas las tablas sst_* tienen RLS: ' || coalesce(string_agg(c.relname, ', ') filter (where not c.relrowsecurity), ''))
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'sst\_%';
select t.ok(count(*) = 0, 'ninguna política de SST para anon/public: ' || coalesce(string_agg(tablename || '.' || policyname, ', '), ''))
from pg_policies where schemaname = 'public' and tablename like 'sst\_%' and ('anon' = any(roles));

-- Lectura: B no ve nada de A; sin permiso de SST (a2) no ve nada; anon nada.
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$
declare r record; n int;
begin
  for r in select t from tablas_sst loop
    execute format('select count(*) from %I where clinica_id <> clinica_actual()', r.t) into n;
    if n > 0 then raise exception 'FALLA: la clínica B ve % filas ajenas en %', n, r.t; end if;
  end loop;
  raise notice 'OK la clínica B no ve filas de otra clínica en ninguna tabla SST';
end $$;
-- Escritura: ningún update/delete de B alcanza filas de A.
do $$
declare r record; n int;
begin
  for r in select t from tablas_sst loop
    begin
      execute format('with x as (update %I set clinica_id = clinica_id where clinica_id <> clinica_actual() returning 1) select count(*) from x', r.t) into n;
    exception when others then n := 0;
    end;
    if n > 0 then raise exception 'FALLA: la clínica B modifica % filas ajenas en %', n, r.t; end if;
  end loop;
  raise notice 'OK la clínica B no modifica filas ajenas';
end $$;
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
do $$
declare r record; n int;
begin
  for r in select t from tablas_sst where t <> 'accidentes_trabajo' loop
    execute format('select count(*) from %I', r.t) into n;
    if n > 0 then raise exception 'FALLA: un usuario sin permiso de SST ve % filas en %', n, r.t; end if;
  end loop;
  raise notice 'OK sin permiso de SST no se ve ninguna tabla sst_*';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;
do $$
declare r record; n int;
begin
  for r in select c.relname::text as t from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r', 'v') and c.relname like 'sst\_%' loop
    begin
      execute format('select count(*) from %I', r.t) into n;
    exception when insufficient_privilege then n := 0;
    end;
    if n > 0 then raise exception 'FALLA: anon ve % filas en %', n, r.t; end if;
  end loop;
  raise notice 'OK anon no ve nada de SG-SST (ni catálogos)';
end $$;
reset role;

-- Privilegios de funciones definer.
select t.ok(count(*) = 0, 'anon no ejecuta ninguna función definer de SST: ' || coalesce(string_agg(p.proname, ', '), ''))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.proname like 'fn\_sst\_%' and has_function_privilege('anon', p.oid, 'execute');
select t.ok(coalesce(array_agg(p.proname::text order by p.proname), '{}') = array[
  'fn_sst_conteo_trabajadores', 'fn_sst_estado_personas', 'fn_sst_indicadores', 'fn_sst_iniciar_autoevaluacion', 'fn_sst_refrescar_foto'],
  'authenticated solo ejecuta las RPC definer de SST previstas (validan sesión y permiso): ' || coalesce(string_agg(p.proname, ', ' order by p.proname), ''))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.proname like 'fn\_sst\_%' and has_function_privilege('authenticated', p.oid, 'execute');
select t.ok(count(*) = 0, 'las funciones de trigger SST no se ejecutan por la API: ' || coalesce(string_agg(p.proname, ', '), ''))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'fn\_sst\_%' and p.prorettype = 'trigger'::regtype
  and has_function_privilege('authenticated', p.oid, 'execute');

-- Storage.
select t.ok(file_size_limit = 10485760 and cardinality(allowed_mime_types) = 6 and not public, 'el bucket sst es privado y limita tamaño y formatos') from storage.buckets where id = 'sst';
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'B no ve archivos SST de A') from storage.objects where bucket_id = 'sst';
select t.debe_fallar(format($q$insert into storage.objects (bucket_id, name) values ('sst', %L || '/documentos/x/y.pdf')$q$, :'a'), 'row-level');
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'sin permiso de SST no ve los archivos') from storage.objects where bucket_id = 'sst';
reset role; select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.ok(count(*) = 1, 'el responsable de SST de A sí los ve') from storage.objects where bucket_id = 'sst';
update storage.objects set name = name || '.x' where bucket_id = 'sst';
delete from storage.objects where bucket_id = 'sst';
select t.ok(count(*) = 1 and bool_and(name like '%.pdf'), 'nadie modifica ni borra archivos SST por la API') from storage.objects where bucket_id = 'sst';

-- 0087: subir archivos de gestión exige el plan Pro; el informe de investigación es del plan Gratis.
select t.ok(has_entitlement('sst', 'gestion'), 'A (Pro) sube archivos de gestión');
insert into storage.objects (bucket_id, name) values ('sst', clinica_actual() || '/documentos/z/pro.pdf');
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'gratis') where id = :'a';
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.ok(not has_entitlement('sst', 'gestion'), 'A pasó al plan Gratis');
select t.debe_fallar(format($q$insert into storage.objects (bucket_id, name) values ('sst', %L || '/documentos/z/gratis.pdf')$q$, :'a'), 'row-level');
select t.debe_fallar(format($q$insert into storage.objects (bucket_id, name) values ('sst', %L || '/personas/z/gratis.pdf')$q$, :'a'), 'row-level');
insert into storage.objects (bucket_id, name) values ('sst', clinica_actual() || '/investigaciones/z/informe.pdf');
select t.ok(true, 'el informe de la investigación sí se sube en el plan Gratis');
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'pro') where id = :'a';
select fn_sync_clinica_modulos(:'a');
delete from storage.objects where name like '%/z/%';
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;

-- Autoría forzada en eventos.
insert into accidentes_trabajo (clinica_id, empleado_id, fecha, resumen, tipo_evento, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-0000000005e1', (now() at time zone 'America/Bogota')::date, 'Autoría F9', 'incidente', '00000000-0000-0000-0000-00000000000b');
select t.ok(created_by = auth.uid(), 'el autor del evento sale de la sesión') from accidentes_trabajo where resumen = 'Autoría F9';
reset role;
