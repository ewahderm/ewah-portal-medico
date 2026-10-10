-- Pruebas de 0109: precio con historial, valor cobrado y cobro por atención
-- (un solo ingreso por atención; la pasarela concilia contra ese total).
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
\set paciente '00000000-0000-0000-0000-000000000321'
\set consulta '00000000-0000-0000-0000-000000000301'
\set toxina '00000000-0000-0000-0000-0000000a7e01'
\set efectivo_mp '00000000-0000-0000-0000-000000000311'
\set bold_mp '00000000-0000-0000-0000-0000000f3001'
\set bold '00000000-0000-0000-0000-0000000f3101'
-- Tratamiento como lo registra ahora la app: sin medio de pago.
create function pg_temp.trat(p_atencion uuid, p_tipo uuid, p_costo numeric, p_cobrado numeric default null) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, valor_cobrado, sede_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', p_tipo, auth.uid(), p_atencion,
    (now() at time zone 'America/Bogota')::date, p_costo, p_cobrado, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), auth.uid())
  returning id $$;
create function pg_temp.atencion() returns uuid language sql as $$
  insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, sede_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), (now() at time zone 'America/Bogota')::date,
    (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), auth.uid())
  returning id $$;
create function pg_temp.vivo(p_cobro uuid) returns setof fin_movimientos language sql as $$
  select * from fin_movimientos where origen = 'tratamiento' and origen_id = p_cobro and estado <> 'anulado' $$;

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- ============================================================
-- Precio con historial
-- ============================================================
insert into precios_tratamiento (clinica_id, tipo_tratamiento_id, valor, vigente_desde) values (clinica_actual(), :'toxina', 800000, '2026-01-01');
insert into precios_tratamiento (clinica_id, tipo_tratamiento_id, valor, vigente_desde) values (clinica_actual(), :'toxina', 900000, :'hoy');
insert into precios_tratamiento (clinica_id, tipo_tratamiento_id, valor, vigente_desde) values (clinica_actual(), :'toxina', 950000, :'hoy'::date + 30);
select t.ok(fn_precio_vigente(:'toxina', :'hoy') = 900000, 'el precio vigente hoy es el último que ya rige');
select t.ok(fn_precio_vigente(:'toxina', '2026-02-01') = 800000, 'una fecha pasada toma el precio de entonces');
select t.ok(fn_precio_vigente(:'toxina', :'hoy'::date + 31) = 950000, 'un aumento programado rige desde su fecha');
select t.ok(fn_precio_vigente(:'toxina', '2025-01-01') is null, 'antes del primer precio no hay precio');
insert into precios_tratamiento (clinica_id, tipo_tratamiento_id, valor, vigente_desde) values (clinica_actual(), :'toxina', 920000, :'hoy');
select t.ok(fn_precio_vigente(:'toxina', :'hoy') = 920000, 'dos precios con la misma vigencia: gana el último registrado');
select t.ok(created_by = auth.uid(), 'el autor del precio es la sesión') from precios_tratamiento where valor = 920000;
update precios_tratamiento set valor = 1 where tipo_tratamiento_id = :'toxina';
delete from precios_tratamiento where tipo_tratamiento_id = :'toxina';
select t.ok(count(*) = 4 and min(valor) > 1, 'el historial no se edita ni se borra') from precios_tratamiento where tipo_tratamiento_id = :'toxina';
select t.debe_fallar(format($q$insert into precios_tratamiento (clinica_id, tipo_tratamiento_id, valor, vigente_desde) values (clinica_actual(), '00000000-0000-0000-0000-000000000302', 1, %L)$q$, :'hoy'), 'no pertenece');
reset role;
select t.como('00000000-0000-0000-0000-0000000f3c01'); set role authenticated;
select t.debe_fallar(format($q$insert into precios_tratamiento (clinica_id, tipo_tratamiento_id, valor, vigente_desde) values (clinica_actual(), %L, 1, %L)$q$, :'toxina', :'hoy'), 'row-level');
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve los precios') from precios_tratamiento where tipo_tratamiento_id = :'toxina';
reset role;

-- ============================================================
-- Valor cobrado y atención sin cobrar
-- ============================================================
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select pg_temp.atencion() as a1 \gset
select pg_temp.trat(:'a1', :'consulta', 200000) as c1 \gset
select pg_temp.trat(:'a1', :'toxina', 900000, 850000) as x1 \gset
select t.ok(valor_cobrado = 200000 and cobro_id is null, 'sin indicarlo, lo cobrado es el precio; sin medio de pago no se cobra solo') from tratamientos where id = :'c1';
select t.ok(valor_cobrado = 850000, 'lo cobrado se puede indicar al registrar') from tratamientos where id = :'x1';
select t.ok(situacion = 'sin_cobrar' and valor = 1050000 and cobro_id is null and tratamiento = 'Tratamiento Reporte + Toxina',
  'la atención queda sin cobrar por la suma de lo cobrado') from fn_fin_ingresos_pendientes() where atencion_id = :'a1';
select t.debe_fallar(format($q$update tratamientos set valor_cobrado = 1 where id = %L$q$, :'c1'), 'no se puede editar');
select t.debe_fallar(format($q$update tratamientos set cobro_id = %L where id = %L$q$, :'c1', :'c1'), 'desde la atención');

-- ============================================================
-- Cobrar la atención: un ingreso por el total, con descuento repartido
-- ============================================================
select t.debe_fallar(format($q$select fn_cobrar_atencion(%L, %L::date + 1, %L, '[]'::jsonb)$q$, :'a1', :'hoy', :'efectivo_mp'), 'futura');
select t.debe_fallar(format($q$select fn_cobrar_atencion(%L, %L, %L, '[]'::jsonb)$q$, :'a1', :'hoy', :'efectivo_mp'), 'No hay tratamientos');
select t.debe_fallar(format($q$select fn_cobrar_atencion(%L, %L, '00000000-0000-0000-0000-000000000312', jsonb_build_array(jsonb_build_object('tratamiento_id', %L, 'valor', 1)))$q$, :'a1', :'hoy', :'c1'), 'medio de pago');
select t.debe_fallar(format($q$select fn_cobrar_atencion(%L, %L, %L, jsonb_build_array(jsonb_build_object('tratamiento_id', %L, 'valor', -1)))$q$, :'a1', :'hoy', :'efectivo_mp', :'c1'), '0 o más');
select fn_cobrar_atencion(:'a1', :'hoy', :'bold_mp', jsonb_build_array(
  jsonb_build_object('tratamiento_id', :'c1', 'valor', 180000),
  jsonb_build_object('tratamiento_id', :'x1', 'valor', 850000)), 'Descuento por paquete') as cobro1 \gset
select t.ok(valor = 1030000 and medio_pago_id = :'bold_mp' and not automatico and notas = 'Descuento por paquete',
  'el cobro guarda el total y el medio de pago') from cobros_atencion where id = :'cobro1';
select t.ok((select valor_cobrado from tratamientos where id = :'c1') = 180000 and (select cobro_id from tratamientos where id = :'x1') = :'cobro1'::uuid,
  'cada tratamiento queda con su valor cobrado y su cobro');
select t.ok(count(*) = 2, 'el detalle del cobro guarda los dos tratamientos') from cobros_atencion_items where cobro_id = :'cobro1';
select t.ok(count(*) = 1 and min(monto_original) = 1030000 and min(estado) = 'pendiente_abono' and min(cuenta_id::text) = :'bold'
  and min(descripcion) = 'Tratamiento Reporte + Toxina', 'un solo ingreso por el total de la atención, en la pasarela') from pg_temp.vivo(:'cobro1');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where atencion_id = :'a1'), 'la atención ya no está sin cobrar');
select t.debe_fallar(format($q$select fn_cobrar_atencion(%L, %L, %L, jsonb_build_array(jsonb_build_object('tratamiento_id', %L, 'valor', 1)))$q$, :'a1', :'hoy', :'efectivo_mp', :'c1'), 'ya se cobró');

-- La pasarela concilia contra el total de la atención.
select fn_fin_importar_pagos(:'bold', 'bold', jsonb_build_array(jsonb_build_object('id_externo', 'AT2TOTAL0001', 'pagado_en', :'hoy' || ' 15:00:23',
  'estado_externo', 'COBRO EXITOSO', 'exitoso', true, 'compra', 1030000, 'propina', 0, 'valor_total', 1030000, 'comision', 30000,
  'retefuente', 15000, 'reteica', 4000, 'reteiva', 0, 'total_deduccion', 49000, 'deposito', 981000,
  'tipo_tarjeta', 'CRÉDITO', 'franquicia', 'VISA', 'pais_tarjeta', 'CO', 'canal', 'PRESENCIAL', 'metodo', 'Tarjeta de Crédito', 'autorizacion', 'A1')));
select t.ok(count(*) = 1 and min(tipo) = 'cobro' and min(valor) = 1030000 and min(paciente) = 'Paciente Colombia',
  'el pago de la pasarela por el total encuentra el ingreso de la atención')
  from fn_fin_candidatos_pago((select id from fin_pagos_pasarela where id_externo = 'AT2TOTAL0001'));

-- ============================================================
-- Anular, editar y anular el cobro
-- ============================================================
select t.debe_fallar(format($q$update tratamientos set anulado = true, anulado_motivo = 'prueba', anulado_en = now() where id = %L$q$, :'c1'), 'anula primero ese cobro');
-- Editar (como la app): corregido sin medio, entra al cobro, se anula el original.
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, corrige_a, created_by)
select clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, 210000, sede_id, id, auth.uid() from tratamientos where id = :'c1'
returning id as c2 \gset
select fn_tratamiento_reemplazar_en_cobro(:'c1', :'c2');
update tratamientos set anulado = true, anulado_motivo = 'Editado — reemplazado por un registro corregido.', anulado_por = auth.uid(), anulado_en = now() where id = :'c1';
select t.ok(cobro_id = :'cobro1'::uuid and valor_cobrado = 180000 and costo = 210000,
  'el corregido entra al mismo cobro con lo que ya se cobró') from tratamientos where id = :'c2';
select t.ok((select cobro_id from tratamientos where id = :'c1') is null and (select not anulado from cobros_atencion where id = :'cobro1'),
  'el original sale del cobro y el cobro sigue vigente');
select t.ok(count(*) = 1 and min(monto_original) = 1030000, 'el ingreso no cambia') from pg_temp.vivo(:'cobro1');
select t.ok(tratamiento = 'Toxina + Tratamiento Reporte', 'la descripción no repite el tratamiento corregido (en orden de registro)')
  from fn_fin_cobros_flujo('en_flujo') where cobro_id = :'cobro1';
select t.debe_fallar(format($q$select fn_fin_cobro_descripcion(%L)$q$, :'cobro1'), 'permission denied');

-- Anular el cobro: se anula su ingreso y la atención vuelve a quedar sin cobrar.
select t.debe_fallar(format($q$select fn_anular_cobro_atencion(%L, 'corto')$q$, :'cobro1'), '10 caracteres');
select fn_anular_cobro_atencion(:'cobro1', 'El paciente pagó con otra tarjeta');
select t.ok(not exists (select 1 from pg_temp.vivo(:'cobro1')), 'anular el cobro anula su ingreso');
select t.ok(count(*) = 0, 'los tratamientos quedan sin cobro') from tratamientos where cobro_id = :'cobro1';
select t.ok(situacion = 'sin_cobrar' and valor = 1030000, 'y la atención vuelve a estar sin cobrar') from fn_fin_ingresos_pendientes() where atencion_id = :'a1';
select t.ok(count(*) = 3, 'el detalle histórico del cobro anulado se conserva') from cobros_atencion_items where cobro_id = :'cobro1';
update cobros_atencion set valor = 1 where id = :'cobro1';
select t.ok(valor = 1030000, 'un cobro no se edita por la API') from cobros_atencion where id = :'cobro1';
-- Se puede volver a cobrar, ahora en efectivo.
select fn_cobrar_atencion(:'a1', :'hoy', :'efectivo_mp', jsonb_build_array(
  jsonb_build_object('tratamiento_id', :'c2', 'valor', 200000),
  jsonb_build_object('tratamiento_id', :'x1', 'valor', 850000))) as cobro2 \gset
select t.ok(estado = 'registrado' and monto_original = 1050000, 'el nuevo cobro en efectivo entra registrado') from pg_temp.vivo(:'cobro2');
reset role;

-- ============================================================
-- Permisos y otra clínica
-- ============================================================
select t.como('00000000-0000-0000-0000-0000000f3c01'); set role authenticated;
select t.debe_fallar(format($q$select fn_cobrar_atencion(%L, %L, %L, '[]'::jsonb)$q$, :'a1', :'hoy', :'efectivo_mp'), 'permiso');
select t.debe_fallar(format($q$select fn_anular_cobro_atencion(%L, 'Sin permiso para anular')$q$, :'cobro2'), 'permiso');
select t.ok(count(*) = 1, 'finanzas ve el cobro') from cobros_atencion where id = :'cobro2';
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve el cobro') from cobros_atencion where id = :'cobro2';
select t.debe_fallar(format($q$select fn_anular_cobro_atencion(%L, 'Cobro ajeno de otra clínica')$q$, :'cobro2'), 'no existe');
reset role;
