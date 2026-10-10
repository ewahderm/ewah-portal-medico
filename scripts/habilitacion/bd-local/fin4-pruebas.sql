-- Pruebas de Flujo de caja FC4 (0095): tarifas, pendientes de la pasarela,
-- liquidación con comisión, retenciones y diferencia, y su anulación.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.trat(p_fecha date, p_costo numeric, p_medio uuid) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(),
    '00000000-0000-0000-0000-000000000341', p_fecha, p_costo, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), p_medio, auth.uid())
  returning id $$;
create function pg_temp.vivo(p_trat uuid) returns setof fin_movimientos language sql as $$
  select * from fin_movimientos where origen = 'tratamiento' and origen_id = p_trat and estado <> 'anulado' $$;
create function pg_temp.saldo(p_cuenta uuid) returns numeric language sql as $$
  select saldo from fn_fin_saldos() where cuenta_id = p_cuenta $$;
-- Liquida como la pantalla: con el neto esperado que se ve.
create function pg_temp.liquidar(p_id uuid, p_movs uuid[], p_banco uuid, p_fecha date, p_neto numeric, p_soporte text default null) returns uuid language sql as $$
  select fn_fin_liquidar_pasarela(p_id, p_movs, p_banco, p_fecha, p_neto,
    coalesce((select sum(neto) from fn_fin_pendientes_pasarela() where movimiento_id = any(p_movs)), 0), p_soporte, null) $$;
create function pg_temp.corregir(p_original uuid) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, corrige_a, created_by)
  select clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, id, auth.uid()
  from tratamientos where id = p_original returning id into v;
  update tratamientos set anulado = true, anulado_motivo = 'Editado — reemplazado por un registro corregido.', anulado_por = auth.uid(), anulado_en = now() where id = p_original;
  return v;
end $$;
\set bold_mp '00000000-0000-0000-0000-0000000f3001'
\set credito_mp '00000000-0000-0000-0000-0000000f3002'
\set bold '00000000-0000-0000-0000-0000000f3101'

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select id as tarjeta from fin_cuentas where tipo = 'tarjeta_socio' \gset

-- Tarifa de Bold (la del usuario): 3,79 % + $300 IVA incluido, ReteRenta 1,5 %, ReteICA 0,414 %, 2 días hábiles.
insert into fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde, porcentaje_comision, comision_incluye_iva, valor_fijo_comision,
  porcentaje_retefuente, porcentaje_reteica, porcentaje_reteiva, dias_habiles_abono)
values (clinica_actual(), :'bold_mp', '2026-01-01', 3.79, true, 300, 1.5, 0.414, 0, 2) returning id as tarifa \gset
select t.ok(created_by = auth.uid(), 'autoría forzada en la tarifa') from fin_tarifas_medio_pago where id = :'tarifa';
select t.ok(d.comision = 4090 and d.retefuente = 1500 and d.reteica = 414 and d.reteiva = 0 and d.neto = 93996,
  'de $100.000 llegan $93.996 (ejemplo del documento)') from fin_tarifas_medio_pago tf, fn_fin_desglose(100000, tf) d where tf.id = :'tarifa';
select t.ok(d.comision = 3570, 'sin IVA incluido la comisión suma el 19 % (3 % de 100.000 × 1,19)')
  from fin_tarifas_medio_pago tf, fn_fin_desglose(100000, row(tf.id, tf.clinica_id, tf.medio_pago_id, tf.vigente_desde, 3, false, 0, 0, 0, 0, 0, 1,
    null, now(), null, now())::fin_tarifas_medio_pago) d where tf.id = :'tarifa';
select t.debe_fallar(format($q$insert into fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde) values (clinica_actual(), %L, '2026-01-01')$q$, :'bold_mp'), 'unique|duplicate');
select t.debe_fallar(format($q$insert into fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde, porcentaje_comision) values (clinica_actual(), %L, '2026-02-01', 120)$q$, :'bold_mp'), 'check');

-- Cobros con Bold: fecha esperada según la tarifa y neto esperado.
select pg_temp.trat(:'hoy', 100000, :'bold_mp') as c1 \gset
select pg_temp.trat(:'hoy', 50000, :'bold_mp') as c2 \gset
select pg_temp.trat(:'hoy', 30000, :'bold_mp') as c3 \gset
select id as m1 from pg_temp.vivo(:'c1') \gset
select id as m2 from pg_temp.vivo(:'c2') \gset
select id as m3 from pg_temp.vivo(:'c3') \gset
select t.ok(fecha_esperada = fn_hab_sumar_dias_habiles(:'hoy'::date, 2, 'CO') and medio_pago_id = :'bold_mp',
  'el cobro guarda su medio y espera el abono 2 días hábiles después') from fin_movimientos where id = :'m1';
select t.ok(neto = 93996 and tarifa_id = :'tarifa', 'la pantalla de Bold muestra el neto esperado') from fn_fin_pendientes_pasarela() where movimiento_id = :'m1';
select pg_temp.saldo(:'bold') as bold_antes \gset
select pg_temp.saldo(:'banco') as banco_antes \gset

-- Reglas de la liquidación.
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L, 93996)$q$, :'m1', :'tarjeta', :'hoy'), 'cuenta activa en pesos');
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L, 100001)$q$, :'m1', :'banco', :'hoy'), 'más que lo cobrado');
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L::date - 1, 93996)$q$, :'m1', :'banco', :'hoy'), 'anterior a los cobros');
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L, 93996, 'otra/ruta.pdf')$q$, :'m1', :'banco', :'hoy'), 'no corresponde');
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), '{}'::uuid[], %L, %L, 1)$q$, :'banco', :'hoy'), 'Elige los cobros');

-- Liquidar el de $100.000 exacto.
select pg_temp.liquidar(gen_random_uuid(), array[:'m1']::uuid[], :'banco', :'hoy', 93996) as liq1 \gset
select t.ok(bruto = 100000 and comision = 4090 and retefuente = 1500 and reteica = 414 and neto_esperado = 93996 and diferencia = 0 and cobros = 1,
  'la liquidación guarda el desglose') from fin_liquidaciones_pasarela where id = :'liq1';
select t.ok(estado = 'registrado' and liquidacion_id = :'liq1', 'el cobro queda abonado') from fin_movimientos where id = :'m1';
select t.ok(count(*) = 3 and count(*) filter (where tipo = 'transferencia' and monto_original = 93996) = 1
  and count(*) filter (where categoria_codigo = 'COMISION_PASARELA' and monto_original = 4090) = 1
  and count(*) filter (where categoria_codigo = 'RETENCIONES_PRACTICADAS' and monto_original = 1914 and retenciones = '{"retefuente": 1500, "reteica": 414}'::jsonb) = 1,
  'genera la transferencia del neto, la comisión y las retenciones') from fin_movimientos where origen = 'bold_liquidacion' and origen_id = :'liq1';
select t.ok(pg_temp.saldo(:'bold') = :'bold_antes'::numeric - 100000 and pg_temp.saldo(:'banco') = :'banco_antes'::numeric + 93996,
  'la pasarela baja lo cobrado y el banco sube el neto');
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L, 1)$q$, :'m1', :'banco', :'hoy'), 'ya no está pendiente');
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(id, 'Anular la comisión a mano') from fin_movimientos where origen_id = %L and categoria_codigo = 'COMISION_PASARELA'$q$, :'liq1'), 'desde su origen');

-- Dos cobros juntos y llegó menos de lo esperado: la diferencia queda registrada.
select sum(neto) as neto_23 from fn_fin_pendientes_pasarela() where movimiento_id in (:'m2', :'m3') \gset
select pg_temp.liquidar(gen_random_uuid(), array[:'m2', :'m3']::uuid[], :'banco', :'hoy', :'neto_23'::numeric - 100) as liq2 \gset
select t.ok(cobros = 2 and bruto = 80000 and diferencia = 100, 'dos cobros con $100 de diferencia') from fin_liquidaciones_pasarela where id = :'liq2';
select t.ok(tipo = 'egreso' and categoria_codigo = 'AJUSTE_CAJA' and monto_original = 100, 'la diferencia sale como ajuste')
  from fin_movimientos where origen_id = :'liq2' and categoria_codigo = 'AJUSTE_CAJA';
select t.ok(pg_temp.saldo(:'bold') = :'bold_antes'::numeric - 180000, 'la pasarela queda sin esos cobros');

-- La tarifa usada ya no se modifica ni se borra.
select t.debe_fallar(format($q$update fin_tarifas_medio_pago set porcentaje_comision = 2 where id = %L$q$, :'tarifa'), 'ya se usó');
select t.debe_fallar(format($q$delete from fin_tarifas_medio_pago where id = %L$q$, :'tarifa'), 'ya se usó');

-- Anular la liquidación: lo generado se anula y los cobros vuelven a pendientes.
select t.debe_fallar(format($q$select fn_fin_anular_liquidacion(%L, 'corto')$q$, :'liq2'), '10 caracteres');
select fn_fin_anular_liquidacion(:'liq2', 'El abono era de otro día, se liquida de nuevo');
select t.ok(anulada and anulada_motivo like 'El abono%', 'la liquidación queda anulada') from fin_liquidaciones_pasarela where id = :'liq2';
select t.ok(count(*) = 2 and bool_and(estado = 'pendiente_abono' and liquidacion_id is null), 'sus cobros vuelven a estar pendientes')
  from fin_movimientos where id in (:'m2', :'m3');
select t.ok(not exists (select 1 from fin_movimientos where origen = 'bold_liquidacion' and origen_id = :'liq2' and estado <> 'anulado'),
  'lo que generó queda anulado');
select t.ok(pg_temp.saldo(:'bold') = :'bold_antes'::numeric - 100000 and pg_temp.saldo(:'banco') = :'banco_antes'::numeric + 93996,
  'y los saldos vuelven a como estaban');
select t.debe_fallar(format($q$select fn_fin_anular_liquidacion(%L, 'Otra vez la misma liquidación')$q$, :'liq2'), 'ya está anulada');
-- Se puede liquidar de nuevo (y llegó de más: la diferencia entra).
select pg_temp.liquidar(gen_random_uuid(), array[:'m2', :'m3']::uuid[], :'banco', :'hoy', :'neto_23'::numeric + 50) as liq3 \gset
select t.ok(tipo = 'ingreso' and monto_original = 50, 'si llegó de más, la diferencia entra') from fin_movimientos where origen_id = :'liq3' and categoria_codigo = 'AJUSTE_CAJA';

-- Un crédito cobrado con el datáfono usa la tarifa de la pasarela.
select pg_temp.trat(:'hoy', 100000, :'credito_mp') as c4 \gset
select fn_fin_registrar_cobro(:'c4', :'bold', :'hoy', 100000) as m4 \gset
select t.ok(estado = 'pendiente_abono' and medio_pago_id = :'credito_mp', 'el cobro con la pasarela queda pendiente') from fin_movimientos where id = :'m4';
select t.ok(neto = 93996, 'y usa la tarifa de la pasarela aunque su medio no tenga') from fn_fin_pendientes_pasarela() where movimiento_id = :'m4';
reset role;
select t.debe_fallar(format('update fin_movimientos set estado = ''registrado'' where id = %L', :'m4'), 'no permitido');

-- Sin permisos y otra clínica.
select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'sin finanzas no ve pendientes') from fn_fin_pendientes_pasarela();
select t.ok(count(*) = 0, 'ni tarifas ni liquidaciones') from (select id from fin_tarifas_medio_pago union all select id from fin_liquidaciones_pasarela) x;
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L, 1)$q$, :'m4', :'banco', :'hoy'), 'permiso');
select t.debe_fallar(format($q$select fn_fin_anular_liquidacion(%L, 'Sin permiso para anular esto')$q$, :'liq1'), 'permiso');
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve los pendientes ajenos') from fn_fin_pendientes_pasarela();
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[%L]::uuid[], %L, %L, 1)$q$, :'m4', :'banco', :'hoy'), 'ya no está pendiente');
select t.debe_fallar(format($q$select fn_fin_anular_liquidacion(%L, 'Anular algo de otra clínica')$q$, :'liq1'), 'no existe');
select t.debe_fallar(format($q$insert into fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde) values (clinica_actual(), %L, '2026-01-01')$q$, :'bold_mp'), 'no pertenece');
reset role;

-- ============================================================
-- Ajustes (0097)
-- ============================================================
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(%L, 'El cobro ya liquidado no se anula suelto')$q$, :'m1'), 'ya se liquidó');
-- El tratamiento de un cobro liquidado se anula: el ingreso queda por revisar.
select pg_temp.saldo(:'bold') as bold_h1 \gset
update tratamientos set anulado = true, anulado_motivo = 'Paciente pidió devolución', anulado_por = auth.uid(), anulado_en = now() where id = :'c1';
select t.ok(estado = 'registrado', 'el cobro liquidado sigue vigente') from fin_movimientos where id = :'m1';
select t.ok(pg_temp.saldo(:'bold') = :'bold_h1'::numeric, 'la pasarela no queda en negativo');
select t.ok(situacion = 'anulado_liquidado', 'y queda por revisar') from fn_fin_ingresos_pendientes() where cobro_id = :'c1';
select t.ok((fn_fin_generar_ingresos() ->> 'anulados')::int = 0, 'la puesta al día no lo toca');
-- Un crédito cobrado con Bold y liquidado: al corregir el tratamiento, el corregido hereda el abono.
select pg_temp.liquidar(gen_random_uuid(), array[:'m4']::uuid[], :'banco', :'hoy', 93996) as liq4 \gset
select pg_temp.saldo(:'bold') as bold_c \gset
select pg_temp.corregir(:'c4') as c4b \gset
select t.ok(estado = 'registrado' and liquidacion_id = :'liq4' and cobro_manual, 'el corregido hereda el cobro ya liquidado') from pg_temp.vivo(:'c4b');
select t.ok(pg_temp.saldo(:'bold') = :'bold_c'::numeric, 'y la pasarela no cambia');
select t.ok(count(*) = 1, 'el detalle de la liquidación sigue al corregido') from fin_liquidacion_cobros lc join pg_temp.vivo(:'c4b') v on v.id = lc.movimiento_id;
select fn_fin_anular_liquidacion(:'liq4', 'Se liquidó con el banco equivocado');
select t.ok(estado = 'pendiente_abono', 'anular esa liquidación devuelve al corregido a pendiente') from pg_temp.vivo(:'c4b');
-- La liquidación rechaza un neto esperado viejo.
select t.debe_fallar(format($q$select fn_fin_liquidar_pasarela(gen_random_uuid(), array[id], %L, %L, 1000, 1) from pg_temp.vivo(%L)$q$, :'banco', :'hoy', :'c4b'), 'tarifa de estos cobros cambió');
-- Tarifas usadas (también como respaldo de otro medio) y vigencias hacia atrás.
select t.debe_fallar(format($q$insert into fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde) values (clinica_actual(), %L, %L)$q$, :'bold_mp', :'hoy'), 'después del último');
select t.ok(count(*) = 3 and bool_and(tarifa_id = :'tarifa'), 'cada cobro liquidado guarda la tarifa usada') from fin_liquidacion_cobros lc join fin_liquidaciones_pasarela l on l.id = lc.liquidacion_id where not l.anulada;
reset role;
-- Sin plan Pro no se editan tarifas.
update clinicas set plan_id = (select id from planes where codigo = 'gratis') where nombre = 'Clinica A';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar(format($q$select pg_temp.liquidar(gen_random_uuid(), array[id], %L, %L, 1) from pg_temp.vivo(%L)$q$, :'banco', :'hoy', :'c4b'), 'plan Pro');
delete from fin_tarifas_medio_pago where vigente_desde > '2026-01-01';
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'pro') where nombre = 'Clinica A';
