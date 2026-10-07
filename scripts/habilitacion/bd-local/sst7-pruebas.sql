-- Pruebas de SG-SST F7 (0077): plan anual, comités e indicadores.
\set ON_ERROR_STOP 1
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;

-- Plan anual.
insert into sst_plan_actividades (clinica_id, anio, mes, ciclo, actividad, responsable_id)
values (clinica_actual(), 2026, 3, 'hacer', 'Capacitación en cortopunzantes', auth.uid()) returning id as act \gset
select t.debe_fallar(format('update sst_plan_actividades set estado = ''ejecutada'' where id = %L', :'act'), 'sst_plan_ejecutada');
update sst_plan_actividades set estado = 'ejecutada', fecha_ejecucion = '2026-03-15' where id = :'act';
select t.debe_fallar(format('update sst_plan_actividades set actividad = ''Otra'' where id = %L', :'act'), 'no se modifica');
select t.debe_fallar($q$insert into sst_plan_actividades (clinica_id, anio, mes, ciclo, actividad, responsable_id) values (clinica_actual(), 2026, 4, 'hacer', 'Responsable ajeno', '00000000-0000-0000-0000-00000000000b')$q$, 'no pertenece');

-- Comités.
insert into sst_comites (clinica_id, tipo, fecha_inicio, fecha_fin, integrantes)
values (clinica_actual(), 'vigia', '2026-01-15', '2028-01-14', '[{"nombre":"Vigía","representa":"trabajadores","rol":"vigia"}]') returning id as com \gset
select t.debe_fallar($q$insert into sst_comites (clinica_id, tipo, fecha_inicio, fecha_fin, integrantes) values (clinica_actual(), 'copasst', '2026-01-01', '2030-01-01', '[{"nombre":"x"}]')$q$, 'sst_comite_periodo');
insert into sst_comite_reuniones (clinica_id, comite_id, fecha, temas) values (clinica_actual(), :'com', '2026-02-10', 'Revisión de accidentes del mes');
select t.debe_fallar(format($q$insert into sst_comite_reuniones (clinica_id, comite_id, fecha, temas) values (clinica_actual(), %L, current_date + 3, 'Futura')$q$, :'com'), 'futura');
reset role;
select t.debe_fallar(format('update sst_comites set fecha_fin = ''2029-01-01'' where id = %L', :'com'), 'no se modifica');
select t.debe_fallar('delete from sst_comite_reuniones', 'no se modifica');

-- Indicadores de agosto 2026: el accidente de sst3 (14-ago) y la incapacidad 28-ago a 1-sep (4 días en agosto).
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.ok(i.accidentes >= 1 and i.dias_ausencia = 4 and i.dias_programados = i.trabajadores * 19 and i.trabajadores >= 3,
  format('agosto: %s AT, %s días de ausencia (de una incapacidad que cruza el mes), %s programados (19 hábiles: festivos 7 y 17 × %s)', i.accidentes, i.dias_ausencia, i.dias_programados, i.trabajadores))
  from fn_sst_indicadores(2026) i where i.mes = 8;
select t.ok(dias_ausencia = 1, 'septiembre: el día restante de la incapacidad') from fn_sst_indicadores(2026) where mes = 9;
select t.debe_fallar('select * from fn_sst_indicadores(1990)', 'Año inválido');
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar('select * from fn_sst_indicadores(2026)', 'permiso');
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve el plan ajeno') from sst_plan_actividades;
select t.ok(count(*) = 0, 'ni los comités') from sst_comites;
select t.ok(count(*) = 0, 'ni las reuniones') from sst_comite_reuniones;
select t.ok(sum(accidentes) = 0, 'sus indicadores son solo de su clínica') from fn_sst_indicadores(2026);
reset role;
