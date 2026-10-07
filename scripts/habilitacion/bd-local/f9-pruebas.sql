-- Pruebas de F9 (alertas) y F10 (cierre de la autoevaluación), 0070.
\set ON_ERROR_STOP 1
\set SA '''00000000-0000-0000-0000-00000000005a'''
select id as a from clinicas where nombre = 'Clinica A' \gset
select id as g from clinicas where nombre = 'Clinica Gratis' \gset

-- ============ F9 · alertas (service role) ============
select t.ok(:'a' in (select fn_hab_clinicas_con_gestion()), 'la clínica Pro tiene gestión');
select t.ok(:'g' not in (select fn_hab_clinicas_con_gestion()), 'la clínica Gratis no recibe alertas por correo');
select t.ok(array_agg(email order by email) = '{a3@x.co,a4@x.co,a@x.co}', 'destinatarios: admin y quienes tienen VIEW (no recepción)')
  from fn_hab_destinatarios(:'a');

-- Una ocurrencia pendiente de una obligación activa y confirmada.
create temp table oc as
select o.id, o.fecha_limite, coalesce(cfg.dias_aviso, cat.dias_aviso_default) as umbrales
from hab_obligacion_ocurrencias o
join hab_obligaciones_catalogo cat on cat.id = o.obligacion_id
join hab_obligaciones_clinica cfg on cfg.clinica_id = o.clinica_id and cfg.obligacion_id = o.obligacion_id
where o.clinica_id = :'a' and o.estado = 'pendiente' and cfg.activa
  and not (cat.activacion_default = 'por_confirmar' or cat.requiere_confirmacion_asesor)
  and cardinality(coalesce(cfg.dias_aviso, cat.dias_aviso_default)) >= 3
order by o.fecha_limite limit 1;
select t.ok(count(*) = 1, 'hay una ocurrencia para probar') from oc;

-- 20 días antes: entran todos los umbrales >= 20 de una sola vez.
select t.ok(p.umbrales = (select array_agg(u order by u desc) from unnest(oc.umbrales) u where u >= 20),
  'umbrales alcanzados a 20 días: ' || p.umbrales::text)
from oc join fn_hab_alertas_pendientes(:'a', oc.fecha_limite - 20) p on p.objeto_id = oc.id;
-- El cron registra lo enviado → la misma consulta ya no lo devuelve.
insert into hab_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias, fecha_objetivo, destinatarios)
select :'a', p.objeto_tipo, p.objeto_id, unnest(p.umbrales), p.fecha, '{a@x.co}'
from oc join fn_hab_alertas_pendientes(:'a', oc.fecha_limite - 20) p on p.objeto_id = oc.id;
select t.ok(count(*) = 0, 'dos ejecuciones el mismo día no duplican') from oc join fn_hab_alertas_pendientes(:'a', oc.fecha_limite - 20) p on p.objeto_id = oc.id;
-- 5 días antes (el cron "falló" en los días intermedios): sale lo perdido.
select t.ok(p.umbrales = (select array_agg(u order by u desc) from unnest(oc.umbrales) u where u between 5 and 19),
  'un umbral perdido sale al día siguiente sin repetir los ya avisados: ' || p.umbrales::text)
from oc join fn_hab_alertas_pendientes(:'a', oc.fecha_limite - 5) p on p.objeto_id = oc.id;

select t.ok(count(*) = 0, 'las obligaciones por confirmar no alertan')
from fn_hab_alertas_pendientes(:'a', current_date + 400) p
join hab_obligaciones_catalogo cat on cat.id = p.obligacion_id
join hab_obligaciones_clinica cfg on cfg.clinica_id = :'a' and cfg.obligacion_id = cat.id
where not cfg.confirmada and (cat.activacion_default = 'por_confirmar' or cat.requiere_confirmacion_asesor);
select t.ok(count(*) = 1 and min(dias) < 0, 'extintor vencido de una sede con servicios entra; el de 300 días no')
from fn_hab_alertas_pendientes(:'a') where objeto_tipo = 'extintor';
select t.ok(count(*) = 0, 'el plan de mejora cerrado no alerta')
from fn_hab_alertas_pendientes(:'a', current_date + 400) p join hab_planes_mejora pm on pm.id = p.objeto_id where pm.estado = 'cerrada';

-- 0086: la fecha objetivo forma parte de la llave de idempotencia. El extintor
-- recargado conserva la fila y solo mueve fecha_vencimiento: debe avisar de nuevo.
select id as ext from extintores where ubicacion = 'Bodega' \gset
insert into hab_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias, fecha_objetivo, destinatarios)
select :'a', p.objeto_tipo, p.objeto_id, unnest(p.umbrales), p.fecha, '{a@x.co}'
from fn_hab_alertas_pendientes(:'a') p where p.objeto_id = :'ext';
select t.ok(count(*) = 0, '0086 · extintor ya avisado: la misma fecha no se repite')
  from fn_hab_alertas_pendientes(:'a') where objeto_id = :'ext';
update extintores set fecha_vencimiento = (now() at time zone 'America/Bogota')::date + 20 where id = :'ext';
select t.ok(count(*) = 1 and min(dias) = 20 and min(umbrales::text) = '{30}',
  '0086 · extintor recargado y otra vez por vencer: vuelve a avisar (umbral 30) aunque sea la misma fila')
  from fn_hab_alertas_pendientes(:'a') where objeto_id = :'ext';
-- La llave única sigue impidiendo repetir el mismo (objeto, umbral, fecha).
select t.debe_fallar(format($q$insert into hab_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias, fecha_objetivo)
  select %L, 'extintor', %L, 30, fecha_objetivo from hab_alertas_enviadas where objeto_id = %L limit 1$q$, :'a', :'ext', :'ext'), 'duplicate key|hab_alertas_enviadas_objeto_umbral_fecha_key');
delete from hab_alertas_enviadas where objeto_id = :'ext';
update extintores set fecha_vencimiento = (now() at time zone 'America/Bogota')::date - 10 where id = :'ext';

-- Usuarios: sin acceso a las funciones del cron; la insignia sí.
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar(format('select * from fn_hab_alertas_pendientes(%L)', :'a'), 'permission denied');
select t.debe_fallar(format('select * from fn_hab_destinatarios(%L)', :'a'), 'permission denied');
select t.debe_fallar('select fn_hab_clinicas_con_gestion()', 'permission denied');
select t.debe_fallar('select count(*) from hab_alertas_enviadas where false; insert into hab_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias, fecha_objetivo) values (clinica_actual(), ''grupo'', gen_random_uuid(), 1, current_date)', 'row-level|permission');
select t.ok(fn_hab_conteo_urgentes() = (
  select count(*) from hab_obligacion_ocurrencias o
  join hab_obligaciones_catalogo cat on cat.id = o.obligacion_id
  join hab_obligaciones_clinica cfg on cfg.clinica_id = o.clinica_id and cfg.obligacion_id = o.obligacion_id
  where o.estado = 'pendiente' and o.fecha_limite <= (now() at time zone 'America/Bogota')::date + 7 and cfg.activa
    and (cfg.confirmada or not (cat.activacion_default = 'por_confirmar' or cat.requiere_confirmacion_asesor))
), 'insignia = vencidas + ≤ 7 días (sin documentos vencidos)');

-- ============ F10 · estado de declaración y cierre ============
select t.ok(count(*) = 1, 'un servicio declarado en la sede') from fn_hab_estados_declaracion();
-- 0086 · HU-4.6 AC2: "No cumple O pendientes" exigen confirmación. Se dejan
-- sin incumplimientos (los No cumple previos pasan a "No aplica" con
-- justificación) pero con criterios pendientes: el servicio queda "sin evaluar"
-- y el cierre sin confirmar debe fallar. Después se restauran.
create temp table nc_previos as
select criterio_id from fn_hab_tablero_criterios(:SA) where estado = 'no_cumple' and not es_encabezado and not autorresuelto;
select fn_hab_evaluar(:SA, criterio_id, 'no_aplica', 'No aplica: prueba de cierre con criterios pendientes sin incumplimientos', null) from nc_previos;
select t.ok(estado = 'sin_evaluar' and no_cumple = 0 and pendientes > 0,
  '0086 · sin incumplimientos pero con pendientes el servicio está sin evaluar') from fn_hab_estados_declaracion();
select t.debe_fallar('select fn_hab_cerrar_autoevaluacion(''Autoevaluación con pendientes'', ''renovacion_anual'')', 'SERVICIOS_NO_APTOS.*sin evaluar');
select fn_hab_evaluar(:SA, criterio_id, 'no_cumple', null, 'Restaurado tras la prueba de pendientes') from nc_previos;

-- Un No cumple deja el servicio no apto.
select criterio_id as nc from fn_hab_tablero_criterios(:SA)
where not es_encabezado and not autorresuelto and servicio_clave <> '11.1' and padre_id is not null
order by orden offset 3 limit 1 \gset
select fn_hab_evaluar(:SA, :'nc', 'no_cumple', null, 'Falta el soporte');
select t.ok(estado = 'con_incumplimientos' and no_cumple >= 1, 'un No cumple = servicio con incumplimientos') from fn_hab_estados_declaracion();

select t.debe_fallar('select fn_hab_cerrar_autoevaluacion(''Autoevaluación 2026'', ''renovacion_anual'')', 'SERVICIOS_NO_APTOS');
select t.debe_fallar('select fn_hab_cerrar_autoevaluacion(''ab'', ''renovacion_anual'', true)', 'nombre');

select id as reps_oc from hab_obligacion_ocurrencias o
where o.estado = 'pendiente' and o.obligacion_id = (select id from hab_obligaciones_catalogo where codigo = 'reps-autoevaluacion')
order by fecha_limite limit 1 \gset
select fn_hab_cerrar_autoevaluacion('Autoevaluación 2026', 'renovacion_anual', true) as ae \gset

select t.ok(count(*) = (select count(*) from fn_hab_tablero_criterios(:SA)), 'la foto tiene todos los criterios aplicables (' || count(*) || ')')
  from hab_autoevaluacion_detalle where autoevaluacion_id = :'ae';
select t.ok(confirmo_servicios_no_aptos and jsonb_array_length(servicios_no_aptos) = 1, 'queda la confirmación y la lista congelada de no aptos')
  from hab_autoevaluaciones where id = :'ae';
select t.ok(servicios_no_aptos->0->>'estado' = 'con_incumplimientos' and servicios_no_aptos->0 ? 'pendientes',
  '0086 · cada servicio no apto congelado trae su estado y sus pendientes') from hab_autoevaluaciones where id = :'ae';
-- 0086 · privacidad: la foto inmutable NUNCA copia filas por persona de RRHH.
select t.ok(not exists (
    select 1 from hab_autoevaluacion_detalle d, jsonb_array_elements(d.evidencias) ev
    where d.autoevaluacion_id = :'ae' and (ev->'resumen' ? 'filas' or ev->'resumen' ? 'filas_visibles' or ev::text like '%Ana Médica%' or ev::text like '%Luis Auxiliar%')),
  '0086 · el cierre no copia nombres ni filas de RRHH a la foto');
select t.ok((resumen->'totales'->>'evaluables')::int = (select count(*) from fn_hab_tablero_criterios(:SA) where not es_encabezado and not autorresuelto),
  'el resumen cuenta los evaluables') from hab_autoevaluaciones where id = :'ae';
select t.ok((resumen->'totales'->>'no_cumple')::int >= 1 and jsonb_array_length(resumen->'estandares') = 7 or jsonb_array_length(resumen->'estandares') > 0,
  'el resumen trae totales y estándares') from hab_autoevaluaciones where id = :'ae';
select t.ok(d.estado = 'no_cumple' and d.origen in ('directo', 'transversal', 'remision'), 'el No cumple quedó en la foto')
  from hab_autoevaluacion_detalle d where d.autoevaluacion_id = :'ae' and d.criterio_id = :'nc';
-- Encabezado: agregado de sus descendientes; el padre del No cumple es No cumple.
select t.ok(d.estado = 'no_cumple' and d.origen = 'encabezado', 'el encabezado del No cumple queda No cumple')
  from hab_autoevaluacion_detalle d join hab_criterios c on c.id = :'nc'
  where d.autoevaluacion_id = :'ae' and d.criterio_id = c.padre_id;
-- Autorresuelto = agregado de 11.1 del mismo estándar.
select t.ok(bool_and(d.estado = x.estado), 'los autorresueltos toman el agregado de 11.1')
from hab_autoevaluacion_detalle d
join lateral (
  select case when bool_or(y.estado = 'no_cumple') then 'no_cumple' when bool_or(y.estado = 'pendiente') then 'pendiente'
    when bool_and(y.estado = 'no_aplica') then 'no_aplica' else 'cumple' end as estado
  from hab_autoevaluacion_detalle y
  where y.autoevaluacion_id = d.autoevaluacion_id and y.sede_id = d.sede_id and y.servicio_clave = '11.1'
    and y.estandar_codigo = d.estandar_codigo and y.origen not in ('encabezado', 'autorresuelto')
) x on true
where d.autoevaluacion_id = :'ae' and d.origen = 'autorresuelto';
select t.ok(count(*) > 0, 'la evidencia quedó copiada en la foto') from hab_autoevaluacion_detalle
  where autoevaluacion_id = :'ae' and jsonb_array_length(evidencias) > 0;

-- Ocurrencia del REPS presentada con la autoevaluación como prueba.
select t.ok(o.estado = 'presentado' and o.autoevaluacion_id = :'ae' and a.ocurrencia_id = o.id,
  'la ocurrencia reps-autoevaluacion del periodo queda presentada')
  from hab_obligacion_ocurrencias o join hab_autoevaluaciones a on a.id = :'ae' where o.id = :'reps_oc';
select t.debe_fallar(format('update hab_obligacion_ocurrencias set estado = ''presentado'', fecha_presentacion = current_date - 1, autoevaluacion_id = %L where id = (select id from hab_obligacion_ocurrencias where estado = ''pendiente'' and id <> %L limit 1)', :'ae', :'reps_oc'),
  'no corresponde');

-- Inmutable.
update hab_autoevaluacion_detalle set estado = 'cumple' where autoevaluacion_id = :'ae';
delete from hab_autoevaluacion_detalle where autoevaluacion_id = :'ae';
select t.ok(count(*) filter (where estado = 'no_cumple') >= 1 and count(*) = 465, 'por la API el detalle no se edita ni se borra (sin política)')
  from hab_autoevaluacion_detalle where autoevaluacion_id = :'ae';
select t.debe_fallar(format('update hab_autoevaluaciones set nombre = ''otra'' where id = %L', :'ae'), 'inmutable');
select t.debe_fallar(format('insert into hab_autoevaluacion_detalle (autoevaluacion_id, clinica_id, sede_id, criterio_id, sede_nombre, servicio_clave, estandar_codigo, criterio_codigo, texto_literal, estado, origen) values (%L, clinica_actual(), %L, %L, ''x'', ''x'', ''x'', ''x'', ''fabricado'', ''cumple'', ''directo'')', :'ae', :SA, :'nc'),
  'row-level');
select t.debe_fallar($q$insert into hab_autoevaluaciones (clinica_id, nombre, motivo, norma_id, cerrado_por, confirmo_servicios_no_aptos, resumen)
  select clinica_actual(), 'Fabricada', 'novedad', id, auth.uid(), false, '{"totales":{"cumple":999}}' from hab_normas$q$, 'row-level');
update hab_autoevaluaciones set fecha_declaracion_reps = current_date - 1 where id = :'ae';
select t.ok(fecha_declaracion_reps is not null, 'la fecha de declaración en el REPS se registra') from hab_autoevaluaciones where id = :'ae';
select t.debe_fallar(format('update hab_autoevaluaciones set fecha_declaracion_reps = current_date where id = %L', :'ae'), 'ya fue registrada');

-- Texto congelado aunque EWAH corrija el catálogo; ni el dueño de la BD
-- edita la foto (trigger).
reset role;
select t.debe_fallar(format('update hab_autoevaluacion_detalle set estado = ''cumple'' where autoevaluacion_id = %L', :'ae'), 'no se modifica');
select t.debe_fallar(format('delete from hab_autoevaluacion_detalle where autoevaluacion_id = %L', :'ae'), 'no se modifica');
select t.debe_fallar(format('delete from hab_autoevaluaciones where id = %L', :'ae'), 'no se borra');
update hab_criterios set texto_literal = texto_literal || ' (corregido)' where id = :'nc';
select t.ok(d.texto_literal not like '%(corregido)', 'el texto declarado no cambia si cambia el catálogo')
  from hab_autoevaluacion_detalle d where d.autoevaluacion_id = :'ae' and d.criterio_id = :'nc';
update hab_criterios set texto_literal = replace(texto_literal, ' (corregido)', '') where id = :'nc';

-- Solo VIEW no cierra; otra clínica no ve la foto.
select t.como('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select t.ok(count(*) = 1, 'Consulta ve el historial') from hab_autoevaluaciones;
select t.debe_fallar('select fn_hab_cerrar_autoevaluacion(''Intento'', ''novedad'', true)', 'permiso');
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve autoevaluaciones ajenas') from hab_autoevaluaciones;
select t.ok(count(*) = 0, 'ni su detalle') from hab_autoevaluacion_detalle;
reset role;
