-- ============================================================
-- 0096 · Flujo de caja FC5 · Socios: reembolsos, préstamos y devoluciones
-- ============================================================
-- Diseño: docs/finanzas/etapa1-flujo-de-caja.md (HU-2, HU-8, HU-9, N3, N4).
--   1. fn_fin_socios_saldos: por socio, lo que la clínica le debe (gastos
--      con su tarjeta + préstamos que él hizo) y lo que él le debe
--      (préstamos a socio). Sin intereses (decisión de la clínica).
--   2. fn_fin_reembolsar_socio: transferencia de una cuenta disponible a la
--      tarjeta del socio; puede ser parcial y nunca de más (N4).
--   3. fn_fin_devolucion_prestamo: el socio devuelve lo que se le prestó
--      (entra plata) o la clínica le devuelve lo que él prestó (sale
--      plata); nunca más de lo pendiente. No es ingreso ni gasto.
--   4. Reembolsos y devoluciones se anulan como un movimiento manual.

alter table fin_movimientos drop constraint fin_movimientos_origen_check;
alter table fin_movimientos add constraint fin_movimientos_origen_check
  check (origen in ('manual', 'anulacion', 'tratamiento', 'bold_liquidacion', 'reembolso_socio', 'devolucion_socio', 'cierre'));

-- ============================================================
-- 1. Saldos por socio (invoker: respeta RLS)
-- ============================================================
create or replace function fn_fin_socios_saldos()
returns table (
  socio_id uuid, deuda_tarjeta numeric, prestado_por_socio numeric, prestado_a_socio numeric, aportes numeric,
  le_debemos numeric, nos_debe numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with saldos as (select cuenta_id, saldo from fn_fin_saldos()),
  tarjetas as (
    select c.socio_id, sum(greatest(-s.saldo, 0)) as deuda
    from fin_cuentas c join saldos s on s.cuenta_id = c.id
    where c.tipo = 'tarjeta_socio'
    group by c.socio_id
  ),
  -- Los movimientos y sus anulaciones (inversas) se compensan solos.
  prestamos as (
    select m.socio_id,
      sum(case when m.categoria_codigo = 'PRESTAMO_DE_SOCIO' then case m.tipo when 'ingreso' then m.valor_cop else -m.valor_cop end else 0 end) as de_socio,
      sum(case when m.categoria_codigo = 'PRESTAMO_A_SOCIO' then case m.tipo when 'egreso' then m.valor_cop else -m.valor_cop end else 0 end) as a_socio,
      sum(case when m.categoria_codigo = 'APORTE_SOCIO' then case m.tipo when 'ingreso' then m.valor_cop else -m.valor_cop end else 0 end) as aportes
    from fin_movimientos m
    where m.socio_id is not null and m.categoria_codigo in ('PRESTAMO_DE_SOCIO', 'PRESTAMO_A_SOCIO', 'APORTE_SOCIO')
    group by m.socio_id
  )
  select s.id,
    coalesce(t.deuda, 0), coalesce(p.de_socio, 0), coalesce(p.a_socio, 0), coalesce(p.aportes, 0),
    coalesce(t.deuda, 0) + coalesce(p.de_socio, 0), coalesce(p.a_socio, 0)
  from fin_socios s
  left join tarjetas t on t.socio_id = s.id
  left join prestamos p on p.socio_id = s.id;
$$;

-- ============================================================
-- 2. Reembolsar la tarjeta del socio (N4)
-- ============================================================
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
  -- Bloquea la tarjeta: dos reembolsos a la vez no superan la deuda.
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
  select -saldo into v_deuda from fn_fin_saldos() where cuenta_id = p_tarjeta;
  if round(p_monto, 2) > coalesce(v_deuda, 0) then
    raise exception 'No se reembolsa de más: hoy se le deben %.', '$' || replace(to_char(greatest(coalesce(v_deuda, 0), 0), 'FM999,999,999,990'), ',', '.');
  end if;

  insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, cuenta_destino_id, socio_id, moneda,
    monto_original, monto_destino, descripcion, origen, created_by)
  values (v_clinica, p_fecha, 'transferencia', 'REEMBOLSO_SOCIO', p_cuenta, p_tarjeta, v_tarjeta.socio_id, v_origen.moneda,
    round(p_monto, 2), round(p_monto, 2), nullif(left(btrim(coalesce(p_descripcion, '')), 500), ''), 'reembolso_socio', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 3. Devolución de un préstamo
-- ============================================================
-- p_sentido: 'socio_devuelve' (entra plata: el socio paga lo que se le
-- prestó) o 'clinica_devuelve' (sale plata: la clínica paga lo que el socio
-- le prestó).
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
  select case when p_sentido = 'socio_devuelve' then s.prestado_a_socio else s.prestado_por_socio end
    into v_pendiente from fn_fin_socios_saldos() s where s.socio_id = p_socio;
  if round(p_monto, 2) > coalesce(v_pendiente, 0) then
    raise exception 'No se devuelve de más: el préstamo pendiente es de %.', '$' || replace(to_char(greatest(coalesce(v_pendiente, 0), 0), 'FM999,999,999,990'), ',', '.');
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

-- ============================================================
-- 4. Anular reembolsos y devoluciones como un movimiento manual
-- ============================================================
create or replace function fn_fin_anular_movimiento(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov fin_movimientos%rowtype;
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
  return fn_fin_anular_registro(v_mov, p_motivo);
end;
$$;

revoke execute on function fn_fin_socios_saldos() from public, anon;
grant execute on function fn_fin_socios_saldos() to authenticated;
revoke execute on function fn_fin_reembolsar_socio(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function fn_fin_reembolsar_socio(uuid, uuid, date, numeric, text) to authenticated;
revoke execute on function fn_fin_devolucion_prestamo(uuid, text, uuid, date, numeric, text) from public, anon;
grant execute on function fn_fin_devolucion_prestamo(uuid, text, uuid, date, numeric, text) to authenticated;
