-- Pruebas de F8 (0069): aplicabilidad, fechas (contra el oráculo), estados
-- de las ocurrencias, novedades y subsanación de F7.
\set ON_ERROR_STOP 1

-- 1. Fechas generadas = fechas_2026_2027 de reportes.json (ventana del
--    oráculo: [2026-10-06, 2027-12-31], hoy = 2026-10-06).
create or replace function t.fechas(p_clinica text, p_codigo text) returns date[] language sql as $$
  select coalesce(array_agg(distinct d.fecha_limite order by d.fecha_limite), '{}')
  from fn_hab_ocurrencias_deseadas((select id from clinicas where nombre = p_clinica), '2026-10-06') d
  join hab_obligaciones_catalogo c on c.id = d.obligacion_id and c.codigo = p_codigo
  where d.fecha_limite between '2026-10-06' and '2027-12-31'
$$;
select t.ok(t.fechas(c, o) = f::date[], format('%s (%s): %s', o, c, f)) from (values
  ('Clinica D2', 'FT001', '{2027-02-20,2027-07-20}'),
  ('Clinica D2', 'FT002', '{2027-04-30}'),
  ('Clinica D2', 'FT003', '{2027-02-20,2027-07-20}'),
  ('Clinica D2', 'FT004', '{2027-02-20,2027-07-20}'),
  ('Clinica D2', 'FT025', '{2027-02-20,2027-07-20}'),
  ('Clinica C2', 'FT006', '{2027-02-20,2027-07-20}'),
  ('Clinica C2', 'FT009', '{2027-02-20,2027-07-20}'),
  ('Clinica D1', 'FT018', '{2026-10-20,2026-11-20,2026-12-20,2027-02-20,2027-03-20,2027-04-20,2027-05-20,2027-06-20,2027-07-20,2027-08-20,2027-09-20,2027-10-20,2027-11-20,2027-12-20}'),
  ('Clinica D2', 'FP001-FP005', '{2027-04-10}'),
  ('Clinica D2', 'datos-generales-nrvcc', '{2027-01-20,2027-07-20}'),
  ('Clinica D2', 'ST002', '{2027-02-28}'),
  ('Clinica D2', 'res256-indicadores-calidad', '{2026-10-30,2027-01-30,2027-04-30,2027-07-30,2027-10-30}'),
  ('Clinica D2', 'res202-pedt', '{2026-11-25,2027-02-25,2027-05-25,2027-08-25,2027-11-25}')
) as x(c, o, f);
select t.ok(count(*) = 0, 'D2 no recibe FT006 ni FT018 (son de B–D1)') from hab_obligacion_ocurrencias o
  join hab_obligaciones_catalogo c on c.id = o.obligacion_id
  where o.clinica_id = (select id from clinicas where nombre = 'Clinica D2') and c.codigo in ('FT006', 'FT018');

select t.ok(count(*) = 0, 'sin inscribir: ninguna fecha anterior a hoy (no se deben periodos previos a la inscripción)')
  from hab_obligacion_ocurrencias o join clinicas c on c.id = o.clinica_id
  where c.nombre in ('Clinica D2', 'Clinica C2', 'Clinica D1') and o.fecha_limite < (now() at time zone 'America/Bogota')::date;
select t.ok(count(*) = 0, 'inscrita: ninguna fecha anterior a su fecha de inscripción')
  from hab_obligacion_ocurrencias o join hab_perfil_prestador p on p.clinica_id = o.clinica_id
  where p.estado_reps = 'inscrito' and o.generada_por = 'sistema' and o.fecha_limite < p.fecha_inscripcion_inicial;

-- 2. Configuración: una fila por obligación del catálogo; día no hábil
select t.ok(count(*) = (select count(*) from hab_obligaciones_catalogo), 'el perfil crea una fila de configuración por obligación')
  from hab_obligaciones_clinica where clinica_id = (select id from clinicas where nombre = 'Clinica D2');
select t.ok(bool_and(dia_no_habil), '20-feb-2027 es sábado: marcado como día no hábil, sin correr la fecha')
  from hab_obligacion_ocurrencias where fecha_limite = '2027-02-20';

-- 3. Cambio de grupo D2 → C1: salen las semestrales pendientes, entran las
--    mensuales; lo presentado no se toca.
update hab_obligacion_ocurrencias o set estado = 'presentado', fecha_presentacion = (now() at time zone 'America/Bogota')::date, radicado = 'R-1'
from hab_obligaciones_catalogo c
where c.id = o.obligacion_id and c.codigo = 'FT003' and o.clinica_id = (select id from clinicas where nombre = 'Clinica D2')
  and o.fecha_limite = (select min(fecha_limite) from hab_obligacion_ocurrencias x where x.obligacion_id = o.obligacion_id and x.clinica_id = o.clinica_id and x.estado = 'pendiente');
update hab_perfil_prestador set grupo_supersalud = 'C1' where clinica_id = (select id from clinicas where nombre = 'Clinica D2');
select t.ok(count(*) > 0, 'C1 recibe FT018 mensual') from hab_obligacion_ocurrencias o join hab_obligaciones_catalogo c on c.id = o.obligacion_id
  where o.clinica_id = (select id from clinicas where nombre = 'Clinica D2') and c.codigo = 'FT018';
select t.ok(count(*) = 1, 'la FT003 presentada se conserva tras el cambio de grupo') from hab_obligacion_ocurrencias o join hab_obligaciones_catalogo c on c.id = o.obligacion_id
  where o.clinica_id = (select id from clinicas where nombre = 'Clinica D2') and c.codigo = 'FT003' and o.estado = 'presentado';

-- 4. Usuario de la clínica A (admin, D2, inscrito en f7)
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
create temp table o8 as
select o.id from hab_obligacion_ocurrencias o join hab_obligaciones_catalogo c on c.id = o.obligacion_id
where c.codigo = 'FT001' and o.estado = 'pendiente' order by o.fecha_limite limit 1;
select t.ok(count(*) = 1, 'la clínica A tiene vencimiento REPS en su calendario') from hab_obligacion_ocurrencias where origen = 'vencimiento_reps';
select t.debe_fallar(format('update hab_obligacion_ocurrencias set estado = ''presentado'', fecha_presentacion = current_date - 1 where id = %L', id), 'presentada_con_prueba') from o8;
select t.debe_fallar(format('update hab_obligacion_ocurrencias set estado = ''presentado'', fecha_presentacion = current_date + 5, radicado = ''X'' where id = %L', id), 'futura') from o8;
update hab_obligacion_ocurrencias set estado = 'presentado', fecha_presentacion = (now() at time zone 'America/Bogota')::date, radicado = 'SIHO-123' where id = (select id from o8);
select t.ok(presentado_por = auth.uid(), 'presentada con autor de la sesión') from hab_obligacion_ocurrencias where id = (select id from o8);
select t.debe_fallar(format('update hab_obligacion_ocurrencias set radicado = ''otro'' where id = %L', id), 'no se edita') from o8;
select t.debe_fallar(format('update hab_obligacion_ocurrencias set estado = ''anulado'', motivo_anulacion = ''me equivoqué de radicado'' where id = %L', id), 'Anular') from o8;
select t.ok(fn_hab_anular_ocurrencia(id, 'Radicado digitado con error de tipeo') is not null, 'anular reabre el periodo con una pendiente nueva') from o8;
select t.ok(count(*) = 1 and bool_and(reemplaza_id = (select id from o8)), 'la nueva pendiente apunta a la anulada')
  from hab_obligacion_ocurrencias where reemplaza_id is not null;
select t.debe_fallar(format('select fn_hab_anular_ocurrencia(%L, ''no aplica este periodo'')',
  (select id from hab_obligacion_ocurrencias where origen = 'calendario' and estado = 'pendiente' and reemplaza_id is null limit 1)), 'No aplica en este periodo');
select t.debe_fallar($q$insert into hab_obligacion_ocurrencias (clinica_id, obligacion_id, origen, clave_periodo, fecha_limite, generada_por)
  select clinica_actual(), id, 'calendario', 'falsa', current_date, 'usuario' from hab_obligaciones_catalogo where codigo = 'FT001'$q$, 'row-level|calendario');
select t.debe_fallar('select fn_hab_generar_ocurrencias(clinica_actual())', 'permission denied');

-- 5. Subsanación de la visita registrada en F7 (con anulación del hito)
select t.ok(fecha_limite = '2026-12-31' and estado = 'pendiente' and not dia_no_habil, 'la visita con subsanables crea la ocurrencia a 8 días hábiles')
  from hab_obligacion_ocurrencias where origen = 'subsanacion_visita';
update hab_tramite_hitos set anulado = true, anulado_motivo = 'Acta registrada en la clínica equivocada' where id = '00000000-0000-0000-0000-000000000b01';
select t.ok(estado = 'anulado', 'anular el hito anula la subsanación pendiente') from hab_obligacion_ocurrencias where origen = 'subsanacion_visita';

-- 6. Novedad: cierre temporal de un servicio
select t.debe_fallar(format('select fn_hab_registrar_novedad((select id from hab_novedades_catalogo where codigo = ''cierre_temporal_servicio''), %L)', '2026-09-01'), 'servicio que cierras');
select fn_hab_registrar_novedad((select id from hab_novedades_catalogo where codigo = 'cierre_temporal_servicio'), '2026-09-01',
  '00000000-0000-0000-0000-00000000005a', (select id from clinica_servicios_habilitados limit 1), 'NOV-1') as novedad \gset
select t.ok(estado = 'cierre_temporal', 'el servicio queda en cierre temporal') from clinica_servicios_habilitados;
select t.ok(fecha_limite = '2027-09-01', 'el cierre temporal vence al año (fecha literal)') from hab_obligacion_ocurrencias where origen = 'cierre_temporal';
select fn_hab_anular_novedad(:'novedad', 'Se reportó el servicio equivocado');
select t.ok(estado = 'anulado', 'anular la novedad anula su ocurrencia pendiente') from hab_obligacion_ocurrencias where origen = 'cierre_temporal';

-- 7. Solo VIEW (Consulta): ve el calendario, no presenta
reset role; select t.como('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select t.ok(count(*) > 0, 'Consulta ve las fechas') from hab_obligacion_ocurrencias;
update hab_obligacion_ocurrencias set estado = 'presentado', fecha_presentacion = current_date - 1, radicado = 'X' where estado = 'pendiente';
select t.ok(count(*) = 0, 'Consulta no puede marcar presentado') from hab_obligacion_ocurrencias where radicado = 'X';
select t.debe_fallar('select fn_hab_recalcular_mis_obligaciones()', 'permiso');

-- 8. Otra clínica
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve obligaciones ajenas') from hab_obligacion_ocurrencias where clinica_id <> clinica_actual();
reset role;
