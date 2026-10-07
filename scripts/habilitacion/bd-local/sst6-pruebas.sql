-- Pruebas de SG-SST F6 (0076): capacitaciones, EPP y estado de personas.
\set ON_ERROR_STOP 1
\set E1 '''00000000-0000-0000-0000-0000000005e1'''
\set E2 '''00000000-0000-0000-0000-0000000005e2'''
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;

-- Capacitación realizada con asistentes.
insert into sst_capacitaciones (clinica_id, tema, tipo, fecha, estado) values (clinica_actual(), 'Manejo de cortopunzantes', 'capacitacion', current_date - 2, 'realizada')
returning id as cap \gset
insert into sst_capacitacion_asistentes (capacitacion_id, clinica_id, empleado_id) values (:'cap', clinica_actual(), :E1), (:'cap', clinica_actual(), :E2);
select t.debe_fallar($q$insert into sst_capacitaciones (clinica_id, tema, fecha, estado) values (clinica_actual(), 'Futura realizada', current_date + 5, 'realizada')$q$, 'futura');
select t.debe_fallar(format('update sst_capacitaciones set tema = ''Otro tema'' where id = %L', :'cap'), 'no se modifica');
update sst_capacitaciones set soporte_storage_path = clinica_actual() || '/personas/x/lista.pdf', soporte_nombre_archivo = 'lista.pdf' where id = :'cap';
select t.ok(soporte_nombre_archivo = 'lista.pdf', 'a una realizada se le puede agregar la lista de asistencia') from sst_capacitaciones where id = :'cap';
select t.debe_fallar(format($q$insert into sst_capacitacion_asistentes (capacitacion_id, clinica_id, empleado_id) values (%L, clinica_actual(), '00000000-0000-0000-0000-0000000005b9')$q$, :'cap'), 'no pertenece');

-- EPP: entrega y anulación.
insert into sst_epp_entregas (clinica_id, empleado_id, fecha, elementos, capacitado_uso)
values (clinica_actual(), :E1, current_date - 1, '[{"elemento":"Guantes de nitrilo","cantidad":100}]', true)
returning id as epp \gset
reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar(format('update sst_epp_entregas set fecha = current_date - 3 where id = %L', :'epp'), 'no se modifica');
update sst_epp_entregas set anulado = true, anulado_motivo = 'Se registró a la persona equivocada' where id = :'epp';
select t.debe_fallar(format('update sst_epp_entregas set anulado_motivo = ''cambio de motivo luego'' where id = %L', :'epp'), 'ya está anulada');
insert into sst_epp_entregas (clinica_id, empleado_id, fecha, elementos) values (clinica_actual(), :E1, current_date, '[{"elemento":"Tapabocas","cantidad":50}]');

-- Profesiograma y estado por persona.
insert into sst_examenes_cargo (clinica_id, cargo_id, periodicidad_meses) values (clinica_actual(), '00000000-0000-0000-0000-0000000005c1', 12);
select t.debe_fallar($q$insert into sst_examenes_cargo (clinica_id, cargo_id, periodicidad_meses) values (clinica_actual(), '00000000-0000-0000-0000-0000000005c1', 48) on conflict (cargo_id) do update set periodicidad_meses = 48$q$, 'periodicidad_meses_check');
reset role; select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.ok(ultimo_examen = '2025-10-01' and proximo_examen = '2026-10-01' and periodicidad_meses = 12, 'examen de ingreso + 12 meses del cargo = próximo examen')
  from fn_sst_estado_personas() where empleado_id = :E2;
select t.ok(vacunas_vencidas = 1 and ultima_entrega_epp = current_date and capacitaciones_anio = 1, 'vacuna vencida, EPP vigente (sin la anulada) y capacitación del año')
  from fn_sst_estado_personas() where empleado_id = :E1;

-- Sin permiso y otra clínica.
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar('select * from fn_sst_estado_personas()', 'permiso');
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve capacitaciones ajenas') from sst_capacitaciones;
select t.ok(count(*) = 0, 'ni asistentes') from sst_capacitacion_asistentes;
select t.ok(count(*) = 0, 'ni entregas de EPP') from sst_epp_entregas;
select t.ok(count(*) = 0, 'ni su profesiograma') from sst_examenes_cargo;
select t.ok(count(*) = 0 or bool_and(empleado_id <> :E1), 'el estado por persona es solo de su clínica') from fn_sst_estado_personas();
reset role;
