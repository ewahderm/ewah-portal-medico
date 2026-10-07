-- Pruebas de SG-SST F5 (0075): matriz de peligros GTC 45.
\set ON_ERROR_STOP 1
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
insert into sst_peligros (clinica_id, proceso, actividad, clasificacion, descripcion, nd, ne, nc)
values (clinica_actual(), 'Asistencial', 'Procedimientos', 'biologico', 'Pinchazos con cortopunzantes', 6, 3, 25)
returning id as p1 \gset
select t.ok(np = 18 and nr = 450 and nivel_riesgo = 'II', 'la BD calcula NP, NR y el nivel (II)') from sst_peligros where id = :'p1';
select t.debe_fallar(format('update sst_peligros set nr = 1 where id = %L', :'p1'), 'DEFAULT');
select t.debe_fallar($q$insert into sst_peligros (clinica_id, proceso, actividad, clasificacion, descripcion, nd, ne, nc) values (clinica_actual(), 'Asistencial', 'Consulta', 'biologico', 'Escala fuera de rango', 5, 3, 25)$q$, 'sst_peligros_nd_check');
update sst_peligros set nd = 10, ne = 4, nc = 100 where id = :'p1';
select t.ok(nivel_riesgo = 'I' and nr = 4000, 'al editar se recalcula (I)') from sst_peligros where id = :'p1';
select t.debe_fallar(format('update sst_peligros set activo = false where id = %L', :'p1'), 'sst_peligro_retiro');

-- Medidas (acciones con origen matriz y jerarquía).
insert into sst_acciones (clinica_id, origen, origen_id, tipo, jerarquia, descripcion, responsable_id, fecha_compromiso)
values (clinica_actual(), 'matriz', :'p1', 'preventiva', 'ingenieria', 'Agujas con dispositivo de seguridad', auth.uid(), current_date + 30);
select t.ok(count(*) = 1, 'medida de intervención con jerarquía') from sst_acciones where origen = 'matriz' and origen_id = :'p1' and jerarquia = 'ingenieria';
select t.debe_fallar($q$insert into sst_acciones (clinica_id, origen, origen_id, descripcion, responsable_id, fecha_compromiso) values (clinica_actual(), 'matriz', gen_random_uuid(), 'Peligro inventado para probar', auth.uid(), current_date)$q$, 'peligro no pertenece');
select t.debe_fallar(format($q$insert into sst_acciones (clinica_id, origen, origen_id, jerarquia, descripcion, responsable_id, fecha_compromiso) values (clinica_actual(), 'matriz', %L, 'otra', 'Jerarquía inválida para probar', auth.uid(), current_date)$q$, :'p1'), 'jerarquia_check');

update sst_peligros set activo = false, retiro_motivo = 'Se cambió a agujas con dispositivo de seguridad' where id = :'p1';
select t.debe_fallar(format('update sst_peligros set descripcion = ''otra'' where id = %L', :'p1'), 'retirado');

-- Plan Gratis: la clínica B no gestiona la matriz.
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve la matriz ajena') from sst_peligros;
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'gratis') where nombre = 'Clinica B';
select fn_sync_clinica_modulos(id) from clinicas where nombre = 'Clinica B';
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.debe_fallar($q$insert into sst_peligros (clinica_id, proceso, actividad, clasificacion, descripcion, nd, ne, nc) values (clinica_actual(), 'Asistencial', 'Consulta', 'fisico', 'Plan gratis', 2, 2, 10)$q$, 'row-level');
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'pro') where nombre = 'Clinica B';
select fn_sync_clinica_modulos(id) from clinicas where nombre = 'Clinica B';
