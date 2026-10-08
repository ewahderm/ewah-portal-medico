-- ============================================================
-- 0099 · Flujo de caja FC5 · Ajustes de la revisión
-- ============================================================
--   1. Anular no deja saldos de socios imposibles: un préstamo con
--      devoluciones no se anula antes que ellas, y un gasto con la tarjeta
--      ya reembolsado no se anula antes que el reembolso.
--   2. fn_fin_socios_saldos(fecha): saldos a una fecha, de la clínica de
--      la sesión; un saldo a favor en la tarjeta (se le reembolsó de más)
--      cuenta como lo que el socio le debe a la clínica.
--   3. Reembolsos y devoluciones con fecha atrás no superan la deuda a esa
--      fecha (ni la de hoy).
--   4. Préstamos y aportes de socios solo por cuentas con plata disponible
--      (no desde la tarjeta del socio ni la pasarela).
--   5. El cobro que pasa a un tratamiento corregido conserva su fecha
--      esperada de abono aunque ya esté liquidado.

-- 2. Saldos por socio a una fecha
drop function fn_fin_socios_saldos();
create or replace function fn_fin_socios_saldos(p_fecha date default null)
returns table (
  socio_id uuid, deuda_tarjeta numeric, tarjeta_a_favor numeric, prestado_por_socio numeric, prestado_a_socio numeric,
  aportes numeric, le_debemos numeric, nos_debe numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with corte as (select coalesce(p_fecha, (now() at time zone 'America/Bogota')::date) as d),
  saldos as (select cuenta_id, saldo from fn_fin_saldos((select d from corte))),
  tarjetas as (
    select c.socio_id, sum(greatest(-s.saldo, 0)) as deuda, sum(greatest(s.saldo, 0)) as a_favor
    from fin_cuentas c join saldos s on s.cuenta_id = c.id
    where c.clinica_id = clinica_actual() and c.tipo = 'tarjeta_socio'
    group by c.socio_id
  ),
  -- Los movimientos y sus anulaciones (inversas) se compensan solos.
  prestamos as (
    select m.socio_id,
      sum(case when m.categoria_codigo = 'PRESTAMO_DE_SOCIO' then case m.tipo when 'ingreso' then m.valor_cop else -m.valor_cop end else 0 end) as de_socio,
      sum(case when m.categoria_codigo = 'PRESTAMO_A_SOCIO' then case m.tipo when 'egreso' then m.valor_cop else -m.valor_cop end else 0 end) as a_socio,
      sum(case when m.categoria_codigo = 'APORTE_SOCIO' then case m.tipo when 'ingreso' then m.valor_cop else -m.valor_cop end else 0 end) as aportes
    from fin_movimientos m, corte
    where m.clinica_id = clinica_actual() and m.socio_id is not null and m.fecha <= corte.d
      and m.categoria_codigo in ('PRESTAMO_DE_SOCIO', 'PRESTAMO_A_SOCIO', 'APORTE_SOCIO')
    group by m.socio_id
  )
  select s.id,
    coalesce(t.deuda, 0), coalesce(t.a_favor, 0), coalesce(p.de_socio, 0), coalesce(p.a_socio, 0), coalesce(p.aportes, 0),
    coalesce(t.deuda, 0) + coalesce(p.de_socio, 0), coalesce(p.a_socio, 0) + coalesce(t.a_favor, 0)
  from fin_socios s
  left join tarjetas t on t.socio_id = s.id
  left join prestamos p on p.socio_id = s.id
  where s.clinica_id = clinica_actual();
$$;

-- 3. Reembolso: ni de más hoy ni a su fecha
create or replace function fn_fin_reembolsar_socio(p_tarjeta uuid, p_cuenta uuid, p_fecha date, p_monto numeric, p_descripcion text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_tarjeta fin_cuentas%rowtype;
  v_origen fin_cuentas%rowtype;
  v_deuda numeric;
  v_id uuid;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para registrar reembolsos.';
  end if;
  if not has_entitlement('finanzas', 'gestion') then
    raise exception 'Los socios están disponibles en el plan Pro.';
  end if;
  if p_tarjeta is null or p_cuenta is null or p_fecha is null or p_monto is null then
    raise exception 'Faltan datos del reembolso.';
  end if;
  if p_monto <= 0 then
    raise exception 'El valor del reembolso debe ser mayor que cero.';
  end if;
  select * into v_tarjeta from fin_cuentas where id = p_tarjeta and clinica_id = v_clinica and tipo = 'tarjeta_socio' for update;
  if not found then
    raise exception 'La tarjeta no pertenece a esta clínica.';
  end if;
  select * into v_origen from fin_cuentas where id = p_cuenta and clinica_id = v_clinica;
  if not found then
    raise exception 'La cuenta no pertenece a esta clínica.';
  end if;
  if not v_origen.activa or not v_origen.es_disponible or v_origen.moneda <> v_tarjeta.moneda then
    raise exception 'El reembolso sale de una cuenta activa en pesos (banco, billetera o efectivo).';
  end if;
  select least(
    (select -saldo from fn_fin_saldos() where cuenta_id = p_tarjeta),
    (select -saldo from fn_fin_saldos(p_fecha) where cuenta_id = p_tarjeta)) into v_deuda;
  if round(p_monto, 2) > coalesce(v_deuda, 0) then
    raise exception 'No se reembolsa de más: a esa fecha se le deben %.', '$' || replace(to_char(greatest(coalesce(v_deuda, 0), 0), 'FM999,999,999,990'), ',', '.');
  end if;

  insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, cuenta_destino_id, socio_id, moneda,
    monto_original, monto_destino, descripcion, origen, created_by)
  values (v_clinica, p_fecha, 'transferencia', 'REEMBOLSO_SOCIO', p_cuenta, p_tarjeta, v_tarjeta.socio_id, v_origen.moneda,
    round(p_monto, 2), round(p_monto, 2), nullif(left(btrim(coalesce(p_descripcion, '')), 500), ''), 'reembolso_socio', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 3. Devolución: ni de más hoy ni a su fecha
create or replace function fn_fin_devolucion_prestamo(p_socio uuid, p_sentido text, p_cuenta uuid, p_fecha date, p_monto numeric, p_descripcion text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_socio fin_socios%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_pendiente numeric;
  v_id uuid;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para registrar devoluciones.';
  end if;
  if not has_entitlement('finanzas', 'gestion') then
    raise exception 'Los socios están disponibles en el plan Pro.';
  end if;
  if p_sentido not in ('socio_devuelve', 'clinica_devuelve') then
    raise exception 'Elige quién devuelve.';
  end if;
  if p_socio is null or p_cuenta is null or p_fecha is null or p_monto is null then
    raise exception 'Faltan datos de la devolución.';
  end if;
  if p_monto <= 0 then
    raise exception 'El valor de la devolución debe ser mayor que cero.';
  end if;
  select * into v_socio from fin_socios where id = p_socio and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El socio no pertenece a esta clínica.';
  end if;
  select * into v_cuenta from fin_cuentas where id = p_cuenta and clinica_id = v_clinica;
  if not found then
    raise exception 'La cuenta no pertenece a esta clínica.';
  end if;
  if not v_cuenta.activa or not v_cuenta.es_disponible or v_cuenta.moneda <> 'COP' then
    raise exception 'La devolución pasa por una cuenta activa en pesos (banco, billetera o efectivo).';
  end if;
  select least(
    (select case when p_sentido = 'socio_devuelve' then s.prestado_a_socio else s.prestado_por_socio end from fn_fin_socios_saldos() s where s.socio_id = p_socio),
    (select case when p_sentido = 'socio_devuelve' then s.prestado_a_socio else s.prestado_por_socio end from fn_fin_socios_saldos(p_fecha) s where s.socio_id = p_socio))
    into v_pendiente;
  if round(p_monto, 2) > coalesce(v_pendiente, 0) then
    raise exception 'No se devuelve de más: a esa fecha el préstamo pendiente es de %.', '$' || replace(to_char(greatest(coalesce(v_pendiente, 0), 0), 'FM999,999,999,990'), ',', '.');
  end if;

  insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, socio_id, moneda, monto_original,
    descripcion, origen, created_by)
  values (v_clinica, p_fecha,
    case when p_sentido = 'socio_devuelve' then 'ingreso' else 'egreso' end,
    case when p_sentido = 'socio_devuelve' then 'PRESTAMO_A_SOCIO' else 'PRESTAMO_DE_SOCIO' end,
    p_cuenta, p_socio, 'COP', round(p_monto, 2),
    coalesce(nullif(left(btrim(coalesce(p_descripcion, '')), 500), ''),
      case when p_sentido = 'socio_devuelve' then 'Devolución del préstamo al socio' else 'Devolución del préstamo del socio' end),
    'devolucion_socio', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 1. Anular sin dejar saldos imposibles
create or replace function fn_fin_anular_movimiento(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov fin_movimientos%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_pendiente numeric;
  v_saldo numeric;
begin
  if clinica_actual() is null or not has_permission('finanzas', 'VOID') then
    raise exception 'No tienes permiso para anular movimientos.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué se anula (al menos 10 caracteres).';
  end if;
  select * into v_mov from fin_movimientos where id = p_id and clinica_id = clinica_actual() for update;
  if not found then
    raise exception 'El movimiento no existe.';
  end if;
  if v_mov.estado = 'anulado' then
    raise exception 'El movimiento ya está anulado.';
  end if;
  if v_mov.origen = 'anulacion' then
    raise exception 'Una anulación no se anula: registra el movimiento de nuevo.';
  end if;
  if v_mov.origen not in ('manual', 'tratamiento', 'reembolso_socio', 'devolucion_socio') then
    raise exception 'Este movimiento lo registró el sistema: se anula desde su origen.';
  end if;
  if v_mov.liquidacion_id is not null then
    raise exception 'Este cobro ya se liquidó (su plata llegó al banco): anula primero la liquidación en Bold.';
  end if;
  -- Un préstamo con devoluciones: primero se anulan las devoluciones.
  if v_mov.socio_id is not null and v_mov.categoria_codigo in ('PRESTAMO_A_SOCIO', 'PRESTAMO_DE_SOCIO')
     and ((v_mov.categoria_codigo = 'PRESTAMO_A_SOCIO' and v_mov.tipo = 'egreso')
          or (v_mov.categoria_codigo = 'PRESTAMO_DE_SOCIO' and v_mov.tipo = 'ingreso')) then
    perform 1 from fin_socios where id = v_mov.socio_id for update;
    select case when v_mov.categoria_codigo = 'PRESTAMO_A_SOCIO' then s.prestado_a_socio else s.prestado_por_socio end
      into v_pendiente from fn_fin_socios_saldos() s where s.socio_id = v_mov.socio_id;
    if coalesce(v_pendiente, 0) - v_mov.valor_cop < 0 then
      raise exception 'Ese préstamo ya tiene devoluciones: anúlalas primero.';
    end if;
  end if;
  -- Un gasto con la tarjeta del socio ya reembolsado: primero el reembolso.
  select * into v_cuenta from fin_cuentas where id = v_mov.cuenta_id for update;
  if v_cuenta.tipo = 'tarjeta_socio' and v_mov.tipo = 'egreso' then
    select saldo into v_saldo from fn_fin_saldos() where cuenta_id = v_cuenta.id;
    if coalesce(v_saldo, 0) + v_mov.monto_original > 0 then
      raise exception 'Ese gasto ya se le reembolsó al socio: anula primero el reembolso.';
    end if;
  end if;
  return fn_fin_anular_registro(v_mov, p_motivo);
end;
$$;

-- 4. Préstamos y aportes de socios por cuentas disponibles
create or replace function fn_fin_movimiento_socio_cuenta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.categoria_codigo in (select codigo from fin_categorias where comportamiento in ('prestamo_socio', 'aporte_socio'))
     and not (select es_disponible from fin_cuentas where id = new.cuenta_id) then
    raise exception 'Los préstamos y aportes de socios pasan por una cuenta con plata disponible (banco, billetera o efectivo).';
  end if;
  return new;
end;
$$;
create trigger fin_movimientos_socio_cuenta before insert on fin_movimientos
  for each row execute function fn_fin_movimiento_socio_cuenta();

-- 5. Traslado del cobro a un tratamiento corregido
create or replace function fn_fin_tratamiento_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov fin_movimientos%rowtype;
  v_sucesor uuid;
  v_liquidada boolean;
begin
  if not exists (select 1 from fin_config where clinica_id = new.clinica_id) then
    return null;
  end if;
  begin
    if new.anulado then
      if tg_op = 'UPDATE' and not old.anulado then
        for v_mov in
          select * from fin_movimientos
          where clinica_id = new.clinica_id and origen = 'tratamiento' and origen_id = new.id and estado <> 'anulado'
          for update
        loop
          v_sucesor := null;
          v_liquidada := v_mov.liquidacion_id is not null;
          if v_mov.cobro_manual then
            select s.id into v_sucesor from tratamientos s
            where s.clinica_id = new.clinica_id and s.corrige_a = new.id and not s.anulado
              and not exists (select 1 from fin_movimientos m where m.origen = 'tratamiento' and m.origen_id = s.id and m.estado <> 'anulado')
            order by s.created_at desc limit 1;
          end if;
          -- Liquidado y sin a quién pasarlo: queda por revisar.
          continue when v_liquidada and v_sucesor is null;
          perform fn_fin_anular_registro(v_mov,
            case when v_sucesor is not null then 'Tratamiento corregido: el cobro pasa al registro corregido'
                 else 'Tratamiento anulado: ' || coalesce(nullif(btrim(new.anulado_motivo), ''), 'sin motivo') end);
          if v_sucesor is not null then
            insert into fin_movimientos (
              clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
              descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, medio_pago_id, liquidacion_id, created_by)
            values (
              v_mov.clinica_id, v_mov.fecha, 'ingreso', v_mov.categoria_codigo, v_mov.cuenta_id,
              (select sede_id from tratamientos where id = v_sucesor), 'paciente', v_mov.moneda, v_mov.monto_original,
              v_mov.descripcion,
              -- Ya liquidado: el corregido hereda el abono; si no, sigue pendiente.
              case when v_liquidada then 'registrado'
                   when (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela' then 'pendiente_abono'
                   else 'registrado' end,
              -- La fecha esperada se conserva también si ya se liquidó: si la
              -- liquidación se anula, el cobro vuelve a pendiente con ella.
              case when (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela'
                   then coalesce(v_mov.fecha_esperada, v_mov.fecha) end,
              'tratamiento', v_sucesor, true, v_mov.medio_pago_id, v_mov.liquidacion_id, auth.uid());
          end if;
        end loop;
      end if;
    elsif tg_op = 'INSERT' or old.anulado then
      perform fn_fin_ingreso_de_tratamiento(new.id);
    end if;
  exception when others then
    raise warning 'Flujo de caja: no se sincronizó el tratamiento %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;


revoke execute on function fn_fin_socios_saldos(date) from public, anon;
grant execute on function fn_fin_socios_saldos(date) to authenticated;
revoke execute on function fn_fin_movimiento_socio_cuenta() from public, anon, authenticated;
revoke execute on function fn_fin_tratamiento_sincronizar() from public, anon, authenticated;
