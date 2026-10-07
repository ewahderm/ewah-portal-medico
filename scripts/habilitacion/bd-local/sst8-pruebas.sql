-- Pruebas de SG-SST F2 (0078): estándares mínimos y autoevaluación.
\set ON_ERROR_STOP 1
select t.ok(count(*) = 60 and sum(peso) = 100 and count(*) filter (where en_7) = 7 and count(*) filter (where en_21) = 21,
  'catálogo: 60 ítems, 100 puntos, 7 y 21') from sst_estandares;
select t.ok(sum(peso) filter (where ciclo = 'planear') = 25 and sum(peso) filter (where ciclo = 'hacer') = 60
  and sum(peso) filter (where ciclo = 'verificar') = 5 and sum(peso) filter (where ciclo = 'actuar') = 10,
  'pesos por ciclo 25/60/5/10') from sst_estandares;

select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.debe_fallar($q$insert into sst_autoevaluaciones (clinica_id, anio, grupo) values (clinica_actual(), 2025, '7')$q$, 'row-level');
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2026, '12')$q$, 'Grupo');
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2099, '7')$q$, 'Año inválido');

-- 0087: el grupo lo calcula la BD (misma regla de lib/sst/grupo.ts). La clínica A tiene
-- un cargo de clase IV: le corresponden 60 y no puede iniciar con un grupo menor.
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2026, '7')$q$, 'Te corresponden 60');
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2026, '21')$q$, 'Te corresponden 60');
select fn_sst_iniciar_autoevaluacion(2024, '60') as ae60 \gset
select t.ok(count(*) = 60, 'grupo 60: 60 ítems') from sst_autoevaluacion_items where autoevaluacion_id = :'ae60';
select t.ok(count(*) = 60, 'cada ítem guarda la foto del estándar (nombre, peso, orden…)')
  from sst_autoevaluacion_items where autoevaluacion_id = :'ae60' and snap_nombre is not null and snap_peso > 0 and snap_orden > 0;

-- Variamos el diagnóstico como superusuario (cargo de riesgo y personal) y volvemos a como estaba.
reset role;
select clinicas.id as clinica_a from clinicas where nombre = 'Clinica A' \gset
select clase_riesgo_id as clase_vieja from cargos where id = '00000000-0000-0000-0000-0000000005c1' \gset
select otros_trabajadores as otros_viejos from sst_perfil where clinica_id = :'clinica_a' \gset
update sst_perfil set otros_trabajadores = 0 where clinica_id = :'clinica_a';
update cargos set clase_riesgo_id = null where id = '00000000-0000-0000-0000-0000000005c1';
select t.ok(fn_sst_grupo_requerido(:'clinica_a') is null, 'sin clase de riesgo el grupo no se puede calcular');
update cargos set clase_riesgo_id = (select id from clases_riesgo where codigo = 'III' limit 1) where id = '00000000-0000-0000-0000-0000000005c1';
select t.ok(fn_sst_grupo_requerido(:'clinica_a') = '7', 'pocos trabajadores y clase III: 7 estándares');
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select fn_sst_iniciar_autoevaluacion(2026, '7') as ae \gset
select t.ok(count(*) = 7, 'grupo 7: la BD pone 7 ítems') from sst_autoevaluacion_items where autoevaluacion_id = :'ae';
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2026, '21')$q$, 'Ya existe');
reset role;
update sst_perfil set otros_trabajadores = 20 where clinica_id = :'clinica_a';
select t.ok(fn_sst_grupo_requerido(:'clinica_a') = '21', '11 a 50 trabajadores y clase III: 21 estándares');
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2025, '7')$q$, 'Te corresponden 21');
select fn_sst_iniciar_autoevaluacion(2025, '21') as ae21 \gset
select t.ok(count(*) = 21, 'grupo 21: 21 ítems') from sst_autoevaluacion_items where autoevaluacion_id = :'ae21';
reset role;
update cargos set clase_riesgo_id = :'clase_vieja' where id = '00000000-0000-0000-0000-0000000005c1';
update sst_perfil set otros_trabajadores = :otros_viejos where clinica_id = :'clinica_a';
select t.ok(fn_sst_grupo_requerido(:'clinica_a') = '60', 'restaurado el cargo clase IV: 60 estándares');
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
-- La foto no se inventa (solo puede igualar al catálogo).
select t.debe_fallar(format($q$update sst_autoevaluacion_items set snap_peso = 50 where autoevaluacion_id = %L$q$, :'ae21'), 'foto');
select t.debe_fallar(format($q$update sst_autoevaluacion_items set snap_nombre = 'Inventado' where autoevaluacion_id = %L$q$, :'ae21'), 'foto');

select t.debe_fallar(format($q$update sst_autoevaluacion_items set estado = 'no_aplica', justificacion = 'corta' where autoevaluacion_id = %L$q$, :'ae'), 'sst_item_no_aplica_justificado');
-- Sin APPROVE el cierre no aplica (RLS); con APPROVE, no cierra con pendientes.
update sst_autoevaluaciones set estado = 'cerrada' where id = :'ae';
select t.ok(estado = 'abierta', 'sin APPROVE no se cierra') from sst_autoevaluaciones where id = :'ae';
reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar(format($q$update sst_autoevaluaciones set estado = 'cerrada' where id = %L$q$, :'ae'), 'sin calificar');
reset role; select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.debe_fallar(format($q$update sst_autoevaluacion_items set estandar_codigo = (select codigo from sst_estandares where not en_7 limit 1) where autoevaluacion_id = %L$q$, :'ae'), 'no cambia');

-- Todos cumplen menos el de mayor peso.
update sst_autoevaluacion_items set estado = 'cumple' where autoevaluacion_id = :'ae';
update sst_autoevaluacion_items i set estado = 'no_cumple', observacion = 'Sin evidencia'
  where i.id = (select i2.id from sst_autoevaluacion_items i2 join sst_estandares e on e.codigo = i2.estandar_codigo
                where i2.autoevaluacion_id = :'ae' order by e.peso desc, e.orden limit 1)
  returning i.id as item \gset
select t.ok(updated_by = auth.uid(), 'el autor lo pone la BD') from sst_autoevaluacion_items where id = :'item';

-- Plan de mejoramiento sobre el ítem.
insert into sst_acciones (clinica_id, origen, origen_id, tipo, descripcion, responsable_id, fecha_compromiso)
values (clinica_actual(), 'autoevaluacion', :'item', 'mejora', 'Conseguir la evidencia del estándar', auth.uid(), current_date + 30);
select t.debe_fallar($q$insert into sst_acciones (clinica_id, origen, origen_id, descripcion, responsable_id, fecha_compromiso) values (clinica_actual(), 'autoevaluacion', gen_random_uuid(), 'Ítem inventado para probar', auth.uid(), current_date)$q$, 'no pertenece');

reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
update sst_autoevaluaciones set estado = 'cerrada', puntaje = 100, nivel = 'aceptable' where id = :'ae';
select t.ok(a.puntaje = round((s.total - s.maximo) / s.total * 100, 2) and a.nivel = (case when a.puntaje < 60 then 'critico' when a.puntaje <= 85 then 'moderado' else 'aceptable' end)
  and a.cerrada_por = auth.uid() and a.fecha_cierre is not null,
  format('al cerrar la BD calcula el puntaje (%s, %s) e ignora lo que manda el cliente', a.puntaje, a.nivel))
  from sst_autoevaluaciones a,
  (select sum(e.peso) total, max(e.peso) maximo from sst_autoevaluacion_items i join sst_estandares e on e.codigo = i.estandar_codigo where i.autoevaluacion_id = :'ae') s
  where a.id = :'ae';
select t.debe_fallar(format($q$update sst_autoevaluacion_items set estado = 'cumple' where id = %L$q$, :'item'), 'cerrada');
select t.debe_fallar(format($q$update sst_autoevaluaciones set estado = 'abierta' where id = %L$q$, :'ae'), 'cerrada');

-- 0087 · el cierre es una FOTO inmutable: si el catálogo se corrige después, lo cerrado no cambia.
reset role;
select snap_nombre as nombre_foto, snap_peso as peso_foto from sst_autoevaluacion_items where id = :'item' \gset
update sst_estandares set nombre = nombre || ' (corregido)', peso = peso + 1 where codigo = (select estandar_codigo from sst_autoevaluacion_items where id = :'item');
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.ok(snap_nombre = :'nombre_foto' and snap_peso = :peso_foto, 'la autoevaluación cerrada conserva el nombre y el peso de cuando se cerró')
  from sst_autoevaluacion_items where id = :'item';
reset role;
update sst_estandares set nombre = replace(nombre, ' (corregido)', ''), peso = peso - 1 where nombre like '% (corregido)';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- Grupo 60 todo "no cumple" → crítico. Un texto del catálogo corregido MIENTRAS estaba abierta
-- entra en la foto al cerrar.
reset role;
update sst_estandares set nombre = 'Responsable del SG-SST (texto corregido)' where codigo = '1.1.1';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
update sst_autoevaluacion_items set estado = 'no_cumple' where autoevaluacion_id = :'ae60';
update sst_autoevaluaciones set estado = 'cerrada' where id = :'ae60';
select t.ok(nivel = 'critico' and puntaje = 0, 'sin cumplimiento: crítico') from sst_autoevaluaciones where id = :'ae60';
select t.ok(snap_nombre = 'Responsable del SG-SST (texto corregido)', 'al cerrar la foto toma el catálogo vigente')
  from sst_autoevaluacion_items where autoevaluacion_id = :'ae60' and estandar_codigo = '1.1.1';
reset role;
update sst_estandares set nombre = 'Responsable del SG-SST' where codigo = '1.1.1';
select t.debe_fallar(format('delete from sst_autoevaluacion_items where autoevaluacion_id = %L', :'ae21'), 'no se borran');
select t.debe_fallar(format('delete from sst_autoevaluaciones where id = %L', :'ae21'), 'no se borra');

-- Sin permiso / otra clínica.
select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar($q$select fn_sst_iniciar_autoevaluacion(2023, '7')$q$, 'permiso');
select t.ok(count(*) = 0, 'sin permiso SST no ve autoevaluaciones') from sst_autoevaluaciones;
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve autoevaluaciones ajenas') from sst_autoevaluaciones;
select t.ok(count(*) = 0, 'ni sus ítems') from sst_autoevaluacion_items;
update sst_autoevaluacion_items set estado = 'cumple' where autoevaluacion_id = :'ae21';
reset role;
select t.ok(count(*) = 21, 'el intento ajeno de calificar no cambia nada') from sst_autoevaluacion_items where autoevaluacion_id = :'ae21' and estado = 'pendiente';
