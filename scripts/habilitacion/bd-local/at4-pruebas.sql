-- Pruebas de 0112: cada movimiento de inventario valida su lote y su
-- tratamiento (aislamiento entre clínicas, sede y tratamiento anulado).
\set ON_ERROR_STOP 1
\set principal '00000000-0000-0000-0000-0000000a4201'
\set norte '00000000-0000-0000-0000-0000000a4202'
\set lote_b '00000000-0000-0000-0000-0000000a4203'
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- Una atención en el consultorio de la sede principal con un tratamiento.
insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, consultorio_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), (now() at time zone 'America/Bogota')::date, '00000000-0000-0000-0000-0000000a7c01', auth.uid())
returning id as atencion \gset
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(), :'atencion',
  (now() at time zone 'America/Bogota')::date, 100000, '00000000-0000-0000-0000-00000000005a', auth.uid())
returning id as trat \gset

-- Otra clínica: ni un movimiento suelto ni un consumo sobre su lote.
select t.debe_fallar(format($q$insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad) values (clinica_actual(), %L, 'salida', 'desecho', 40)$q$, :'lote_b'), 'no pertenece a esta clínica');
select t.debe_fallar(format($q$insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad, tratamiento_id) values (clinica_actual(), %L, 'salida', 'consumo_tratamiento', 1, %L)$q$, :'lote_b', :'trat'), 'no pertenece a esta clínica');
reset role;
select t.ok(cantidad_actual = 100, 'el lote de la otra clínica no cambia') from lotes where id = :'lote_b';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- Consumo: el lote debe ser de la sede del tratamiento.
select t.debe_fallar(format($q$insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad, tratamiento_id) values (clinica_actual(), %L, 'salida', 'consumo_tratamiento', 2, %L)$q$, :'norte', :'trat'), 'otra sede');
insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad, tratamiento_id)
values (clinica_actual(), :'principal', 'salida', 'consumo_tratamiento', 2, :'trat') returning id as consumo \gset
select t.ok(cantidad_actual = 98, 'un consumo válido descuenta el stock') from lotes where id = :'principal';

-- Reversa: debe corresponder al consumo de ese mismo lote.
select t.debe_fallar(format($q$insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad, tratamiento_id, revierte_movimiento_id) values (clinica_actual(), %L, 'entrada', 'reverso_consumo', 2, %L, %L)$q$, :'norte', :'trat', :'consumo'), 'no corresponde a este lote');

-- Anular el tratamiento devuelve los insumos (la reversa automática pasa la validación)...
update tratamientos set anulado = true, anulado_motivo = 'Prueba 0112', anulado_por = auth.uid(), anulado_en = now() where id = :'trat';
select t.ok(cantidad_actual = 100, 'anular el tratamiento devuelve sus insumos') from lotes where id = :'principal';
-- ...y a un tratamiento anulado ya no se le registran insumos.
select t.debe_fallar(format($q$insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad, tratamiento_id) values (clinica_actual(), %L, 'salida', 'consumo_tratamiento', 1, %L)$q$, :'principal', :'trat'), 'anulado');

-- Los movimientos normales de la propia clínica siguen funcionando.
insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad) values (clinica_actual(), :'norte', 'salida', 'desecho', 5);
select t.ok(cantidad_actual = 95, 'una salida normal en su propio lote funciona') from lotes where id = :'norte';
reset role;
