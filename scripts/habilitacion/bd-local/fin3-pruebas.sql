-- Pruebas de Flujo de caja FC3 (0093): ingresos automáticos desde
-- tratamientos, por cobrar, por revisar y puesta al día.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
-- Registra un tratamiento como lo hace la app (la sesión es la del usuario).
create function pg_temp.trat(p_fecha date, p_costo numeric, p_medio uuid) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(),
    '00000000-0000-0000-0000-000000000341', p_fecha, p_costo, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), p_medio, auth.uid())
  returning id $$;
create function pg_temp.vivo(p_trat uuid) returns setof fin_movimientos language sql as $$
  select * from fin_movimientos where origen = 'tratamiento' and origen_id = p_trat and estado <> 'anulado' $$;
create function pg_temp.saldo(p_cuenta uuid) returns numeric language sql as $$
  select saldo from fn_fin_saldos() where cuenta_id = p_cuenta $$;
\set efectivo_mp '00000000-0000-0000-0000-000000000311'
\set bold_mp '00000000-0000-0000-0000-0000000f3001'
\set credito_mp '00000000-0000-0000-0000-0000000f3002'
\set sin_mp '00000000-0000-0000-0000-0000000f3003'
\set bold '00000000-0000-0000-0000-0000000f3101'

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as efectivo from fin_cuentas where nombre = 'Efectivo COP' \gset
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select id as usd from fin_cuentas where nombre = 'Dólares' \gset
select id as tarjeta from fin_cuentas where tipo = 'tarjeta_socio' \gset

-- Antes de configurar: el tratamiento se guarda y queda por revisar.
select pg_temp.trat(:'hoy', 80000, :'efectivo_mp') as antes \gset
select t.ok(not exists (select 1 from pg_temp.vivo(:'antes')), 'sin cuenta asignada al medio no se genera ingreso');
select t.ok(situacion = 'medio_sin_cuenta' and medio_pago = 'Medio Reporte' and paciente = 'Paciente Colombia' and valor = 80000,
  'queda por revisar, con el medio y el paciente para resolverlo') from fn_fin_ingresos_pendientes() where tratamiento_id = :'antes';

-- Medio de pago → cuenta.
insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id) values (clinica_actual(), :'efectivo_mp', :'efectivo');
insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id) values (clinica_actual(), :'bold_mp', :'bold');
insert into fin_medios_pago (clinica_id, medio_pago_id, es_credito) values (clinica_actual(), :'credito_mp', true);
select t.ok(created_by = auth.uid(), 'autoría forzada en la configuración') from fin_medios_pago where medio_pago_id = :'efectivo_mp';
select t.debe_fallar(format($q$insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id) values (clinica_actual(), %L, %L)$q$, :'sin_mp', :'usd'), 'en COP');
select t.debe_fallar(format($q$insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id) values (clinica_actual(), %L, %L)$q$, :'sin_mp', :'tarjeta'), 'tarjeta de un socio');
select t.debe_fallar(format($q$insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id, es_credito) values (clinica_actual(), %L, %L, true)$q$, :'sin_mp', :'banco'), 'fin_medio_destino');
select t.debe_fallar(format($q$insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id) values (clinica_actual(), %L, %L)$q$, :'efectivo_mp', :'banco'), 'fin_medios_pago_medio_pago_id_key');
select t.debe_fallar($q$insert into fin_medios_pago (clinica_id, medio_pago_id) values (clinica_actual(), '00000000-0000-0000-0000-000000000312')$q$, 'medio de pago no pertenece');
delete from fin_medios_pago where medio_pago_id = :'efectivo_mp';
select t.ok(count(*) = 1, 'por la API una configuración no se borra') from fin_medios_pago where medio_pago_id = :'efectivo_mp';

-- Al asignar la cuenta, el pendiente queda listo y la puesta al día lo genera.
select t.ok(situacion = 'por_generar', 'con la cuenta asignada queda listo para generar') from fn_fin_ingresos_pendientes() where tratamiento_id = :'antes';
select pg_temp.saldo(:'efectivo') as efectivo_antes \gset
select t.ok(fn_fin_generar_ingresos() = '{"generados": 1, "valor": 80000, "anulados": 0}'::jsonb, 'la puesta al día genera el ingreso pendiente');
select t.ok(pg_temp.saldo(:'efectivo') = :'efectivo_antes'::numeric + 80000, 'y el efectivo sube');
select t.ok(fn_fin_generar_ingresos() = '{"generados": 0, "valor": 0, "anulados": 0}'::jsonb, 'repetirla no duplica');

-- Tratamiento en efectivo: ingreso automático.
select pg_temp.trat(:'hoy', 150000, :'efectivo_mp') as t1 \gset
select t.ok(tipo = 'ingreso' and categoria_codigo = 'SERVICIOS_SALUD' and cuenta_id = :'efectivo' and monto_original = 150000
  and estado = 'registrado' and tercero_tipo = 'paciente' and tercero_nombre is null and descripcion = 'Tratamiento Reporte'
  and sede_id is not null and created_by = auth.uid() and fecha = :'hoy',
  'el tratamiento genera su ingreso (servicios de salud, sin el nombre del paciente)') from pg_temp.vivo(:'t1');
select t.ok(pg_temp.saldo(:'efectivo') = :'efectivo_antes'::numeric + 230000, 'el ingreso suma al efectivo');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where tratamiento_id = :'t1'), 'y no queda pendiente');

-- Pasarela: entra pendiente de abono con fecha esperada.
select pg_temp.trat(:'hoy', 100000, :'bold_mp') as t2 \gset
select t.ok(cuenta_id = :'bold' and estado = 'pendiente_abono' and fecha_esperada > fecha, 'con Bold entra a la pasarela pendiente de abono')
  from pg_temp.vivo(:'t2');

-- Crédito: por cobrar, sin movimiento.
select pg_temp.trat(:'hoy', 300000, :'credito_mp') as t3 \gset
select t.ok(not exists (select 1 from pg_temp.vivo(:'t3')), 'el crédito no mueve plata al registrarse');
select t.ok(situacion = 'por_cobrar' and valor = 300000, 'queda por cobrar') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t3';

-- Lo que no aplica.
select pg_temp.trat('2026-01-10', 50000, :'efectivo_mp') as t_antes_inicio \gset
select pg_temp.trat(:'hoy', 0, :'efectivo_mp') as t_cortesia \gset
select pg_temp.trat(:'hoy', null, :'efectivo_mp') as t_sin_valor \gset
select pg_temp.trat(:'hoy'::date + 3, 70000, :'efectivo_mp') as t_futuro \gset
select t.ok(not exists (select 1 from fin_movimientos where origen_id in (:'t_antes_inicio', :'t_cortesia', :'t_sin_valor', :'t_futuro')),
  'antes del inicio, cortesía, sin valor o futuro: no generan ingreso (y el tratamiento se guarda)');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where tratamiento_id in (:'t_antes_inicio', :'t_cortesia')),
  'lo anterior al inicio y las cortesías no piden revisión');
select t.ok((select situacion from fn_fin_ingresos_pendientes() where tratamiento_id = :'t_sin_valor') = 'sin_valor'
  and (select situacion from fn_fin_ingresos_pendientes() where tratamiento_id = :'t_futuro') = 'fecha_futura',
  'sin valor y con fecha futura quedan por revisar');

-- Anular el tratamiento anula su ingreso; revertir lo genera de nuevo.
select id as ingreso_t1 from pg_temp.vivo(:'t1') \gset
update tratamientos set anulado = true, anulado_motivo = 'Paciente equivocado', anulado_por = auth.uid(), anulado_en = now() where id = :'t1';
select t.ok(m.estado = 'anulado' and m.anulado_motivo = 'Tratamiento anulado: Paciente equivocado' and r.tipo = 'egreso' and r.cuenta_id = :'efectivo',
  'anular el tratamiento anula su ingreso con el movimiento inverso') from fin_movimientos m join fin_movimientos r on r.anula_a = m.id where m.id = :'ingreso_t1';
select t.ok(pg_temp.saldo(:'efectivo') = :'efectivo_antes'::numeric + 80000, 'y el efectivo vuelve');
update tratamientos set anulado = false, anulado_motivo = null, anulado_por = null, anulado_en = null where id = :'t1';
select t.ok(count(*) = 1 and min(id::text) <> :'ingreso_t1', 'revertir la anulación genera un ingreso nuevo') from pg_temp.vivo(:'t1');
select t.ok(pg_temp.saldo(:'efectivo') = :'efectivo_antes'::numeric + 230000, 'y el efectivo vuelve a sumar');

-- Anular a mano el ingreso de un tratamiento (cuenta equivocada): vuelve a pendiente.
select id as ingreso_t2 from pg_temp.vivo(:'t2') \gset
select fn_fin_anular_movimiento(:'ingreso_t2', 'El cobro entró por el banco, no por Bold');
select t.ok(situacion = 'por_generar', 'anulado a mano, el tratamiento vuelve a quedar pendiente') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t2';

-- Registrar el cobro (crédito o resolución a mano).
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 300000)$q$, :'t3', :'tarjeta', :'hoy'), 'tarjeta de un socio');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 300000)$q$, :'t3', :'usd', :'hoy'), 'en COP');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 0)$q$, :'t3', :'banco', :'hoy'), 'mayor que cero');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L::date + 1, 300000)$q$, :'t3', :'banco', :'hoy'), 'futura');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, '2026-01-01', 300000)$q$, :'t3', :'banco'), 'anterior al inicio');
select pg_temp.saldo(:'banco') as banco_antes \gset
select fn_fin_registrar_cobro(:'t3', :'banco', :'hoy', 300000) as cobro \gset
select t.ok(cuenta_id = :'banco' and estado = 'registrado' and origen = 'tratamiento' and descripcion like 'Cobro: Tratamiento Reporte del %',
  'el cobro entra al banco como ingreso del tratamiento') from fin_movimientos where id = :'cobro';
select t.ok(pg_temp.saldo(:'banco') = :'banco_antes'::numeric + 300000, 'y suma al banco');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where tratamiento_id = :'t3'), 'ya no está por cobrar');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 300000)$q$, :'t3', :'banco', :'hoy'), 'ya tiene su ingreso');
select fn_fin_registrar_cobro(:'t2', :'banco', :'hoy', 100000);
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where tratamiento_id = :'t2'), 'el pendiente también se resuelve registrando el cobro');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 1)$q$, :'t1', :'banco', :'hoy'), 'ya tiene su ingreso');
reset role;

-- Finanzas no bloquea lo clínico: si el ingreso falla, el tratamiento se guarda.
alter table fin_movimientos add constraint t_prueba_tope check (monto_original < 1000000) not valid;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select pg_temp.trat(:'hoy', 2000000, :'efectivo_mp') as t_falla \gset
select t.ok(exists (select 1 from tratamientos where id = :'t_falla') and not exists (select 1 from pg_temp.vivo(:'t_falla')),
  'si el ingreso no se puede generar, el tratamiento se guarda igual');
select t.ok(situacion = 'por_generar', 'y queda pendiente para la puesta al día') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t_falla';
reset role;
alter table fin_movimientos drop constraint t_prueba_tope;

-- Un tratamiento anulado cuyo ingreso quedó vivo (p. ej. por un fallo) se pone al día.
alter table tratamientos disable trigger tratamientos_flujo_caja;
update tratamientos set anulado = true, anulado_motivo = 'Anulado sin sincronizar', anulado_en = now() where id = :'t1';
alter table tratamientos enable trigger tratamientos_flujo_caja;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok(situacion = 'anulado_con_ingreso', 'el ingreso vivo de un tratamiento anulado queda por revisar') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t1';
select t.ok(fn_fin_generar_ingresos() = '{"generados": 1, "valor": 2000000, "anulados": 1}'::jsonb, 'la puesta al día lo anula y genera lo que faltaba');
select t.ok(not exists (select 1 from pg_temp.vivo(:'t1')), 'el tratamiento anulado ya no tiene ingreso');
-- El inicio se puede mover hacia atrás: el tratamiento del 10 de enero queda pendiente.
update fin_config set fecha_inicio = '2026-01-05', motivo_cambio = 'Cargar también la primera semana de enero';
select t.ok(situacion = 'por_generar', 'mover el inicio hacia atrás deja pendientes los tratamientos de ese rango') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t_antes_inicio';
select t.ok((fn_fin_generar_ingresos() ->> 'generados')::int = 1, 'y la puesta al día los genera');
reset role;

-- Sin permisos de finanzas.
select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'sin finanzas no ve lo pendiente') from fn_fin_ingresos_pendientes();
select t.ok(count(*) = 0, 'ni la configuración de medios') from fin_medios_pago;
select t.debe_fallar('select fn_fin_generar_ingresos()', 'permiso');
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 1)$q$, :'t_sin_valor', :'banco', :'hoy'), 'permiso');
update fin_medios_pago set cuenta_id = null where medio_pago_id = :'efectivo_mp';
reset role;
select t.ok(cuenta_id is not null, 'sin finanzas no cambia la configuración') from fin_medios_pago where medio_pago_id = :'efectivo_mp';

-- Otra clínica.
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve lo pendiente ajeno') from fn_fin_ingresos_pendientes();
select t.debe_fallar(format($q$select fn_fin_registrar_cobro(%L, %L, %L, 1)$q$, :'t_sin_valor', :'banco', :'hoy'), 'no existe');
select t.ok(fn_fin_generar_ingresos() = '{"generados": 0, "valor": 0, "anulados": 0}'::jsonb, 'su puesta al día no toca lo ajeno');
reset role;
-- Sin flujo de caja activado, los tratamientos no generan nada.
begin;
set local session_replication_role = replica;
delete from fin_config where clinica_id = (select id from clinicas where nombre = 'Clinica B');
set local session_replication_role = origin;
insert into fin_medios_pago (clinica_id, medio_pago_id, cuenta_id)
select c.clinica_id, '00000000-0000-0000-0000-000000000312', c.id from fin_cuentas c join clinicas k on k.id = c.clinica_id
where k.nombre = 'Clinica B' and c.tipo = 'efectivo' and c.moneda = 'COP' limit 1;
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id)
select c.id, '00000000-0000-0000-0000-000000000323', '00000000-0000-0000-0000-000000000302', u.id, '00000000-0000-0000-0000-000000000344',
  (now() at time zone 'America/Bogota')::date, 5000, s.id, '00000000-0000-0000-0000-000000000312'
from clinicas c join usuarios u on u.clinica_id = c.id and u.nombre = 'Admin B' join sedes s on s.clinica_id = c.id where c.nombre = 'Clinica B' limit 1
returning id as t_b \gset
select t.ok(not exists (select 1 from fin_movimientos where origen_id = :'t_b'), 'sin flujo de caja activado, los tratamientos no generan nada');
rollback;
