-- Pruebas de Flujo de caja FC6 (0098): informe por actividades, cierre
-- mensual con arqueo, reapertura, alertas y lista cerrada de funciones.
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select fecha_inicio as inicio from fin_config \gset
select id as efectivo from fin_cuentas where nombre = 'Efectivo COP' \gset
select id as banco from fin_cuentas where nombre = 'Bancolombia' \gset
select id as tarjeta from fin_cuentas where tipo = 'tarjeta_socio' \gset

-- Informe: cuadra con la variación de las cuentas disponibles.
select t.ok(
  (select sum(entradas - salidas) from fn_fin_flujo(:'inicio', :'hoy'))
  = (select sum(s1.saldo - s0.saldo) from fin_cuentas c
       join fn_fin_saldos(:'hoy') s1 on s1.cuenta_id = c.id join fn_fin_saldos(:'inicio'::date - 1) s0 on s0.cuenta_id = c.id
     where c.es_disponible and c.moneda = 'COP')
    + (select coalesce(sum(case m.tipo when 'ingreso' then m.valor_cop else -m.valor_cop end), 0)
       from fin_movimientos m join fin_cuentas c on c.id = m.cuenta_id
       where c.es_disponible and c.moneda <> 'COP' and m.tipo in ('ingreso', 'egreso')),
  'saldo inicial + variación del informe = saldo final de las cuentas (en pesos y divisas a su valor en COP)');
select t.ok(actividad = 'operacion' and entradas > 0, 'el abono de la pasarela entra como cobro de operación') from fn_fin_flujo(:'inicio', :'hoy') where codigo = 'ABONO_PASARELA';
select t.ok(actividad = 'financiacion' and salidas > 0, 'el reembolso a la tarjeta del socio sale como financiación') from fn_fin_flujo(:'inicio', :'hoy') where codigo = 'REEMBOLSO_SOCIO';
select t.ok(actividad = 'financiacion', 'los préstamos con socios son financiación') from fn_fin_flujo(:'inicio', :'hoy') where codigo = 'PRESTAMO_A_SOCIO';
select t.ok(not exists (select 1 from fn_fin_flujo(:'inicio', :'hoy') where codigo in ('COMISION_PASARELA', 'RETENCIONES_PRACTICADAS', 'PREPAGADA') and entradas + salidas > 0
  and codigo not in (select m.categoria_codigo from fin_movimientos m join fin_cuentas c on c.id = m.cuenta_id where c.es_disponible and m.categoria_codigo is not null)),
  'lo que pasa en la pasarela o en la tarjeta del socio no es efectivo (no sale en el informe)');
select t.ok(count(*) = 0, 'una transferencia entre cuentas disponibles no aparece') from fn_fin_flujo(:'inicio', :'hoy') where codigo is null;
select t.ok((select count(*) from fn_fin_flujo(:'inicio', :'hoy', (select id from sedes where clinica_id = clinica_actual() order by orden limit 1)))
  <= (select count(*) from fn_fin_flujo(:'inicio', :'hoy')), 'el filtro de sede acota el informe');
select t.ok(count(*) = 1 and min(tasa) > 0, 'la última tasa usada del dólar') from fn_fin_tasas() where moneda = 'USD';

-- Cierre de enero con arqueo del efectivo.
select saldo as efectivo_ene from fn_fin_saldos('2026-01-31') where cuenta_id = :'efectivo' \gset
select t.debe_fallar(format($q$select fn_fin_cerrar_mes(2026, 1, '[{"cuenta_id": "%s", "contado": %s}]')$q$, :'efectivo', :'efectivo_ene'::numeric - 1000), 'Explica la diferencia');
select t.debe_fallar(format($q$select fn_fin_cerrar_mes(2026, 1, '[{"cuenta_id": "%s", "contado": 1}]')$q$, :'tarjeta'), 'plata disponible');
select t.debe_fallar('select fn_fin_cerrar_mes(2026, 2)', 'mes anterior');
select t.debe_fallar(format('select fn_fin_cerrar_mes(%s, %s)', extract(year from :'hoy'::date), extract(month from :'hoy'::date)), 'ya terminaron');
select t.debe_fallar('select fn_fin_cerrar_mes(2025, 12)', 'anterior al inicio');
select fn_fin_cerrar_mes(2026, 1, format('[{"cuenta_id": "%s", "contado": %s, "motivo": "Faltó plata en la caja menor"}]', :'efectivo', :'efectivo_ene'::numeric - 1000)::jsonb) as ene \gset
select t.ok(estado = 'cerrado' and foto ? 'saldos' and foto ? 'flujo' and jsonb_array_length(historial) = 1, 'enero queda cerrado con su foto') from fin_periodos where id = :'ene';
select t.ok(a.diferencia = -1000 and m.tipo = 'egreso' and m.categoria_codigo = 'AJUSTE_CAJA' and m.fecha = '2026-01-31' and m.origen = 'cierre',
  'el faltante del arqueo queda registrado el último día del mes') from fin_arqueos a join fin_movimientos m on m.id = a.movimiento_id where a.periodo_id = :'ene';
select t.ok(saldo = :'efectivo_ene'::numeric - 1000, 'y el efectivo cuadra con lo contado') from fn_fin_saldos('2026-01-31') where cuenta_id = :'efectivo';
select t.debe_fallar(format($q$insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original) values (clinica_actual(), '2026-01-20', 'egreso', 'GASOLINA', %L, 'COP', 1)$q$, :'banco'), 'está cerrado');
select t.debe_fallar('select fn_fin_cerrar_mes(2026, 1)', 'ya está cerrado');
select t.debe_fallar($q$update fin_config set fecha_inicio = '2026-01-01', motivo_cambio = 'Mover el inicio con meses cerrados'$q$, 'meses cerrados');
-- Un tratamiento con fecha en el mes cerrado se guarda y queda pendiente.
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(), '00000000-0000-0000-0000-000000000341',
  '2026-01-25', 45000, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), '00000000-0000-0000-0000-000000000311', auth.uid())
returning id as t_cerrado \gset
select t.ok(fecha = '2026-02-01' and descripcion like '%(tratamiento del 25/01/2026, mes cerrado)',
  'un tratamiento del mes cerrado genera su ingreso el primer día abierto, con su fecha en la nota')
  from fin_movimientos where origen = 'tratamiento' and origen_id = :'t_cerrado' and estado <> 'anulado';

-- Febrero, reabrir en orden y volver a registrar.
select fn_fin_cerrar_mes(2026, 2);
select t.debe_fallar($q$select fn_fin_reabrir_mes(2026, 1, 'Reabrir enero con febrero cerrado')$q$, 'posteriores');
select t.debe_fallar($q$select fn_fin_reabrir_mes(2026, 2, 'corto')$q$, '10 caracteres');
select fn_fin_reabrir_mes(2026, 2, 'Faltó registrar una factura de febrero');
select t.ok(estado = 'abierto' and historial -> 1 ->> 'accion' = 'reabrir' and historial -> 1 ->> 'motivo' like 'Faltó%', 'febrero reabierto con motivo')
  from fin_periodos where anio = 2026 and mes = 2;
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original)
values (clinica_actual(), '2026-02-20', 'egreso', 'CONTABILIDAD', :'banco', 'COP', 350000);
select fn_fin_cerrar_mes(2026, 2);
select t.ok(jsonb_array_length(historial) = 3, 'cerrar, reabrir y cerrar quedan en el historial') from fin_periodos where anio = 2026 and mes = 2;
reset role;

-- Sin APPROVE (contador) o sin plan Pro no se cierra.
select t.como('00000000-0000-0000-0000-0000000f3c01'); set role authenticated;
select t.debe_fallar('select fn_fin_cerrar_mes(2026, 3)', 'permiso');
select t.debe_fallar($q$select fn_fin_reabrir_mes(2026, 2, 'Reabrir sin permiso para hacerlo')$q$, 'permiso');
select t.ok(count(*) = 2, 'pero ve los meses cerrados') from fin_periodos;
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'gratis') where nombre = 'Clinica A';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.debe_fallar('select fn_fin_cerrar_mes(2026, 3)', 'plan Pro');
reset role;
update clinicas set plan_id = (select id from planes where codigo = 'pro') where nombre = 'Clinica A';
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve los cierres ajenos') from fin_periodos;
select t.ok(count(*) = 0, 'ni el informe ajeno') from fn_fin_flujo('2026-01-01', :'hoy') where entradas + salidas > 0 and codigo = 'ABONO_PASARELA';
reset role;

-- Alertas (cron).
select id as a from clinicas where nombre = 'Clinica A' \gset
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original)
values (clinica_actual(), '2026-03-02', 'egreso', 'SOFTWARE_WEB', :'tarjeta', 'COP', 99000);
select t.debe_fallar(format($q$select * from fn_fin_alertas_pendientes(%L)$q$, :'a'), 'permission denied');
reset role;
select t.ok(exists (select 1 from fn_fin_clinicas_alertas() where clinica_id = :'a'), 'la clínica A (Pro y activada) recibe alertas');
-- Los reembolsos pagan lo más antiguo: la deuda que queda es la de los gastos más recientes.
select t.ok(count(*) filter (where objeto_tipo = 'fin_deuda_socio') = 0, 'una deuda reciente no se avisa')
  from fn_fin_alertas_pendientes(:'a', :'hoy');
select t.ok(count(*) filter (where objeto_tipo = 'fin_deuda_socio') = 1, 'deuda con el socio de más de 30 días')
  from fn_fin_alertas_pendientes(:'a', :'hoy'::date + 40);
select t.ok(count(*) filter (where objeto_tipo = 'fin_bold_vencido') >= 1, 'cobro de Bold sin abonar 2 días hábiles después')
  from fn_fin_alertas_pendientes(:'a', :'hoy'::date + 30);
select t.ok(count(*) filter (where objeto_tipo = 'fin_mes_sin_cerrar') = 1, 'mes anterior sin cerrar al día 10')
  from fn_fin_alertas_pendientes(:'a', (date_trunc('month', :'hoy'::date) + interval '11 days')::date);
select t.ok(count(*) filter (where objeto_tipo = 'fin_mes_sin_cerrar') = 0, 'antes del día 10 no se avisa')
  from fn_fin_alertas_pendientes(:'a', (date_trunc('month', :'hoy'::date) + interval '5 days')::date);
select t.ok(count(*) filter (where objeto_tipo = 'fin_por_revisar') = 1, 'ingresos por revisar') from fn_fin_alertas_pendientes(:'a', :'hoy');
insert into fin_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias)
select :'a', objeto_tipo, objeto_id, 0 from fn_fin_alertas_pendientes(:'a', :'hoy'::date + 40);
select t.ok(count(*) = 0, 'lo avisado no se repite') from fn_fin_alertas_pendientes(:'a', :'hoy'::date + 40);
select t.ok(count(*) filter (where u.email = 'contador@x.co') = 0 and count(*) filter (where u.email = 'a@x.co') = 1,
  'avisa al administrador; no al contador sin APPROVE') from fn_fin_destinatarios(:'a') d join usuarios u on u.id = d.usuario_id;

-- Endurecimiento: lista cerrada de funciones del flujo de caja que corren
-- con privilegios del dueño (security definer) y RLS en todas las tablas.
select t.ok(array_agg(p.proname::text order by p.proname) = array[
    'fn_fin_alertas_pendientes', 'fn_fin_anular_liquidacion', 'fn_fin_anular_movimiento', 'fn_fin_anular_pago', 'fn_fin_anular_registro', 'fn_fin_candidatos_pago',
    'fn_fin_cerrar_mes', 'fn_fin_clinicas_alertas', 'fn_fin_conciliar_pagos', 'fn_fin_confirmar_pago', 'fn_fin_destinatarios', 'fn_fin_devolucion_prestamo', 'fn_fin_excluir_tratamiento', 'fn_fin_fecha_abierta', 'fn_fin_generar_ingresos', 'fn_fin_importar_pagos',
    'fn_fin_ingreso_de_tratamiento', 'fn_fin_ingresos_pendientes', 'fn_fin_liquidacion_cobro_trasladado', 'fn_fin_liquidar_pasarela',
    'fn_fin_mes_abierto', 'fn_fin_reabrir_mes', 'fn_fin_reembolsar_socio', 'fn_fin_registrar_cobro', 'fn_fin_reincluir_tratamiento', 'fn_fin_resolver_cambio_pago',
    'fn_fin_tratamiento_sincronizar', 'fn_fin_tratamientos_flujo', 'fn_fin_tratamientos_situacion', 'fn_fin_vincular_pago']::text[],
  'lista cerrada de funciones privilegiadas: ' || array_to_string(array_agg(p.proname::text order by p.proname), ', '))
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fn_fin_%' and p.prosecdef;
select t.ok(bool_and(c.relrowsecurity), 'todas las tablas del flujo de caja tienen RLS')
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'fin_%';
select t.ok(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fn_fin_%' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')), 'ninguna función privilegiada la puede ejecutar anon');

-- ============================================================
-- Ajustes (0100)
-- ============================================================
-- Otra clínica personaliza una categoría: el informe de esta no cambia
-- aunque se calcule sin RLS (como en la foto del cierre).
insert into fin_categorias_clinica (clinica_id, categoria_codigo, nombre)
select id, 'ARRENDAMIENTO', 'Arriendo del local' from clinicas where nombre = 'Clinica B';
select t.como('00000000-0000-0000-0000-00000000000a');
create temp table flujo_sin_rls as select * from fn_fin_flujo(:'inicio', :'hoy');
grant select on flujo_sin_rls to authenticated;
set role authenticated;
select t.ok((select count(*) from flujo_sin_rls) = (select count(*) from fn_fin_flujo(:'inicio', :'hoy'))
  and not exists (select codigo, entradas, salidas from flujo_sin_rls except select codigo, entradas, salidas from fn_fin_flujo(:'inicio', :'hoy')),
  'el informe sin RLS (foto del cierre) es igual al de la pantalla aunque otra clínica personalice categorías');
-- Con una sede, el abono de la pasarela se reparte según la sede de sus cobros.
select id as sede1 from sedes where clinica_id = clinica_actual() order by orden limit 1 \gset
select t.ok((select entradas - salidas from fn_fin_flujo(:'inicio', :'hoy', :'sede1') where codigo = 'ABONO_PASARELA')
  = (select entradas - salidas from fn_fin_flujo(:'inicio', :'hoy') where codigo = 'ABONO_PASARELA'),
  'los cobros de la sede traen su abono de la pasarela');
select t.ok(count(*) = 0, 'otra sede no recibe abonos ajenos') from fn_fin_flujo(:'inicio', :'hoy', gen_random_uuid()) where codigo = 'ABONO_PASARELA';
-- Serie mensual en una consulta.
select t.ok((select entradas - salidas from fn_fin_flujo_meses(:'inicio', :'hoy') where mes = to_char(:'hoy'::date, 'YYYY-MM'))
  = (select sum(entradas - salidas) from fn_fin_flujo(date_trunc('month', :'hoy'::date)::date, :'hoy')), 'la serie mensual cuadra con el informe del mes');
-- Reabrir enero anula el ajuste de su arqueo; al cerrar de nuevo se rehace.
select fn_fin_reabrir_mes(2026, 2, 'Reabrir febrero para llegar a enero');
select fn_fin_reabrir_mes(2026, 1, 'El conteo del efectivo estaba mal');
select t.ok(m.estado = 'anulado' and a.reemplazado, 'reabrir anula el ajuste del arqueo y lo marca reemplazado')
  from fin_arqueos a join fin_movimientos m on m.id = a.movimiento_id join fin_periodos p on p.id = a.periodo_id where p.anio = 2026 and p.mes = 1;
select t.ok(saldo = :'efectivo_ene'::numeric, 'el efectivo de enero vuelve a lo del sistema') from fn_fin_saldos('2026-01-31') where cuenta_id = :'efectivo';
select fn_fin_cerrar_mes(2026, 1);
select fn_fin_cerrar_mes(2026, 2);
select t.ok(count(*) = 2, 'enero y febrero cerrados de nuevo') from fin_periodos where estado = 'cerrado';
reset role;
