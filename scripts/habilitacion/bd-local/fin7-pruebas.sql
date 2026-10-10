-- Pruebas de Flujo de caja 0101: excluir tratamientos del flujo de caja,
-- volver a incluirlos y ver los que ya entraron.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.trat(p_fecha date, p_costo numeric, p_medio uuid) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(),
    '00000000-0000-0000-0000-000000000341', p_fecha, p_costo, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), p_medio, auth.uid())
  returning id $$;
\set efectivo_mp '00000000-0000-0000-0000-000000000311'
\set sin_mp '00000000-0000-0000-0000-0000000f3003'
\set credito_mp '00000000-0000-0000-0000-0000000f3002'

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset

-- Un tratamiento con medio sin cuenta: pendiente; se excluye con motivo.
select pg_temp.trat(:'hoy'::date + 3, 90000, :'efectivo_mp') as t1 \gset
select t.ok(situacion = 'fecha_futura', 'antes de excluir está pendiente') from fn_fin_ingresos_pendientes() where cobro_id = :'t1';
select t.debe_fallar(format($q$select fn_fin_excluir_cobro(%L, 'corto')$q$, :'t1'), 'al menos 10 caracteres');
select fn_fin_excluir_cobro(:'t1', 'Cortesía de la gerencia, no se cobra');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where cobro_id = :'t1'), 'excluido, sale de los pendientes');
select t.ok(situacion = 'excluido' and motivo = 'Cortesía de la gerencia, no se cobra' and valor = 90000 and paciente = 'Paciente Colombia',
  'aparece en la vista de excluidos con su motivo') from fn_fin_cobros_flujo('excluidos') where cobro_id = :'t1';
select t.debe_fallar(format($q$select fn_fin_excluir_cobro(%L, 'Otra vez excluido a mano')$q$, :'t1'), 'ya está excluido');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 90000)$q$, :'t1', :'banco', :'hoy'), 'excluido del flujo de caja');
select t.ok(fn_fin_generar_ingresos() ->> 'generados' is not null and not exists (select 1 from fin_movimientos where origen = 'tratamiento' and origen_id = :'t1'),
  'poner al día no genera el ingreso de un excluido');

-- Volver a incluir: vuelve a pendiente y el cobro vuelve a ser posible.
select fn_fin_reincluir_cobro(:'t1');
select t.ok(situacion = 'fecha_futura', 'reincluido, vuelve a los pendientes') from fn_fin_ingresos_pendientes() where cobro_id = :'t1';
select t.ok(not exists (select 1 from fn_fin_cobros_flujo('excluidos') where cobro_id = :'t1'), 'y ya no está en excluidos');
select t.debe_fallar(format($q$select fn_fin_reincluir_cobro(%L)$q$, :'t1'), 'no está excluido');
select fn_fin_excluir_cobro(:'t1', 'Se excluye otra vez por decisión');
select t.ok(count(*) = 1, 'se puede excluir de nuevo tras reincluir') from fn_fin_cobros_flujo('excluidos') where cobro_id = :'t1';
select t.ok(count(*) = 1, 'queda una sola fila de historia por tratamiento') from fin_cobros_excluidos where cobro_id = :'t1';

-- Un tratamiento sin valor también se puede excluir.
select pg_temp.trat(:'hoy', null, :'efectivo_mp') as t2 \gset
select fn_fin_excluir_cobro(:'t2', 'El paciente canceló y no se cobra');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where cobro_id = :'t2'), 'un tratamiento sin valor, excluido, ya no pide revisión');

-- Lo que ya entró al flujo no se puede excluir y se ve en "en flujo".
select pg_temp.trat(:'hoy', 150000, :'efectivo_mp') as t3 \gset
select t.ok(situacion = 'en_flujo' and movimiento_id is not null and valor = 150000, 'el tratamiento con ingreso aparece en la vista "en flujo"')
  from fn_fin_cobros_flujo('en_flujo') where cobro_id = :'t3';
select t.ok(not exists (select 1 from fn_fin_cobros_flujo('en_flujo') where cobro_id in (:'t1', :'t2')), 'los excluidos no salen en "en flujo"');
select t.debe_fallar(format($q$select fn_fin_excluir_cobro(%L, 'Ya entró pero lo quiero sacar')$q$, :'t3'), 'ya tiene su ingreso');
select t.ok(count(*) = 0, 'una vista desconocida no devuelve nada') from fn_fin_cobros_flujo('otra');

-- Sin permiso y entre clínicas.
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.debe_fallar(format($q$select fn_fin_excluir_cobro(%L, 'Intento desde otra clínica')$q$, :'t3'), 'no existe');
select t.ok(not exists (select 1 from fn_fin_cobros_flujo('excluidos')), 'otra clínica no ve los excluidos de esta');
reset role;
