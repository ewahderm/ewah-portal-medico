-- Pruebas de Flujo de caja 0103: reporte de la pasarela (pagos reales),
-- emparejamiento con los cobros y liquidación con comisión real.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.trat(p_fecha date, p_costo numeric, p_medio uuid) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(),
    '00000000-0000-0000-0000-000000000341', p_fecha, p_costo, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), p_medio, auth.uid())
  returning id $$;
create function pg_temp.vivo(p_trat uuid) returns setof fin_movimientos language sql as $$
  select * from fin_movimientos where origen = 'tratamiento' and origen_id = p_trat and estado <> 'anulado' $$;
-- Un pago como lo entrega el navegador (ya leído del reporte).
create function pg_temp.pago(p_id text, p_compra numeric, p_comision numeric, p_rf numeric, p_rica numeric, p_exitoso boolean, p_dia date)
returns jsonb language sql as $$
  select jsonb_build_object('id_externo', p_id, 'pagado_en', p_dia::text || ' 15:00:23', 'estado_externo', case when p_exitoso then 'COBRO EXITOSO' else 'COBRO FALLIDO' end,
    'exitoso', p_exitoso, 'compra', p_compra, 'propina', 0, 'valor_total', p_compra, 'comision', case when p_exitoso then p_comision else 0 end,
    'retefuente', case when p_exitoso then p_rf else 0 end, 'reteica', case when p_exitoso then p_rica else 0 end, 'reteiva', 0,
    'total_deduccion', case when p_exitoso then p_comision + p_rf + p_rica else 0 end,
    'deposito', case when p_exitoso then p_compra - (p_comision + p_rf + p_rica) else 0 end,
    'tipo_tarjeta', 'CRÉDITO', 'franquicia', 'VISA', 'pais_tarjeta', 'US', 'canal', 'PRESENCIAL', 'metodo', 'Tarjeta de Crédito', 'autorizacion', '06401B') $$;
\set bold_mp '00000000-0000-0000-0000-0000000f3001'
\set bold '00000000-0000-0000-0000-0000000f3101'

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select id as efectivo from fin_cuentas where nombre = 'Efectivo COP' \gset

-- Dos cobros con la pasarela, de los valores del reporte de ejemplo de Bold.
select pg_temp.trat(:'hoy', 2840000, :'bold_mp') as ta \gset
select pg_temp.trat(:'hoy', 6800000, :'bold_mp') as tb \gset
select id as ma from pg_temp.vivo(:'ta') \gset
select id as mb from pg_temp.vivo(:'tb') \gset

-- Importar.
select t.debe_fallar(format($q$select fn_fin_importar_pagos(%L, 'bold', '[]'::jsonb)$q$, :'bold'), 'no trae pagos');
select t.debe_fallar(format($q$select fn_fin_importar_pagos(%L, 'bold', jsonb_build_array(pg_temp.pago('X1', 1000, 10, 1, 1, true, %L)))$q$, :'efectivo', :'hoy'), 'cuenta de pasarela');
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(
  pg_temp.pago('CPHVW7ET11WO', 2840000, 99416, 42600, 11757.60, true, :'hoy'),
  pg_temp.pago('CPDS2F7DD2CC', 6800000, 258020, 102000, 28152, true, :'hoy'),
  pg_temp.pago('CPFALLIDO0001', 500000, 0, 0, 0, false, :'hoy')))::text as imp \gset
select t.ok((:'imp'::jsonb ->> 'nuevos')::int = 3 and (:'imp'::jsonb ->> 'repetidos')::int = 0, 'importa los tres pagos');
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('CPHVW7ET11WO', 2840000, 99416, 42600, 11757.60, true, :'hoy')))::text as imp2 \gset
select t.ok((:'imp2'::jsonb ->> 'repetidos')::int = 1 and (:'imp2'::jsonb ->> 'nuevos')::int = 0, 'volver a subir el reporte no duplica');
select t.ok(count(*) = 3 and bool_and(created_by = auth.uid()) and count(*) filter (where not exitoso) = 1, 'quedan guardados, con su autor y el fallido marcado')
  from fin_pagos_pasarela where id_externo in ('CPHVW7ET11WO', 'CPDS2F7DD2CC', 'CPFALLIDO0001');
select t.ok(not exists (select 1 from information_schema.columns where table_name = 'fin_pagos_pasarela' and column_name ~ 'tarjeta$|pagador|correo|nombre')
  or (select count(*) from information_schema.columns where table_name = 'fin_pagos_pasarela' and column_name in ('tarjeta', 'nombre_pagador', 'correo_pagador')) = 0,
  'no se guardan la tarjeta ni los datos del pagador');

-- Un pago inconsistente no entra (la comisión y las retenciones deben cuadrar con lo que se deposita).
select t.debe_fallar(format($q$select fn_fin_importar_pagos(%L, 'bold', jsonb_build_array(jsonb_set(pg_temp.pago('MALO0001', 100000, 3000, 1500, 400, true, %L), '{deposito}', '1')))$q$, :'bold', :'hoy'), 'fin_pago_deposito');

-- Emparejar lo inequívoco.
select t.ok(not exists (select 1 from fn_fin_pendientes_pasarela() where movimiento_id = :'ma' and pago_id is not null), 'antes de emparejar usa la estimación de la tarifa');
select fn_fin_conciliar_pagos(:'bold')::text as con \gset
select t.ok((:'con'::jsonb ->> 'emparejados')::int = 2, 'empareja los dos pagos por valor y fecha');
select t.ok(p.movimiento_id = :'ma' and p.emparejado_por = auth.uid(), 'el pago de 2.840.000 queda con su cobro') from fin_pagos_pasarela p where p.id_externo = 'CPHVW7ET11WO';
select t.ok(not exists (select 1 from fin_pagos_pasarela where id_externo = 'CPFALLIDO0001' and movimiento_id is not null), 'el pago fallido no se empareja');
select t.ok(comision = 99416 and retefuente = 42600 and reteica = 11757.60 and reteiva = 0 and neto = 2686226.40 and tarifa_id is null and pago_id is not null,
  'el neto esperado es el real del pago (comisión y retenciones exactas, no la tarifa)') from fn_fin_pendientes_pasarela() where movimiento_id = :'ma';
select t.ok(comision = 258020 and neto = 6411828 and bruto = 6800000, 'y el del segundo pago, con otra comisión (otra franquicia)') from fn_fin_pendientes_pasarela() where movimiento_id = :'mb';
select t.debe_fallar(format($q$select fn_fin_vincular_pago((select id from fin_pagos_pasarela where id_externo = 'CPHVW7ET11WO'), %L)$q$, :'mb'), 'ya está emparejado');
select t.debe_fallar(format($q$select fn_fin_vincular_pago((select id from fin_pagos_pasarela where id_externo = 'CPFALLIDO0001'), %L)$q$, :'mb'), 'no fue exitoso');

-- Liquidar: el neto esperado es la suma de lo depositado; no hay diferencia.
select 2686226.40 + 6411828 as neto_total \gset
select gen_random_uuid() as liq \gset
select fn_fin_liquidar_pasarela(:'liq', array[:'ma', :'mb']::uuid[], :'banco', :'hoy', :'neto_total', :'neto_total', null, null);
select t.ok(neto_esperado = :'neto_total'::numeric and neto_real = :'neto_total'::numeric and diferencia = 0 and comision = 99416 + 258020 and retefuente = 144600 and reteica = 39909.60,
  'la liquidación queda exacta: sin diferencia y con la comisión real') from fin_liquidaciones_pasarela where id = :'liq';
select t.ok(not exists (select 1 from fin_movimientos where liquidacion_id = :'liq' and categoria_codigo = 'AJUSTE_CAJA'), 'sin ajuste de caja');
select t.ok(tarifa_id is null and comision = 99416, 'el detalle por cobro guarda la comisión real') from fin_liquidacion_cobros where liquidacion_id = :'liq' and movimiento_id = :'ma';

-- Varios cobros del mismo valor: no se emparejan solos; la persona elige.
select pg_temp.trat(:'hoy', 123456, :'bold_mp') as tc \gset
select pg_temp.trat(:'hoy', 123456, :'bold_mp') as td \gset
select id as mc from pg_temp.vivo(:'tc') \gset
select id as md from pg_temp.vivo(:'td') \gset
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('CPIGUAL00001', 123456, 4000, 1850, 511, true, :'hoy')));
select fn_fin_conciliar_pagos(:'bold')::text as con2 \gset
select t.ok((:'con2'::jsonb ->> 'emparejados')::int = 0 and (:'con2'::jsonb ->> 'sin_emparejar')::int >= 1, 'con dos cobros iguales no adivina');
select t.ok(count(*) = 2 and bool_and(tipo = 'cobro'), 'ofrece los dos cobros como candidatos')
  from fn_fin_candidatos_pago((select id from fin_pagos_pasarela where id_externo = 'CPIGUAL00001'));
select fn_fin_vincular_pago((select id from fin_pagos_pasarela where id_externo = 'CPIGUAL00001'), :'md');
select t.ok(movimiento_id = :'md', 'la persona elige y queda emparejado') from fin_pagos_pasarela where id_externo = 'CPIGUAL00001';
select t.ok(neto = 123456 - (4000 + 1850 + 511) and pago_id is not null, 'el elegido toma los valores reales') from fn_fin_pendientes_pasarela() where movimiento_id = :'md';
select t.ok(pago_id is null, 'el otro sigue con la tarifa') from fn_fin_pendientes_pasarela() where movimiento_id = :'mc';
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('CPOTRO000001', 99999, 4000, 1850, 511, true, :'hoy')));
select t.debe_fallar(format($q$select fn_fin_vincular_pago((select id from fin_pagos_pasarela where id_externo = 'CPOTRO000001'), %L)$q$, :'mc'), 'no coincide');

-- Un tratamiento que esperaba la confirmación se confirma con el pago.
update fin_medios_pago set requiere_confirmacion = true where medio_pago_id = :'bold_mp';
select pg_temp.trat(:'hoy', 777000, :'bold_mp') as te \gset
select t.ok(not exists (select 1 from pg_temp.vivo(:'te')), 'esperando confirmación, aún sin ingreso');
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(pg_temp.pago('CPCONFIRMA01', 777000, 27500, 11655, 3216, true, :'hoy')));
select fn_fin_conciliar_pagos(:'bold')::text as con3 \gset
select t.ok((:'con3'::jsonb ->> 'emparejados')::int = 1, 'el pago confirma el tratamiento y se empareja');
select t.ok(estado = 'pendiente_abono' and cuenta_id = :'bold' and monto_original = 777000, 'su ingreso entró pendiente de abono') from pg_temp.vivo(:'te');
select t.ok(movimiento_id = (select id from pg_temp.vivo(:'te')), 'el pago quedó ligado a ese ingreso') from fin_pagos_pasarela where id_externo = 'CPCONFIRMA01';
update fin_medios_pago set requiere_confirmacion = false where medio_pago_id = :'bold_mp';

-- Inmutables.
reset role;
select t.debe_fallar($q$update fin_pagos_pasarela set compra = 1 where id_externo = 'CPHVW7ET11WO'$q$, 'no se modifica');
select t.debe_fallar($q$delete from fin_pagos_pasarela where id_externo = 'CPHVW7ET11WO'$q$, 'no se borra');

-- Otra clínica.
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve los pagos') from fin_pagos_pasarela;
select t.debe_fallar(format($q$select fn_fin_importar_pagos(%L, 'bold', jsonb_build_array(pg_temp.pago('AJENO0000001', 1000, 10, 1, 1, true, %L)))$q$, :'bold', :'hoy'), 'pasarela activa');
select t.debe_fallar(format($q$select fn_fin_conciliar_pagos(%L)$q$, :'bold'), 'pasarela');
reset role;
