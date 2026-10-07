-- Pruebas de SG-SST F8 (0079): alertas diarias e insignia.
\set ON_ERROR_STOP 1
select id as a from clinicas where nombre = 'Clinica A' \gset
select id as b from clinicas where nombre = 'Clinica B' \gset
select (now() at time zone 'America/Bogota')::date as hoy \gset

select t.ok(count(*) filter (where clinica_id = :'a' and gestion) = 1, 'la clínica A (Pro) tiene gestión') from fn_sst_clinicas_alertas();
select t.ok(bool_or(email = 'sst@x.co'), 'el responsable de SST recibe las alertas') from fn_sst_destinatarios(:'a');

select t.ok(umbrales <@ array[1, 0] and dias <= 1 and fecha = fn_hab_sumar_dias_habiles(:'hoy'::date - 1, 2) and titulo like 'Reportar el accidente%', format('reporte a la ARL: umbrales %s, %s días', umbrales, dias))
  from fn_sst_alertas_pendientes(:'a', true) where objeto_id = '00000000-0000-0000-0000-0000000009a1' and objeto_tipo = 'evento_reporte';
select t.ok(count(*) = 0, 'la investigación aún no alerta (faltan más de 5 días)')
  from fn_sst_alertas_pendientes(:'a', true) where objeto_id = '00000000-0000-0000-0000-0000000009a1' and objeto_tipo = 'evento_investigacion';
select t.ok(count(*) = 1, 'a 3 días del plazo de investigación, sí')
  from fn_sst_alertas_pendientes(:'a', true, :'hoy'::date + 11) where objeto_id = '00000000-0000-0000-0000-0000000009a1' and objeto_tipo = 'evento_investigacion';

-- Idempotencia: lo registrado no se repite.
insert into sst_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias)
select :'a', objeto_tipo, objeto_id, unnest(umbrales) from fn_sst_alertas_pendientes(:'a', true);
select t.ok(count(*) = 0, 'una segunda corrida el mismo día no repite nada') from fn_sst_alertas_pendientes(:'a', true);

select t.ok(count(*) = 2, 'el examen periódico vencido (ingreso 2025-10-01 + 12 meses) se avisó con sus dos umbrales')
  from sst_alertas_enviadas where objeto_tipo = 'examen_periodico';
select t.ok(count(*) = 0, 'sin gestión: ni acciones ni exámenes ni plan')
  from fn_sst_alertas_pendientes(:'a', false, :'hoy'::date + 800) where objeto_tipo in ('accion', 'examen_periodico', 'plan_actividad', 'comite') or objeto_tipo like 'autoevaluacion:%';
select t.ok(count(*) = 0, 'la autoevaluación cerrada de 2026 no alerta')
  from fn_sst_alertas_pendientes(:'a', true, '2026-11-15') where objeto_tipo = 'autoevaluacion:2026';
select t.ok(count(*) = 1 and min(dias) = 46, 'sin autoevaluación del año: aviso a 60 días del 31 de diciembre')
  from fn_sst_alertas_pendientes(:'b', true, '2026-11-15') where objeto_tipo = 'autoevaluacion:2026';
select t.ok(umbrales = array[30, 7] and fecha = '2026-07-31', 'registro anual con la fecha parametrizada')
  from fn_sst_alertas_pendientes(:'b', true, '2026-07-25') where objeto_tipo = 'registro_anual:2026';

-- Solo el cron.
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.debe_fallar(format('select * from fn_sst_alertas_pendientes(%L, true)', :'a'), 'permission denied');
select t.debe_fallar('select * from fn_sst_clinicas_alertas()', 'permission denied');
select t.debe_fallar(format('select * from fn_sst_destinatarios(%L)', :'a'), 'permission denied');
select t.debe_fallar(format($q$insert into sst_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias) values (%L, 'x', gen_random_uuid(), 0)$q$, :'a'), 'row-level');
select t.ok(fn_sst_conteo_urgentes() >= 1, format('insignia: %s urgentes (el accidente sin reportar)', fn_sst_conteo_urgentes()));
select t.ok(count(*) > 0, 've lo avisado de su clínica') from sst_alertas_enviadas;
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(fn_sst_conteo_urgentes() = 0, 'la insignia de otra clínica no cuenta lo ajeno');
select t.ok(count(*) = 0, 'ni ve lo avisado ajeno') from sst_alertas_enviadas;
reset role;
