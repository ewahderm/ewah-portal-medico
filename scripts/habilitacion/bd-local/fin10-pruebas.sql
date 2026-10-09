-- Pruebas de Flujo de caja 0104: tarjeta de crédito de la empresa.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.saldo(p_cuenta uuid) returns numeric language sql as $$
  select saldo from fn_fin_saldos() where cuenta_id = p_cuenta $$;

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select fecha_inicio as inicio from fin_config \gset

-- La cuenta: deuda inicial negativa, en pesos, no disponible.
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo, saldo_inicial) values (clinica_actual(), 'Tarjeta mal', 'tarjeta_empresa', 1000)$q$, 'fin_cuenta_saldo_signo');
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo, moneda) values (clinica_actual(), 'Tarjeta USD', 'tarjeta_empresa', 'USD')$q$, 'fin_cuenta');
insert into fin_cuentas (clinica_id, nombre, tipo, saldo_inicial) values (clinica_actual(), 'Visa empresa', 'tarjeta_empresa', -200000) returning id as tarjeta \gset
select t.ok(not es_disponible and puc_codigo_defecto = '2105' and socio_id is null and created_by = auth.uid(),
  'la tarjeta de la empresa no es plata disponible, va a obligaciones financieras y no tiene socio') from fin_cuentas where id = :'tarjeta';
select t.ok(pg_temp.saldo(:'tarjeta') = -200000, 'arranca con lo que ya se debía');
select t.ok(es_disponible, 'las demás cuentas siguen igual') from fin_cuentas where id = :'banco';

-- Gasto con la tarjeta: la deuda sube y el banco no se mueve.
select coalesce((select salidas from fn_fin_flujo(:'hoy', :'hoy') where codigo = 'SOFTWARE_WEB'), 0) as sw_antes \gset
select pg_temp.saldo(:'banco') as banco_antes \gset
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, descripcion)
values (clinica_actual(), :'hoy', 'egreso', 'SOFTWARE_WEB', :'tarjeta', 'COP', 300000, 'Suscripción del software') returning id as gasto \gset
select t.ok(pg_temp.saldo(:'tarjeta') = -500000 and pg_temp.saldo(:'banco') = :'banco_antes'::numeric, 'el gasto aumenta la deuda de la tarjeta, no toca el banco');

-- Con la tarjeta solo se registran gastos.
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'ingreso', 'OTROS_INGRESOS', %L, 'COP', 100)$q$, :'hoy', :'tarjeta'), 'no llegan cobros');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino) values (clinica_actual(), %L, 'transferencia', %L, %L, 'COP', 100, 100)$q$, :'hoy', :'tarjeta', :'banco'), 'solo se registran gastos');

-- Pagar la tarjeta: transferencia desde el banco, sin pagar de más.
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino) values (clinica_actual(), %L, 'transferencia', %L, %L, 'COP', 600000, 600000)$q$, :'hoy', :'banco', :'tarjeta'), 'No se paga de más');
insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino, descripcion)
values (clinica_actual(), :'hoy', 'transferencia', :'banco', :'tarjeta', 'COP', 450000, 450000, 'Pago del extracto') returning id as pago \gset
select t.ok(pg_temp.saldo(:'tarjeta') = -50000 and pg_temp.saldo(:'banco') = :'banco_antes'::numeric - 450000, 'el pago baja la deuda y sale del banco');

-- Informe: la salida de efectivo es el pago, no el gasto con la tarjeta.
select t.ok(actividad = 'operacion' and salidas = 450000, 'el pago de la tarjeta sale como operación') from fn_fin_flujo(:'hoy', :'hoy') where codigo = 'PAGO_TARJETA_EMPRESA';
select t.ok(coalesce((select salidas from fn_fin_flujo(:'hoy', :'hoy') where codigo = 'SOFTWARE_WEB'), 0) = :'sw_antes'::numeric, 'el gasto con la tarjeta aún no es salida de efectivo');

-- Anular el pago: vuelve la deuda (la anulación sí puede salir de la tarjeta).
select fn_fin_anular_movimiento(:'pago', 'Se registró dos veces el pago');
select t.ok(pg_temp.saldo(:'tarjeta') = -500000 and pg_temp.saldo(:'banco') = :'banco_antes'::numeric, 'anular el pago devuelve la deuda y la plata al banco');
select t.ok(coalesce((select salidas - entradas from fn_fin_flujo(:'hoy', :'hoy') where codigo = 'PAGO_TARJETA_EMPRESA'), 0) = 0, 'y en el informe se compensa');

-- No recibe cobros de pacientes.
select t.debe_fallar(format($q$update fin_medios_pago set cuenta_id = %L where medio_pago_id = '00000000-0000-0000-0000-000000000311'$q$, :'tarjeta'), 'no llegan cobros');

-- Está en todos los planes (no es del plan Pro): la regla vive en el trigger de cuentas.
select t.ok(nombre = 'Pago de tarjeta de crédito' and automatica and tipo = 'transferencia', 'la categoría del pago es del sistema') from fin_categorias where codigo = 'PAGO_TARJETA_EMPRESA';
reset role;
