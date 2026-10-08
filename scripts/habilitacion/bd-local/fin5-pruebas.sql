-- Pruebas de Flujo de caja FC5 (0096): saldos por socio, reembolso de la
-- tarjeta, préstamos y devoluciones.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.saldo(p_cuenta uuid) returns numeric language sql as $$ select saldo from fn_fin_saldos() where cuenta_id = p_cuenta $$;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select id as tarjeta from fin_cuentas where tipo = 'tarjeta_socio' \gset
select id as bold from fin_cuentas where tipo = 'pasarela' \gset
select id as ana from fin_socios where nombre = 'Ana Socia' \gset
select id as luis from fin_socios where nombre = 'Luis Socio' \gset
select -pg_temp.saldo(:'tarjeta') as deuda0 \gset

select t.ok(deuda_tarjeta = :'deuda0'::numeric and prestado_a_socio = 1000000 and nos_debe = 1000000 and le_debemos = :'deuda0'::numeric,
  'Ana: se le debe lo de su tarjeta y ella debe el préstamo de $1.000.000') from fn_fin_socios_saldos() where socio_id = :'ana';
select t.ok(le_debemos = 0 and nos_debe = 0, 'Luis está al día') from fn_fin_socios_saldos() where socio_id = :'luis';

-- Reembolso parcial de la tarjeta.
select pg_temp.saldo(:'banco') as banco0 \gset
select fn_fin_reembolsar_socio(:'tarjeta', :'banco', :'hoy', 300000, 'Reembolso de la prepagada') as reemb \gset
select t.ok(tipo = 'transferencia' and categoria_codigo = 'REEMBOLSO_SOCIO' and socio_id = :'ana' and origen = 'reembolso_socio' and tercero_tipo = 'socio',
  'el reembolso es una transferencia del banco a la tarjeta de Ana') from fin_movimientos where id = :'reemb';
select t.ok(-pg_temp.saldo(:'tarjeta') = :'deuda0'::numeric - 300000 and pg_temp.saldo(:'banco') = :'banco0'::numeric - 300000,
  'baja la deuda y sale del banco');
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, %s)$q$, :'tarjeta', :'banco', :'hoy', :'deuda0'::numeric - 300000 + 1), 'de más');
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, 1)$q$, :'tarjeta', :'bold', :'hoy'), 'cuenta activa en pesos');
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, 1)$q$, :'banco', :'banco', :'hoy'), 'tarjeta no pertenece');
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, 0)$q$, :'tarjeta', :'banco', :'hoy'), 'mayor que cero');
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L::date + 1, 1)$q$, :'tarjeta', :'banco', :'hoy'), 'futura');
select fn_fin_anular_movimiento(:'reemb', 'El reembolso se registró dos veces');
select t.ok(-pg_temp.saldo(:'tarjeta') = :'deuda0'::numeric and pg_temp.saldo(:'banco') = :'banco0'::numeric, 'anular el reembolso deja la deuda como estaba');
select fn_fin_reembolsar_socio(:'tarjeta', :'banco', :'hoy', :'deuda0'::numeric);
select t.ok(pg_temp.saldo(:'tarjeta') = 0 and deuda_tarjeta = 0, 'reembolsar todo deja la tarjeta al día') from fn_fin_socios_saldos() where socio_id = :'ana';
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, 1)$q$, :'tarjeta', :'banco', :'hoy'), 'de más');

-- Ana devuelve parte del préstamo.
select fn_fin_devolucion_prestamo(:'ana', 'socio_devuelve', :'banco', :'hoy', 400000) as dev \gset
select t.ok(tipo = 'ingreso' and categoria_codigo = 'PRESTAMO_A_SOCIO' and origen = 'devolucion_socio' and socio_id = :'ana',
  'la devolución entra con la categoría del préstamo') from fin_movimientos where id = :'dev';
select t.ok(prestado_a_socio = 600000, 'el préstamo pendiente baja a $600.000') from fn_fin_socios_saldos() where socio_id = :'ana';
select t.debe_fallar(format($q$select fn_fin_devolucion_prestamo(%L, 'socio_devuelve', %L, %L, 600001)$q$, :'ana', :'banco', :'hoy'), 'de más');
select t.debe_fallar(format($q$select fn_fin_devolucion_prestamo(%L, 'otro', %L, %L, 1)$q$, :'ana', :'banco', :'hoy'), 'quién devuelve');

-- Luis le presta a la clínica y se le devuelve una parte.
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, socio_id, moneda, monto_original)
values (clinica_actual(), :'hoy', 'ingreso', 'PRESTAMO_DE_SOCIO', :'banco', :'luis', 'COP', 2000000);
select t.ok(prestado_por_socio = 2000000 and le_debemos = 2000000, 'la clínica le debe a Luis su préstamo') from fn_fin_socios_saldos() where socio_id = :'luis';
select t.debe_fallar(format($q$select fn_fin_devolucion_prestamo(%L, 'socio_devuelve', %L, %L, 1)$q$, :'luis', :'banco', :'hoy'), 'de más');
select fn_fin_devolucion_prestamo(:'luis', 'clinica_devuelve', :'banco', :'hoy', 500000) as dev_luis \gset
select t.ok(prestado_por_socio = 1500000, 'tras devolverle $500.000 se le deben $1.500.000') from fn_fin_socios_saldos() where socio_id = :'luis';
select fn_fin_anular_movimiento(:'dev_luis', 'La devolución no se hizo todavía');
select t.ok(prestado_por_socio = 2000000, 'anular la devolución la deshace') from fn_fin_socios_saldos() where socio_id = :'luis';
reset role;

-- Ajustes (0099): anular sin dejar saldos imposibles, fechas atrás y cuentas.
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar($q$select fn_fin_anular_movimiento(id, 'El préstamo fue por otro valor') from fin_movimientos
  where categoria_codigo = 'PRESTAMO_A_SOCIO' and tipo = 'egreso' and origen = 'manual' and estado <> 'anulado' limit 1$q$, 'devoluciones');
select t.debe_fallar($q$select fn_fin_anular_movimiento(id, 'La prepagada no era de la clínica') from fin_movimientos
  where categoria_codigo = 'PREPAGADA' and estado <> 'anulado' limit 1$q$, 'ya se le reembolsó');
select t.debe_fallar(format($q$select fn_fin_devolucion_prestamo(%L, 'clinica_devuelve', %L, '2026-03-01', 1000)$q$, :'luis', :'banco'), 'a esa fecha');
select t.ok(prestado_por_socio = 0, 'a una fecha anterior al préstamo no se le debía nada') from fn_fin_socios_saldos('2026-03-01') where socio_id = :'luis';
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, socio_id, moneda, monto_original) values (clinica_actual(), %L, 'egreso', 'PRESTAMO_A_SOCIO', %L, %L, 'COP', 1000)$q$, :'hoy', :'tarjeta', :'ana'), 'plata disponible');
-- Un préstamo sin devoluciones sí se anula.
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, socio_id, moneda, monto_original)
values (clinica_actual(), :'hoy', 'egreso', 'PRESTAMO_A_SOCIO', :'banco', :'luis', 'COP', 70000) returning id as p_luis \gset
select fn_fin_anular_movimiento(:'p_luis', 'Préstamo registrado por error');
select t.ok(prestado_a_socio = 0, 'un préstamo sin devoluciones se anula') from fn_fin_socios_saldos() where socio_id = :'luis';
reset role;

-- Sin permisos y otra clínica.
select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'sin finanzas no ve saldos de socios') from fn_fin_socios_saldos();
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, 1)$q$, :'tarjeta', :'banco', :'hoy'), 'permiso');
select t.debe_fallar(format($q$select fn_fin_devolucion_prestamo(%L, 'socio_devuelve', %L, %L, 1)$q$, :'ana', :'banco', :'hoy'), 'permiso');
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(not exists (select 1 from fn_fin_socios_saldos() where socio_id = :'ana'), 'otra clínica no ve los socios ajenos');
select t.debe_fallar(format($q$select fn_fin_reembolsar_socio(%L, %L, %L, 1)$q$, :'tarjeta', :'banco', :'hoy'), 'no pertenece');
select t.debe_fallar(format($q$select fn_fin_devolucion_prestamo(%L, 'socio_devuelve', %L, %L, 1)$q$, :'ana', :'banco', :'hoy'), 'no pertenece');
reset role;
