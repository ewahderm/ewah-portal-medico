-- Pruebas de F5 (0066): reglas de la BD vistas por un usuario autenticado.
-- Cada caso lanza excepción si no se cumple (ON_ERROR_STOP).
\set ON_ERROR_STOP 1
\set SA '''00000000-0000-0000-0000-00000000005a'''
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

select t.ok(count(*) = 465, 'EWAH (11.2.2 mediana intramural, exclusiva) = 465 criterios en el tablero') from fn_hab_tablero_criterios(:SA);
select t.ok(count(*) > 0 and bool_and(estandar_codigo = 'talento_humano'), 'filtro por estándar en el servidor') from fn_hab_tablero_criterios(:SA, 'talento_humano');

create temp table c as
select
 (select criterio_id from fn_hab_tablero_criterios(:SA) where not es_encabezado and not autorresuelto order by servicio_orden, estandar_orden, orden limit 1) ev,
 (select criterio_id from fn_hab_tablero_criterios(:SA) where not es_encabezado and not autorresuelto order by servicio_orden, estandar_orden, orden offset 1 limit 1) ev2,
 (select criterio_id from fn_hab_tablero_criterios(:SA) where es_encabezado limit 1) enc,
 (select criterio_id from fn_hab_tablero_criterios(:SA) where autorresuelto and not es_encabezado limit 1) auto,
 (select id from hab_criterios where id not in (select criterio_id from fn_hab_criterios_aplicables(:SA, current_date)) limit 1) ajeno;

-- Reglas de evaluación
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''cumple'')', :SA, ev), 'evidencia') from c;
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''no_aplica'',''corta'')', :SA, ev), 'no_aplica_justificada') from c;
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''no_cumple'')', :SA, enc), 'encabezado') from c;
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''no_cumple'')', :SA, auto), '11.1') from c;
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''no_cumple'')', :SA, ajeno), 'no aplica') from c;
select t.ok(fn_hab_evaluar(:SA, ev, 'cumple', null, 'Revisado', '[{"tipo":"nota","descripcion":"Hoja de vida verificada"}]') is not null,
  'Cumple con evidencia nueva en la misma transacción') from c;
select fn_hab_evaluar(:SA, ev, 'cumple', null, 'Revisado') from c;
select t.ok(count(*) = 1, 'doble clic no duplica la evaluación') from hab_evaluaciones, c where criterio_id = c.ev;
select fn_hab_evaluar(:SA, ev, 'no_cumple', null, 'Falta firma') as eval_nc from c \gset
select t.ok(estado = 'no_cumple', 'la vigente es la última') from hab_evaluaciones_vigentes, c where criterio_id = c.ev;
update hab_evaluaciones set estado = 'cumple';
select t.ok(count(*) filter (where estado = 'cumple') = 1, 'update por la API no tiene efecto (sin política)') from hab_evaluaciones;

-- Planes de mejora
insert into hab_planes_mejora (clinica_id, sede_id, criterio_id, evaluacion_id, accion, responsable_id, fecha_compromiso)
select clinica_actual(), :SA, ev, :'eval_nc', 'Conseguir la firma del director', auth.uid(), current_date + 30 from c;
select t.debe_fallar(format($q$insert into hab_planes_mejora (clinica_id, sede_id, criterio_id, evaluacion_id, accion, responsable_id, fecha_compromiso)
  select clinica_actual(), %L, %L, e.id, 'Plan desde un cumple', auth.uid(), current_date from hab_evaluaciones e where e.estado='cumple' limit 1$q$, :SA, ev), 'No cumple') from c;
update hab_planes_mejora set estado = 'cerrada', fecha_cierre = current_date, cierre_observacion = 'Firma obtenida y archivada';
select t.debe_fallar('update hab_planes_mejora set accion = ''cambiada luego del cierre''', 'cerrado');

-- Evidencias: se retiran una vez, no se editan
select t.debe_fallar('update hab_evidencias set descripcion = ''otra''', 'retirar');
update hab_evidencias set retirada_en = now(), retiro_motivo = 'Se subió por error al criterio';
select t.ok(bool_and(retirada_por = auth.uid()), 'el retiro lo firma la sesión') from hab_evidencias;
select t.debe_fallar('update hab_evidencias set retirada_en = now(), retiro_motivo = ''otra vez el retiro''', 'ya fue retirada');

-- Asignaciones
insert into hab_criterio_asignaciones (clinica_id, sede_id, criterio_id, responsable_id, fecha_objetivo)
select clinica_actual(), :SA, ev2, auth.uid(), current_date + 10 from c;
select t.debe_fallar(format($q$insert into hab_criterio_asignaciones (clinica_id, sede_id, criterio_id, responsable_id) values (clinica_actual(), %L, %L, '00000000-0000-0000-0000-00000000000b')$q$, :SA, (select ev2 from c)), 'no pertenece|duplicate');

-- Progreso agregado
select t.ok(sum(total) = 465 and sum(no_cumple) = 1 and sum(asignados_a_mi) = 1 and sum(planes_abiertos) = 0,
  'progreso: 465 total, 1 No cumple, 1 asignado, plan cerrado no cuenta') from fn_hab_progreso_autoevaluacion(:SA);

-- Usuario de la misma clínica sin permisos de Habilitación
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'rol sin VIEW no ve evaluaciones') from hab_evaluaciones;
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''no_cumple'')', :SA, ev2), 'row-level security') from c;

-- Otra clínica
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve evaluaciones') from hab_evaluaciones;
select t.ok(count(*) = 0, 'otra clínica no ve evidencias') from hab_evidencias;
select t.ok(count(*) = 0, 'otra clínica no ve el tablero ajeno') from fn_hab_tablero_criterios(:SA);
select t.debe_fallar(format('select fn_hab_evaluar(%L,%L,''no_cumple'')', :SA, ev2), 'no pertenece|no aplica|row-level') from c;

-- Segunda barrera: ni el service role modifica el historial
reset role;
select t.debe_fallar('update hab_evaluaciones set estado = ''cumple''', 'no se modifican');
select t.debe_fallar('delete from hab_evaluaciones', 'no se modifican');
select t.debe_fallar('delete from hab_evidencias', 'no se borran');
select t.debe_fallar('delete from clinica_servicios_habilitados', 'autoevaluación');
