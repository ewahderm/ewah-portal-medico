-- Pruebas de Flujo de caja 0102: el medio de pago que espera la confirmación
-- de la pasarela, confirmar el pago y "no se pagó".
\set ON_ERROR_STOP 1
select (now() at time zone 'America/Bogota')::date as hoy \gset
create function pg_temp.trat(p_fecha date, p_costo numeric, p_medio uuid) returns uuid language sql as $$
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
  values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(),
    '00000000-0000-0000-0000-000000000341', p_fecha, p_costo, (select id from sedes where clinica_id = clinica_actual() order by orden limit 1), p_medio, auth.uid())
  returning id $$;
create function pg_temp.vivo(p_trat uuid) returns setof fin_movimientos language sql as $$
  select * from fin_movimientos where origen = 'tratamiento' and origen_id = p_trat and estado <> 'anulado' $$;
\set efectivo_mp '00000000-0000-0000-0000-000000000311'
\set bold_mp '00000000-0000-0000-0000-0000000f3001'
\set bold '00000000-0000-0000-0000-0000000f3101'

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- Solo una cuenta de pasarela puede esperar confirmación.
select t.debe_fallar(format($q$update fin_medios_pago set requiere_confirmacion = true where medio_pago_id = %L$q$, :'efectivo_mp'), 'solo aplica a una cuenta de pasarela');

-- Sin confirmación (por defecto), el cobro con pasarela entra solo.
select pg_temp.trat(:'hoy', 100000, :'bold_mp') as t0 \gset
select t.ok(estado = 'pendiente_abono', 'por defecto el cobro con pasarela entra pendiente de abono') from pg_temp.vivo(:'t0');

-- Con confirmación: queda por confirmar y no entra.
update fin_medios_pago set requiere_confirmacion = true where medio_pago_id = :'bold_mp';
select pg_temp.trat(:'hoy', 250000, :'bold_mp') as t1 \gset
select t.ok(not exists (select 1 from pg_temp.vivo(:'t1')), 'esperando confirmación no genera ingreso');
select t.ok(situacion = 'por_confirmar' and valor = 250000, 'queda por confirmar') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t1';
select t.ok((fn_fin_generar_ingresos() ->> 'generados')::int = 0 and not exists (select 1 from pg_temp.vivo(:'t1')), 'poner al día no lo registra');

-- Confirmar el pago.
select t.debe_fallar(format($q$select fn_fin_confirmar_pago(%L, %L::date + 1)$q$, :'t1', :'hoy'), 'futura');
select t.debe_fallar(format($q$select fn_fin_confirmar_pago(%L, %L::date - 1)$q$, :'t1', :'hoy'), 'anterior al tratamiento');
select t.debe_fallar(format($q$select fn_fin_confirmar_pago(%L, %L)$q$, :'t0', :'hoy'), 'no está esperando');
select fn_fin_confirmar_pago(:'t1', :'hoy') as mov \gset
select t.ok(cuenta_id = :'bold' and estado = 'pendiente_abono' and monto_original = 250000 and fecha = :'hoy' and fecha_esperada > fecha
  and origen = 'tratamiento' and origen_id = :'t1' and medio_pago_id = :'bold_mp', 'confirmar el pago lo registra en la pasarela, pendiente de abono')
  from fin_movimientos where id = :'mov';
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where tratamiento_id = :'t1'), 'y deja de estar pendiente');
select t.debe_fallar(format($q$select fn_fin_confirmar_pago(%L, %L)$q$, :'t1', :'hoy'), 'no está esperando');
select t.ok(exists (select 1 from fn_fin_pendientes_pasarela() where movimiento_id = :'mov'), 'aparece en los pendientes de abono de la pasarela');

-- No se pagó: se excluye y puede reincluirse.
select pg_temp.trat(:'hoy', 180000, :'bold_mp') as t2 \gset
select fn_fin_excluir_tratamiento(:'t2', 'La pasarela no confirmó el pago');
select t.ok(not exists (select 1 from fn_fin_ingresos_pendientes() where tratamiento_id = :'t2') and not exists (select 1 from pg_temp.vivo(:'t2')),
  'si no se pagó, sale de los pendientes sin ingreso');
select fn_fin_reincluir_tratamiento(:'t2');
select t.ok(situacion = 'por_confirmar', 'reincluido vuelve a esperar la confirmación') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t2';

-- Apagar la confirmación: lo pendiente vuelve a ser generable.
update fin_medios_pago set requiere_confirmacion = false where medio_pago_id = :'bold_mp';
select t.ok(situacion = 'por_generar', 'sin confirmación, vuelve a ser listo para registrar') from fn_fin_ingresos_pendientes() where tratamiento_id = :'t2';
select fn_fin_generar_ingresos();
select t.ok(count(*) = 1, 'y se registra al poner al día') from pg_temp.vivo(:'t2');

-- Otra clínica.
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.debe_fallar(format($q$select fn_fin_confirmar_pago(%L, %L)$q$, :'t1', :'hoy'), 'no existe');
reset role;
