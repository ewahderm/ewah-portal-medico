-- Pruebas de Flujo de caja 0105: reporte diario + extracto mensual, cambios
-- detectados al reimportar, historial de importaciones y anulación de pagos.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.trat(p_fecha date, p_costo numeric, p_medio uuid) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(),
    '00000000-0000-0000-0000-000000000341', p_fecha, p_costo, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), p_medio, auth.uid())
  returning id $$;
create function pg_temp.vivo(p_trat uuid) returns uuid language sql as $$
  select id from fin_movimientos where origen = 'tratamiento' and origen_id = p_trat and estado <> 'anulado' $$;
create function pg_temp.pago(p_id text, p_compra numeric, p_comision numeric, p_exitoso boolean, p_dia date, p_estado text default null)
returns jsonb language sql as $$
  select jsonb_build_object('id_externo', p_id, 'pagado_en', p_dia::text || ' 10:00:00',
    'estado_externo', coalesce(p_estado, case when p_exitoso then 'COBRO EXITOSO' else 'COBRO REVERSADO' end),
    'exitoso', p_exitoso, 'compra', p_compra, 'propina', 0, 'valor_total', p_compra,
    'comision', case when p_exitoso then p_comision else 0 end, 'retefuente', 0, 'reteica', 0, 'reteiva', 0,
    'total_deduccion', case when p_exitoso then p_comision else 0 end,
    'deposito', case when p_exitoso then p_compra - p_comision else 0 end) $$;
create function pg_temp.pid(p_ext text) returns uuid language sql as $$ select id from fin_pagos_pasarela where id_externo = p_ext $$;
\set bold_mp '00000000-0000-0000-0000-0000000f3001'
\set bold '00000000-0000-0000-0000-0000000f3101'

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset

-- Cobros de la pasarela.
select pg_temp.trat(:'hoy', 555000, :'bold_mp') as tb \gset
select pg_temp.trat(:'hoy', 444000, :'bold_mp') as td \gset
select pg_temp.vivo(:'tb') as mb \gset
select pg_temp.vivo(:'td') as md \gset

-- Reporte del día: dos pagos.
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(
  pg_temp.pago('DIA-B', 555000, 20000, true, :'hoy'),
  pg_temp.pago('DIA-D', 444000, 15000, true, :'hoy')), 'reporte-dia.xlsx', 1)::text as i1 \gset
select t.ok((:'i1'::jsonb ->> 'nuevos')::int = 2 and (:'i1'::jsonb ->> 'cambiados')::int = 0, 'el reporte del día entra completo');
select t.ok(nombre_archivo = 'reporte-dia.xlsx' and nuevos = 2 and repetidos = 0 and con_error = 1 and created_by = auth.uid(),
  'queda en el historial con el archivo, quién y cuántos') from fin_importaciones_pasarela where id = (:'i1'::jsonb ->> 'importacion_id')::uuid;
select t.ok(importacion_id = (:'i1'::jsonb ->> 'importacion_id')::uuid, 'cada pago sabe de qué importación vino') from fin_pagos_pasarela where id = pg_temp.pid('DIA-B');
select fn_fin_conciliar_pagos(:'bold');
select t.ok(movimiento_id = :'mb', 'el pago queda con su cobro') from fin_pagos_pasarela where id = pg_temp.pid('DIA-B');

-- D se liquida.
select gen_random_uuid() as liq \gset
select fn_fin_liquidar_pasarela(:'liq', array[:'md']::uuid[], :'banco', :'hoy', 429000, 429000, null, null);

-- Extracto del mes: D igual, B reversado, uno nuevo que faltaba (no se subió ese día).
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(
  pg_temp.pago('DIA-D', 444000, 15000, true, :'hoy'),
  pg_temp.pago('DIA-B', 555000, 0, false, :'hoy'),
  pg_temp.pago('FALTABA-1', 123123, 5000, true, :'hoy')), 'extracto-mes.xlsx')::text as i2 \gset
select t.ok((:'i2'::jsonb ->> 'nuevos')::int = 1 and (:'i2'::jsonb ->> 'repetidos')::int = 2 and (:'i2'::jsonb ->> 'cambiados')::int = 1,
  'el extracto del mes trae solo lo que faltaba, no duplica, y detecta el pago que cambió');
select t.ok(count(*) = 1, 'no hay pagos duplicados') from fin_pagos_pasarela where id_externo = 'DIA-B';
select t.ok(antes ->> 'estado_externo' = 'COBRO EXITOSO' and despues ->> 'estado_externo' = 'COBRO REVERSADO'
  and (despues ->> 'exitoso')::boolean = false and estado = 'pendiente',
  'el cambio guarda el antes y el después, pendiente de revisar') from fin_pagos_pasarela_cambios where pago_id = pg_temp.pid('DIA-B');
select t.ok(exitoso and estado_externo = 'COBRO EXITOSO', 'mientras no se revise, el pago no cambia') from fin_pagos_pasarela where id = pg_temp.pid('DIA-B');
select t.ok(cambio_pendiente, 'su cobro avisa que tiene un cambio sin revisar') from fn_fin_pendientes_pasarela() where movimiento_id = :'mb';

-- Subir otra vez el mismo extracto no repite el aviso.
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('DIA-B', 555000, 0, false, :'hoy')), 'extracto-mes.xlsx')::text as i3 \gset
select t.ok((:'i3'::jsonb ->> 'cambiados')::int = 0 and (:'i3'::jsonb ->> 'repetidos')::int = 1, 'reimportar el mismo extracto no crea otro aviso');
select t.ok(count(*) = 1, 'un solo cambio pendiente por pago') from fin_pagos_pasarela_cambios where pago_id = pg_temp.pid('DIA-B') and estado = 'pendiente';
select t.ok(count(*) >= 3, 'cada subida queda en el historial') from fin_importaciones_pasarela;

-- Aceptar el reverso: el pago deja de respaldar a su cobro.
select fn_fin_resolver_cambio_pago((select id from fin_pagos_pasarela_cambios where pago_id = pg_temp.pid('DIA-B') and estado = 'pendiente'), true);
select t.ok(not exitoso and estado_externo = 'COBRO REVERSADO' and movimiento_id is null and deposito = 0,
  'aceptado: el pago queda reversado y se suelta de su cobro') from fin_pagos_pasarela where id = pg_temp.pid('DIA-B');
select t.ok(pago_id is null and not cambio_pendiente, 'el cobro vuelve a la estimación de la tarifa') from fn_fin_pendientes_pasarela() where movimiento_id = :'mb';
select t.ok(estado = 'aceptado' and resuelto_por = auth.uid(), 'el cambio queda aceptado con quién lo hizo') from fin_pagos_pasarela_cambios where pago_id = pg_temp.pid('DIA-B');
select t.debe_fallar($q$select fn_fin_resolver_cambio_pago((select id from fin_pagos_pasarela_cambios where pago_id = (select id from fin_pagos_pasarela where id_externo = 'DIA-B')), true)$q$, 'ya se revisó');

-- Un pago ya liquidado que cambia: no se acepta hasta anular la liquidación; se puede descartar.
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('DIA-D', 444000, 16000, true, :'hoy')), 'ajuste.xlsx');
select id as cambio_d from fin_pagos_pasarela_cambios where pago_id = pg_temp.pid('DIA-D') and estado = 'pendiente' \gset
select t.debe_fallar(format($q$select fn_fin_resolver_cambio_pago(%L, true)$q$, :'cambio_d'), 'ya se liquidó');
select fn_fin_resolver_cambio_pago(:'cambio_d', false);
select t.ok(estado = 'descartado', 'se puede descartar') from fin_pagos_pasarela_cambios where id = :'cambio_d';
select t.ok(comision = 15000, 'descartado, el pago conserva sus valores') from fin_pagos_pasarela where id = pg_temp.pid('DIA-D');

-- Anular un pago importado por error.
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('EQUIVOCADO-1', 777777, 1000, true, :'hoy')), 'otra-pasarela.xlsx');
select t.debe_fallar($q$select fn_fin_anular_pago((select id from fin_pagos_pasarela where id_externo = 'EQUIVOCADO-1'), 'corto')$q$, 'al menos 10');
select fn_fin_anular_pago(pg_temp.pid('EQUIVOCADO-1'), 'Era un reporte de la otra pasarela');
select t.ok(anulado and anulado_motivo = 'Era un reporte de la otra pasarela' and anulado_por = auth.uid(), 'el pago queda anulado con su motivo')
  from fin_pagos_pasarela where id = pg_temp.pid('EQUIVOCADO-1');
select t.ok(count(*) = 0, 'un pago anulado no tiene candidatos') from fn_fin_candidatos_pago(pg_temp.pid('EQUIVOCADO-1'));
select t.debe_fallar($q$select fn_fin_anular_pago((select id from fin_pagos_pasarela where id_externo = 'EQUIVOCADO-1'), 'Otra vez el mismo motivo')$q$, 'ya está anulado');
select t.debe_fallar($q$select fn_fin_anular_pago((select id from fin_pagos_pasarela where id_externo = 'DIA-D'), 'Intento anular uno liquidado')$q$, 'ya se liquidó');
select t.debe_fallar(format($q$select fn_fin_vincular_pago((select id from fin_pagos_pasarela where id_externo = 'EQUIVOCADO-1'), %L)$q$, :'mb'), 'está anulado');

-- Nadie modifica ni borra un pago por fuera de estas funciones.
reset role;
select t.debe_fallar($q$update fin_pagos_pasarela set comision = 1 where id_externo = 'FALTABA-1'$q$, 'no se modifica');
select t.debe_fallar($q$delete from fin_pagos_pasarela where id_externo = 'FALTABA-1'$q$, 'no se borra');
select t.debe_fallar($q$update fin_pagos_pasarela set referencia = 'x' where id_externo = 'EQUIVOCADO-1'$q$, 'está anulado');

-- Otra clínica.
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve el historial') from fin_importaciones_pasarela;
select t.ok(count(*) = 0, 'ni los cambios') from fin_pagos_pasarela_cambios;
select t.debe_fallar($q$select fn_fin_anular_pago((select id from fin_pagos_pasarela limit 1), 'Desde otra clínica')$q$, 'no existe');
reset role;
