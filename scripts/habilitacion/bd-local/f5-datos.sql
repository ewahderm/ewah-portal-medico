-- Datos de prueba de F5 sobre una BD local con 0001..0066 aplicadas (ver probar.sh).
create schema if not exists t;
create or replace function t.debe_fallar(p_sql text, p_patron text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if sqlerrm !~* p_patron then raise exception 'falló con otro error: % (esperado ~ %)', sqlerrm, p_patron; end if;
    raise notice 'OK falla: %', left(sqlerrm, 90); return;
  end;
  raise exception 'debía fallar y no falló: %', p_sql;
end $$;
create or replace function t.ok(p_cond boolean, p_que text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALLA: %', p_que; end if;
  raise notice 'OK %', p_que;
end $$;
create or replace function t.como(p_uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_uid::text, false); end $$;
grant usage on schema t to authenticated; grant execute on all functions in schema t to authenticated;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.co'), ('00000000-0000-0000-0000-00000000000b','b@x.co'),
 ('00000000-0000-0000-0000-0000000000a2','a2@x.co');
create temp table ctx as select
  bootstrap_clinica('Clinica A','NIT-A','00000000-0000-0000-0000-00000000000a','Admin A','a@x.co') as a,
  bootstrap_clinica('Clinica B','NIT-B','00000000-0000-0000-0000-00000000000b','Admin B','b@x.co') as b;
update clinicas set plan_id = (select id from planes where codigo='pro') where id = (select a from ctx);
update clinicas set plan_id = (select id from planes where codigo='pro') where id = (select b from ctx);
select fn_sync_clinica_modulos(a) from ctx; select fn_sync_clinica_modulos(b) from ctx;
-- Usuario A2 de la clínica A con un rol SIN permisos de habilitación
insert into roles (id, clinica_id, nombre, nivel) select '00000000-0000-0000-0000-0000000000f1', a, 'Recepción', 3 from ctx;
insert into usuarios (id, clinica_id, rol_id, nombre, email) select '00000000-0000-0000-0000-0000000000a2', a, '00000000-0000-0000-0000-0000000000f1', 'A2', 'a2@x.co' from ctx;
insert into sedes (id, clinica_id, codigo, nombre, orden, uso_edificacion) select '00000000-0000-0000-0000-00000000005a', a, 'P', 'Sede Principal', 1, 'exclusivo_salud' from ctx;
insert into sedes (id, clinica_id, codigo, nombre, orden) select '00000000-0000-0000-0000-00000000005b', b, 'P', 'Sede B', 1 from ctx;
insert into clinica_servicios_habilitados (clinica_id, practica_medica_id, sede_id, modalidades, complejidad)
select (select a from ctx), m.practica, '00000000-0000-0000-0000-00000000005a', '{intramural}', 'mediana'
from (select pm.id as practica from practicas_medicas pm where pm.nombre like 'Especialidades Médicas%' limit 1) m;
