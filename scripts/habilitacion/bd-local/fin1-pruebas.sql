-- Pruebas de Flujo de caja FC1 (0089): módulo, fecha de inicio, categorías,
-- socios y cuentas.
\set ON_ERROR_STOP 1
select id as b from clinicas where nombre = 'Clinica B' \gset
select id as sede_b from sedes where clinica_id = :'b' limit 1 \gset
select t.ok(count(*) = 25 and count(*) filter (where automatica) = 5
  and count(*) filter (where actividad = 'inversion') = 1 and count(*) filter (where actividad = 'financiacion') = 4,
  'catálogo: 25 categorías, 5 automáticas, 1 de inversión y 4 de financiación') from fin_categorias;
select t.ok(not exists (select 1 from fin_categorias where codigo = 'CUOTA_APTOS'), 'Cuota Aptos no existe (decisión del usuario)');

-- Administrador de la clínica A: asistente de arranque.
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar($q$select fn_fin_activar((now() at time zone 'America/Bogota')::date + 1, '[{"nombre":"Caja","tipo":"efectivo"}]')$q$, 'futura');
select t.debe_fallar($q$select fn_fin_activar('2026-01-01', '[]')$q$, 'al menos una cuenta');
select t.debe_fallar($q$select fn_fin_activar('2026-01-01', '[{"nombre":"Tarjeta","tipo":"tarjeta_socio","socio_indice":3}]')$q$, 'socio que no existe');
select t.ok(not exists (select 1 from fin_config), 'un error deja todo como estaba (una transacción)');
select fn_fin_activar('2026-01-01',
  '[{"nombre":"Efectivo COP","tipo":"efectivo","saldo_inicial":500000},
    {"nombre":"Bancolombia","tipo":"banco","saldo_inicial":12000000},
    {"nombre":"Dólares","tipo":"efectivo","moneda":"USD","saldo_inicial":200},
    {"nombre":"Tarjeta de Ana","tipo":"tarjeta_socio","socio_indice":0,"saldo_inicial":-350000}]',
  '[{"nombre":"Ana Socia","numero_identificacion":"52123456","porcentaje_participacion":60},
    {"nombre":"Luis Socio","numero_identificacion":"79123456","porcentaje_participacion":40}]');
select t.ok(count(*) = 4 and count(*) filter (where es_disponible) = 3, 'cuatro cuentas; la tarjeta del socio no es dinero disponible') from fin_cuentas;
select t.ok(puc_codigo_defecto = '2355' and socio_id = (select id from fin_socios where nombre = 'Ana Socia'), 'la tarjeta queda del socio y con su cuenta PUC (2355)') from fin_cuentas where tipo = 'tarjeta_socio';
select t.ok(created_by = auth.uid(), 'autoría forzada') from fin_config;
select t.debe_fallar($q$select fn_fin_activar('2026-01-01', '[{"nombre":"Otra","tipo":"efectivo"}]')$q$, 'ya está activado');

-- Reglas de cuentas.
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo, moneda) values (clinica_actual(), 'Banco en dólares', 'banco', 'USD')$q$, 'fin_cuenta_moneda');
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo) values (clinica_actual(), 'Tarjeta sin socio', 'tarjeta_socio')$q$, 'fin_cuenta_socio');
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo, saldo_inicial) values (clinica_actual(), 'Caja negativa', 'efectivo', -1)$q$, 'fin_cuenta_saldo_signo');
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo) values (clinica_actual(), 'bancolombia ', 'banco')$q$, 'fin_cuentas_nombre_unico');
select t.debe_fallar($q$update fin_cuentas set moneda = 'EUR' where nombre = 'Dólares'$q$, 'no cambia de tipo');
delete from fin_cuentas where nombre = 'Dólares';
select t.ok(count(*) = 1, 'por la API una cuenta no se borra') from fin_cuentas where nombre = 'Dólares';
update fin_cuentas set activa = false, saldo_inicial = 250 where nombre = 'Dólares';
select t.ok(not activa and saldo_inicial = 250, 'se desactiva y se corrige el saldo inicial') from fin_cuentas where nombre = 'Dólares';
select t.debe_fallar(format($q$insert into fin_cuentas (clinica_id, nombre, tipo, sede_id) values (clinica_actual(), 'Caja ajena', 'efectivo', %L)$q$, :'sede_b'), 'sede no pertenece');

-- Socios.
select t.debe_fallar($q$insert into fin_socios (clinica_id, numero_identificacion, nombre, porcentaje_participacion) values (clinica_actual(), '1000', 'Tercer Socio', 10)$q$, '100');
update fin_socios set empleado_id = '00000000-0000-0000-0000-0000000f1e01' where nombre = 'Ana Socia';
select t.ok(empleado_id is not null, 'la socia queda enlazada a su ficha de empleada') from fin_socios where nombre = 'Ana Socia';
select t.debe_fallar($q$update fin_socios set numero_identificacion = '79123456' where nombre = 'Ana Socia'$q$, 'fin_socios_clinica_id_numero_identificacion_key');

-- Categorías de la clínica.
insert into fin_categorias_clinica (clinica_id, categoria_codigo, nombre) values (clinica_actual(), 'GASOLINA', 'Combustible');
insert into fin_categorias_clinica (clinica_id, nombre, tipo, actividad) values (clinica_actual(), 'Papelería', 'egreso', 'operacion');
select t.ok(nombre = 'Combustible' and nombre_original = 'Gasolina' and actividad = 'operacion', 'renombrar una global conserva su actividad') from v_fin_categorias where codigo = 'GASOLINA';
select t.ok(propia and puc_codigo_defecto is null and comportamiento = 'gasto', 'la propia queda sin cuenta PUC hasta el contador') from v_fin_categorias where nombre = 'Papelería';
select t.ok(count(*) = 26, 'la clínica ve 25 globales + 1 propia') from v_fin_categorias;
select t.debe_fallar($q$insert into fin_categorias_clinica (clinica_id, categoria_codigo, activa) values (clinica_actual(), 'COMISION_PASARELA', false)$q$, 'automáticas');
select t.debe_fallar($q$update fin_categorias_clinica set actividad = 'inversion' where nombre = 'Papelería'$q$, 'no cambia de tipo');
select t.debe_fallar($q$insert into fin_categorias_clinica (clinica_id, nombre, tipo) values (clinica_actual(), 'Incompleta', 'egreso')$q$, 'fin_categoria_propia_completa');
select t.debe_fallar($q$insert into fin_categorias (codigo, nombre, tipo, actividad, comportamiento, icono, ayuda, orden) values ('HACK', 'x', 'egreso', 'operacion', 'gasto', 'x', 'x', 1)$q$, 'row-level');
reset role;

select t.debe_fallar($q$delete from fin_cuentas where nombre = 'Dólares'$q$, 'desactívala');
select t.debe_fallar($q$delete from fin_socios$q$, 'desactívalo');
select t.debe_fallar($q$delete from fin_config$q$, 'no se borra');

-- Plan Gratis: sin socios, pasarela ni tarjeta de socio; sí cuentas simples.
update clinicas set plan_id = (select id from planes where codigo = 'gratis') where id = :'b';
select fn_sync_clinica_modulos(:'b');
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve la configuración, cuentas ni socios ajenos')
  from (select id from fin_config union all select id from fin_cuentas union all select id from fin_socios union all select id from fin_categorias_clinica) x;
select t.ok(count(*) = 25, 'ni sus categorías propias') from v_fin_categorias;
select t.debe_fallar($q$select fn_fin_activar('2026-06-01', '[{"nombre":"Tarjeta","tipo":"tarjeta_socio","socio_indice":0}]', '[{"nombre":"Socio Gratis","numero_identificacion":"123456"}]')$q$, 'row-level');
select fn_fin_activar('2026-06-01', '[{"nombre":"Caja","tipo":"efectivo"},{"nombre":"Nequi","tipo":"nequi","saldo_inicial":80000}]');
select t.ok(count(*) = 2, 'en Gratis se activa con cuentas simples') from fin_cuentas;
select t.debe_fallar($q$insert into fin_cuentas (clinica_id, nombre, tipo) values (clinica_actual(), 'Bold', 'pasarela')$q$, 'plan Pro');
update fin_cuentas set saldo_inicial = 1 where clinica_id <> clinica_actual();
reset role;
select t.ok(saldo_inicial = 12000000, 'el intento ajeno de editar no cambia nada') from fin_cuentas where nombre = 'Bancolombia';
update clinicas set plan_id = (select id from planes where codigo = 'pro') where id = :'b';
select fn_sync_clinica_modulos(:'b');

-- Sin permiso de finanzas.
select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'sin permiso de finanzas no ve cuentas') from fin_cuentas;
select t.debe_fallar($q$select fn_fin_activar('2026-01-01', '[{"nombre":"x","tipo":"efectivo"}]')$q$, 'permiso');
reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from fin_cuentas;
  exception when insufficient_privilege then n := 0;
  end;
  if n > 0 then raise exception 'FALLA: anon ve % cuentas', n; end if;
  raise notice 'OK anon no ve cuentas';
end $$;
reset role;
