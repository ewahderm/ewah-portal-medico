-- ============================================================
-- 0102 · Flujo de caja · Confirmar el pago de la pasarela
-- ============================================================
-- Una pasarela (Bold, Wompi, PayU…) avisa si el cobro se realizó. Con un
-- link de pago, por ejemplo, el tratamiento se registra antes de que el
-- paciente pague, y el pago puede no llegar a darse.
--   1. fin_medios_pago.requiere_confirmacion: el medio de pago espera la
--      confirmación de la pasarela antes de entrar al flujo. Solo con una
--      cuenta de tipo pasarela. Por defecto falso: nada cambia para quien
--      no lo active.
--   2. fn_fin_tratamientos_situacion: esos tratamientos quedan
--      'por_confirmar' (no 'por_generar'), así que "Poner al día" y el
--      ingreso automático no los registran.
--   3. fn_fin_confirmar_pago: confirma el pago con su fecha; el ingreso
--      entra a la pasarela, pendiente de abono. Si no se pagó, se usa la
--      exclusión del flujo (0101), que es reversible.

-- ============================================================
-- 1. El medio de pago pide confirmación
-- ============================================================
alter table fin_medios_pago add column requiere_confirmacion boolean not null default false;
alter table fin_medios_pago add constraint fin_medio_confirmacion
  check (not requiere_confirmacion or (cuenta_id is not null and not es_credito));

create or replace function fn_fin_medio_pago_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cuenta fin_cuentas%rowtype;
begin
  if tg_op = 'UPDATE' and (new.clinica_id <> old.clinica_id or new.medio_pago_id <> old.medio_pago_id) then
    raise exception 'La configuración no cambia de medio de pago.';
  end if;
  if new.cuenta_id is not null and (tg_op = 'INSERT' or new.cuenta_id is distinct from old.cuenta_id) then
    select * into v_cuenta from fin_cuentas where id = new.cuenta_id and clinica_id = new.clinica_id;
    if not found then
      raise exception 'La cuenta no pertenece a esta clínica.';
    end if;
    if not v_cuenta.activa then
      raise exception 'La cuenta "%" está inactiva.', v_cuenta.nombre;
    end if;
    if v_cuenta.moneda <> 'COP' then
      raise exception 'Los tratamientos se cobran en pesos: elige una cuenta en COP.';
    end if;
    if v_cuenta.tipo = 'tarjeta_socio' then
      raise exception 'A la tarjeta de un socio no llegan cobros.';
    end if;
  end if;
  if new.requiere_confirmacion then
    select * into v_cuenta from fin_cuentas where id = new.cuenta_id and clinica_id = new.clinica_id;
    if not found or v_cuenta.tipo <> 'pasarela' then
      raise exception 'La confirmación del pago solo aplica a una cuenta de pasarela.';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. Situación: 'por_confirmar'
-- ============================================================
create or replace function fn_fin_tratamientos_situacion(p_clinica uuid, p_tratamiento uuid default null)
returns table (tratamiento_id uuid, situacion text, movimiento_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (select fecha_inicio from fin_config where clinica_id = p_clinica),
  vivos as (
    select m.origen_id, m.id, m.liquidacion_id from fin_movimientos m
    where m.clinica_id = p_clinica and m.origen = 'tratamiento' and m.estado <> 'anulado'
      and (p_tratamiento is null or m.origen_id = p_tratamiento)
  ),
  corregidos as (
    select distinct c.corrige_a as id from tratamientos c
    where c.clinica_id = p_clinica and c.corrige_a is not null and not c.anulado
  )
  select t.id,
    case
      when t.anulado and v.liquidacion_id is not null then 'anulado_liquidado'
      when t.anulado then 'anulado_con_ingreso'
      when v.id is not null then 'corregido_sin_anular'
      when t.costo is null or t.costo < 0 then 'sin_valor'
      when t.fecha > (now() at time zone 'America/Bogota')::date then 'fecha_futura'
      when mp.es_credito then 'por_cobrar'
      when c.id is null or not c.activa then 'medio_sin_cuenta'
      when mp.requiere_confirmacion and c.tipo = 'pasarela' then 'por_confirmar'
      else 'por_generar'
    end,
    v.id
  from tratamientos t
  cross join cfg
  left join vivos v on v.origen_id = t.id
  left join fin_medios_pago mp on mp.medio_pago_id = t.medio_pago_id
  left join fin_cuentas c on c.id = mp.cuenta_id
  where t.clinica_id = p_clinica
    and (p_tratamiento is null or t.id = p_tratamiento)
    and not exists (
      select 1 from fin_tratamientos_excluidos x where x.tratamiento_id = t.id and x.activa
    )
    and (
      (t.anulado and v.id is not null)
      or (not t.anulado and v.id is null and t.fecha >= cfg.fecha_inicio and coalesce(t.costo, -1) <> 0)
      or (not t.anulado and v.id is not null and t.id in (select id from corregidos))
    );
$$;

revoke execute on function fn_fin_tratamientos_situacion(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- 3. Confirmar el pago
-- ============================================================
-- p_fecha: el día en que la pasarela cobró (no antes del tratamiento ni
-- del inicio del flujo de caja, ni en el futuro).
create or replace function fn_fin_confirmar_pago(p_tratamiento uuid, p_fecha date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_t tratamientos%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_inicio date;
  v_tipo text;
  v_fecha date;
  v_id uuid;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para confirmar pagos.';
  end if;
  if p_tratamiento is null or p_fecha is null then
    raise exception 'Faltan datos de la confirmación.';
  end if;
  select * into v_t from tratamientos where id = p_tratamiento and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El tratamiento no existe.';
  end if;
  select fecha_inicio into v_inicio from fin_config where clinica_id = v_clinica;
  if v_inicio is null then
    raise exception 'Primero activa el flujo de caja.';
  end if;
  if not exists (
    select 1 from fn_fin_tratamientos_situacion(v_clinica, p_tratamiento) s where s.situacion = 'por_confirmar'
  ) then
    raise exception 'Este tratamiento no está esperando la confirmación de una pasarela.';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha del pago no puede ser futura.';
  end if;
  if p_fecha < v_t.fecha then
    raise exception 'El pago no puede ser anterior al tratamiento.';
  end if;
  if p_fecha < v_inicio then
    raise exception 'La fecha es anterior al inicio del flujo de caja.';
  end if;
  select c.* into v_cuenta
  from fin_medios_pago mp join fin_cuentas c on c.id = mp.cuenta_id
  where mp.medio_pago_id = v_t.medio_pago_id;
  select nombre into v_tipo from tipos_tratamiento where id = v_t.tipo_tratamiento_id;
  v_fecha := fn_fin_fecha_abierta(v_clinica, p_fecha);

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, medio_pago_id, created_by)
  values (
    v_clinica, v_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', v_t.costo,
    left(coalesce(v_tipo, 'Tratamiento') || case when v_fecha <> p_fecha then ' (pago del ' || to_char(p_fecha, 'DD/MM/YYYY') || ', mes cerrado)' else '' end, 500),
    'pendiente_abono',
    fn_fin_fecha_abono(v_clinica, v_t.medio_pago_id, v_cuenta.id, v_fecha),
    'tratamiento', v_t.id, v_t.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function fn_fin_confirmar_pago(uuid, date) from public, anon;
grant execute on function fn_fin_confirmar_pago(uuid, date) to authenticated;
