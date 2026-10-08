-- Pruebas de Flujo de caja FC2 (0091): movimientos, anulación y saldos.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as efectivo from fin_cuentas where nombre = 'Efectivo COP' \gset
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select id as usd from fin_cuentas where nombre = 'Dólares' \gset
select id as tarjeta from fin_cuentas where tipo = 'tarjeta_socio' \gset
select id as ana from fin_socios where nombre = 'Ana Socia' \gset
update fin_cuentas set activa = true where id in (:'usd', :'tarjeta');
select t.ok(saldo = 12000000, 'sin movimientos el saldo es el inicial') from fn_fin_saldos() where cuenta_id = :'banco';

-- Egreso en pesos con proveedor.
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, proveedor_id, tercero_tipo, moneda, monto_original, descripcion)
values (clinica_actual(), :'hoy', 'egreso', 'ARRENDAMIENTO', :'banco', '00000000-0000-0000-0000-0000000f2001', 'proveedor', 'COP', 2500000, 'Arriendo de octubre')
returning id as arriendo \gset
select t.ok(valor_cop = 2500000 and created_by = auth.uid(), 'el valor en COP lo calcula la BD y el autor es la sesión') from fin_movimientos where id = :'arriendo';
select t.ok(saldo = 9500000, 'el egreso baja el saldo del banco') from fn_fin_saldos() where cuenta_id = :'banco';

-- Reglas.
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L::date + 1, 'egreso', 'GASOLINA', %L, 'COP', 1)$q$, :'hoy', :'banco'), 'futura');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), '2025-12-31', 'egreso', 'GASOLINA', %L, 'COP', 1)$q$, :'banco'), 'anterior al inicio');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'ingreso', 'ARRENDAMIENTO', %L, 'COP', 1)$q$, :'hoy', :'banco'), 'es de salidas');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'egreso', 'COMISION_PASARELA', %L, 'COP', 1)$q$, :'hoy', :'banco'), 'registra el sistema');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'egreso', 'GASOLINA', %L, 'COP', 1)$q$, :'hoy', :'usd'), 'en USD');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'egreso', 'PRESTAMO_A_SOCIO', %L, 'COP', 100)$q$, :'hoy', :'banco'), 'socio del préstamo');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'ingreso', 'OTROS_INGRESOS', %L, 'COP', 100)$q$, :'hoy', :'tarjeta'), 'solo se registran gastos');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'egreso', %L, 'COP', 100)$q$, :'hoy', :'banco'), 'fin_mov_categoria');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, origen) values (clinica_actual(), %L, 'egreso', 'GASOLINA', %L, 'COP', 1, 'tratamiento')$q$, :'hoy', :'banco'), 'row-level');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, tasa_cop) values (clinica_actual(), %L, 'egreso', 'GASOLINA', %L, 'COP', 1, 2)$q$, :'hoy', :'banco'), 'fin_mov_tasa_cop');

-- Divisas.
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, tasa_cop)
values (clinica_actual(), :'hoy', 'egreso', 'SOFTWARE_WEB', :'usd', 'USD', 20, 4123.45) returning id as soft \gset
select t.ok(valor_cop = 82469 and monto_original = 20, 'en dólares guarda el monto original, la tasa y el valor en COP') from fin_movimientos where id = :'soft';
select t.ok(saldo = 230, 'la caja en dólares baja en dólares (250 − 20)') from fn_fin_saldos() where cuenta_id = :'usd';

-- Tarjeta del socio: el gasto es deuda, no sale de la caja.
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original)
values (clinica_actual(), :'hoy', 'egreso', 'PREPAGADA', :'tarjeta', 'COP', 480000);
select t.ok(saldo = -830000, 'el gasto con la tarjeta de Ana aumenta la deuda (350.000 + 480.000)') from fn_fin_saldos() where cuenta_id = :'tarjeta';

-- Préstamo a socio y transferencias.
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, socio_id, moneda, monto_original)
values (clinica_actual(), :'hoy', 'egreso', 'PRESTAMO_A_SOCIO', :'banco', :'ana', 'COP', 1000000) returning id as prestamo \gset
select t.ok(tercero_tipo = 'socio', 'el préstamo queda a nombre del socio') from fin_movimientos where id = :'prestamo';
insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino)
values (clinica_actual(), :'hoy', 'transferencia', :'efectivo', :'banco', 'COP', 300000, 300000) returning id as consignacion \gset
select t.ok((select saldo from fn_fin_saldos() where cuenta_id = :'efectivo') = 200000
  and (select saldo from fn_fin_saldos() where cuenta_id = :'banco') = 8800000,
  'consignar efectivo: sale de la caja y llega al banco (12M − 2,5M − 1M + 0,3M)');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino) values (clinica_actual(), %L, 'transferencia', %L, %L, 'COP', 1, 2)$q$, :'hoy', :'efectivo', :'banco'), 'deben ser iguales');
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino) values (clinica_actual(), %L, 'transferencia', %L, %L, 'COP', 1, 1)$q$, :'hoy', :'banco', :'tarjeta'), 'reembolsa');
-- Comprar dólares: sale en pesos, llega en dólares.
insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino)
values (clinica_actual(), :'hoy', 'transferencia', :'banco', :'usd', 'COP', 412345, 100) returning id as compra_usd \gset
select t.ok(saldo = 330, 'comprar dólares suma a la caja en dólares') from fn_fin_saldos() where cuenta_id = :'usd';

-- Inmutable y anulación.
update fin_movimientos set monto_original = 1 where id = :'arriendo';
select t.ok(monto_original = 2500000, 'por la API un movimiento no se modifica') from fin_movimientos where id = :'arriendo';
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(%L, 'corto')$q$, :'arriendo'), '10 caracteres');
select fn_fin_anular_movimiento(:'arriendo', 'Se registró dos veces el arriendo') as reverso \gset
select t.ok(m.estado = 'anulado' and r.tipo = 'ingreso' and r.categoria_codigo = 'ARRENDAMIENTO' and r.anula_a = m.id and r.origen = 'anulacion',
  'anular crea el movimiento inverso y marca el original') from fin_movimientos m, fin_movimientos r where m.id = :'arriendo' and r.id = :'reverso';
select t.ok(saldo = 10887655, 'tras anular, el saldo vuelve (8,8M − 412.345 de los dólares + 2,5M)') from fn_fin_saldos() where cuenta_id = :'banco';
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(%L, 'Otra vez el mismo movimiento')$q$, :'arriendo'), 'ya está anulado');
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(%L, 'Anular la anulación no vale')$q$, :'reverso'), 'no se anula');
select fn_fin_anular_movimiento(:'compra_usd', 'La compra de dólares no se hizo');
select t.ok((select saldo from fn_fin_saldos() where cuenta_id = :'usd') = 230 and (select saldo from fn_fin_saldos() where cuenta_id = :'banco') = 11300000,
  'anular una transferencia entre monedas la devuelve en cada moneda');
select t.ok(saldo = 12000000, 'el saldo a una fecha anterior no ve los movimientos de hoy') from fn_fin_saldos(:'hoy'::date - 1) where cuenta_id = :'banco';
reset role;
select t.debe_fallar(format('update fin_movimientos set descripcion = ''x'' where id = %L', :'prestamo'), 'no se modifica');
select t.debe_fallar(format('delete from fin_movimientos where id = %L', :'prestamo'), 'no se borra');

-- Sin permiso de anular (VOID): rol con solo VIEW/CREATE.
select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(%L, 'Intento sin permiso de anular')$q$, :'prestamo'), 'permiso');
select t.ok(count(*) = 0, 'sin permiso de finanzas no ve movimientos') from fin_movimientos;
reset role;

-- Otra clínica.
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve movimientos ajenos') from fin_movimientos;
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), %L, 'egreso', 'GASOLINA', %L, 'COP', 1)$q$, :'hoy', :'banco'), 'no pertenece');
select t.debe_fallar(format($q$select fn_fin_anular_movimiento(%L, 'Anular algo de otra clínica')$q$, :'prestamo'), 'no existe');
select t.ok(not exists (select 1 from fn_fin_saldos() where cuenta_id = :'banco'), 'ni el saldo de sus cuentas');
reset role;
