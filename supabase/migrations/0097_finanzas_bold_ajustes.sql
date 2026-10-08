-- ============================================================
-- 0097 · Flujo de caja FC4 · Ajustes de la revisión
-- ============================================================
--   1. Un cobro ya liquidado (su plata llegó al banco) no se anula suelto:
--      primero se anula la liquidación. Si su tratamiento se anula, el
--      ingreso queda "por revisar" (anulado_liquidado) en vez de dejar la
--      pasarela en negativo; si el tratamiento se corrige y el cobro era
--      manual, el corregido hereda el cobro ya liquidado.
--   2. La liquidación recibe el neto esperado que vio el usuario y se
--      rechaza si la tarifa cambió entretanto; bloquea las tarifas mientras
--      liquida y verifica que la cuenta sea una pasarela.
--   3. fin_liquidacion_cobros: detalle por cobro con la tarifa usada. Una
--      tarifa usada en una liquidación vigente (también como respaldo de
--      otro medio) no se edita ni se borra; una nueva no puede tener una
--      vigencia que cambie cobros ya liquidados de su medio.
--   4. Editar o borrar tarifas también exige el plan Pro.

create table fin_liquidacion_cobros (
  liquidacion_id uuid not null references fin_liquidaciones_pasarela(id),
  movimiento_id uuid not null references fin_movimientos(id),
  tarifa_id uuid references fin_tarifas_medio_pago(id),
  bruto numeric(16, 2) not null,
  comision numeric(16, 2) not null,
  retefuente numeric(16, 2) not null,
  reteica numeric(16, 2) not null,
  reteiva numeric(16, 2) not null,
  neto numeric(16, 2) not null,
  primary key (liquidacion_id, movimiento_id)
);
create index idx_fin_liq_cobros_tarifa on fin_liquidacion_cobros (tarifa_id) where tarifa_id is not null;
alter table fin_liquidacion_cobros enable row level security;
create policy "fin_liquidacion_cobros_select" on fin_liquidacion_cobros
  for select to authenticated using (exists (
    select 1 from fin_liquidaciones_pasarela l where l.id = liquidacion_id and l.clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW')));

-- Detalle de las liquidaciones ya hechas (con la tarifa que aplica hoy a su fecha).
insert into fin_liquidacion_cobros (liquidacion_id, movimiento_id, tarifa_id, bruto, comision, retefuente, reteica, reteiva, neto)
select m.liquidacion_id, m.id, t.id, m.monto_original, d.comision, d.retefuente, d.reteica, d.reteiva, d.neto
from fin_movimientos m
cross join lateral (select * from fn_fin_tarifa_de(m.clinica_id, m.medio_pago_id, m.cuenta_id, m.fecha)) t
cross join lateral fn_fin_desglose(m.monto_original, t) d
where m.liquidacion_id is not null and m.origen <> 'bold_liquidacion';

-- ============================================================
-- 3. Tarifas usadas
-- ============================================================
create or replace function fn_fin_tarifa_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from fin_liquidacion_cobros lc join fin_liquidaciones_pasarela l on l.id = lc.liquidacion_id
    where lc.tarifa_id = old.id and not l.anulada
  ) then
    raise exception 'Esta tarifa ya se usó en una liquidación: registra una nueva con otra fecha de vigencia.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.clinica_id <> old.clinica_id or new.medio_pago_id <> old.medio_pago_id) then
    raise exception 'La tarifa no cambia de medio de pago.';
  end if;
  if exists (
    select 1 from fin_movimientos m join fin_liquidaciones_pasarela l on l.id = m.liquidacion_id
    where m.medio_pago_id = new.medio_pago_id and m.fecha >= new.vigente_desde and not l.anulada and m.origen <> 'bold_liquidacion'
  ) then
    raise exception 'Ya hay cobros liquidados de este medio desde esa fecha: la tarifa nueva debe aplicar después del último.';
  end if;
  return new;
end;
$$;

drop policy "fin_tarifas_update" on fin_tarifas_medio_pago;
drop policy "fin_tarifas_delete" on fin_tarifas_medio_pago;
create policy "fin_tarifas_update" on fin_tarifas_medio_pago
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT') and has_entitlement('finanzas', 'gestion'))
  with check (clinica_id = clinica_actual());
create policy "fin_tarifas_delete" on fin_tarifas_medio_pago
  for delete to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT') and has_entitlement('finanzas', 'gestion'));

-- ============================================================
-- 1. Cobros liquidados
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
  if v_mov.liquidacion_id is not null then
    raise exception 'Este cobro ya se liquidó (su plata llegó al banco): anula primero la liquidación en Bold.';
  end if;
  return fn_fin_anular_registro(v_mov, p_motivo);
end;
$$;

-- Situación: un tratamiento anulado cuyo cobro ya se liquidó pide revisión
-- (no se anula solo: la pasarela ya abonó esa plata).
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
    and (
      (t.anulado and v.id is not null)
      or (not t.anulado and v.id is null and t.fecha >= cfg.fecha_inicio and coalesce(t.costo, -1) <> 0)
      or (not t.anulado and v.id is not null and t.id in (select id from corregidos))
    );
$$;

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
              case when not v_liquidada and (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela'
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

-- El detalle por cobro sigue al traslado (el corregido entra a la liquidación).
create or replace function fn_fin_liquidacion_cobro_trasladado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.liquidacion_id is not null and new.origen = 'tratamiento' then
    insert into fin_liquidacion_cobros (liquidacion_id, movimiento_id, tarifa_id, bruto, comision, retefuente, reteica, reteiva, neto)
    select new.liquidacion_id, new.id, lc.tarifa_id, lc.bruto, lc.comision, lc.retefuente, lc.reteica, lc.reteiva, lc.neto
    from fin_liquidacion_cobros lc
    join fin_movimientos o on o.id = lc.movimiento_id
    where lc.liquidacion_id = new.liquidacion_id and o.estado = 'anulado' and o.monto_original = new.monto_original
      and not exists (select 1 from fin_liquidacion_cobros x where x.liquidacion_id = new.liquidacion_id and x.movimiento_id = new.id)
    limit 1;
  end if;
  return null;
end;
$$;
create trigger fin_movimientos_liquidacion_traslado after insert on fin_movimientos
  for each row execute function fn_fin_liquidacion_cobro_trasladado();

-- ============================================================
-- 2. Liquidar con el neto esperado visto
-- ============================================================
drop function fn_fin_liquidar_pasarela(uuid, uuid[], uuid, date, numeric, text, text);
create or replace function fn_fin_liquidar_pasarela(
  p_id uuid, p_movimientos uuid[], p_cuenta_banco uuid, p_fecha date, p_neto_real numeric, p_neto_esperado numeric,
  p_soporte_path text default null, p_soporte_nombre text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_banco fin_cuentas%rowtype;
  v_pasarela uuid;
  v_cobros int;
  v_cuentas int;
  v_bruto numeric;
  v_comision numeric;
  v_rf numeric;
  v_rica numeric;
  v_riva numeric;
  v_esperado numeric;
  v_diferencia numeric;
  v_max_fecha date;
  v_ret jsonb;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para liquidar.';
  end if;
  if not has_entitlement('finanzas', 'gestion') then
    raise exception 'La liquidación de pasarelas está disponible en el plan Pro.';
  end if;
  if p_id is null or p_fecha is null or p_neto_real is null or p_cuenta_banco is null then
    raise exception 'Faltan datos de la liquidación.';
  end if;
  if coalesce(cardinality(p_movimientos), 0) = 0 then
    raise exception 'Elige los cobros que llegaron.';
  end if;
  if p_neto_real <= 0 then
    raise exception 'Escribe cuánto llegó al banco.';
  end if;
  if p_soporte_path is not null and p_soporte_path not like v_clinica::text || '/liquidaciones/' || p_id::text || '/%' then
    raise exception 'El soporte no corresponde a esta liquidación.';
  end if;

  -- Bloquea las tarifas (nadie las cambia mientras se liquida) y los cobros
  -- (evita liquidar dos veces el mismo).
  perform 1 from fin_tarifas_medio_pago where clinica_id = v_clinica for share;
  perform 1 from fin_movimientos where id = any(p_movimientos) and clinica_id = v_clinica for update;
  select count(*), count(distinct cuenta_id), min(cuenta_id::text)::uuid, max(fecha)
    into v_cobros, v_cuentas, v_pasarela, v_max_fecha
  from fin_movimientos
  where id = any(p_movimientos) and clinica_id = v_clinica and estado = 'pendiente_abono' and tipo = 'ingreso';
  if v_cobros <> cardinality(array(select distinct unnest(p_movimientos))) then
    raise exception 'Algún cobro ya no está pendiente: actualiza la pantalla.';
  end if;
  if v_cuentas <> 1 then
    raise exception 'Liquida los cobros de una pasarela a la vez.';
  end if;
  if (select tipo from fin_cuentas where id = v_pasarela) <> 'pasarela' then
    raise exception 'Solo se liquidan cobros de una pasarela.';
  end if;
  if p_fecha < v_max_fecha then
    raise exception 'La liquidación no puede ser anterior a los cobros que abona.';
  end if;

  select * into v_banco from fin_cuentas where id = p_cuenta_banco and clinica_id = v_clinica;
  if not found then
    raise exception 'La cuenta no pertenece a esta clínica.';
  end if;
  if not v_banco.activa or not v_banco.es_disponible or v_banco.moneda <> 'COP' then
    raise exception 'El abono llega a una cuenta activa en pesos (banco, billetera o efectivo).';
  end if;

  select sum(p.bruto), sum(p.comision), sum(p.retefuente), sum(p.reteica), sum(p.reteiva)
    into v_bruto, v_comision, v_rf, v_rica, v_riva
  from fn_fin_pendientes_pasarela() p where p.movimiento_id = any(p_movimientos);
  v_esperado := v_bruto - v_comision - v_rf - v_rica - v_riva;
  -- Lo que el usuario vio en pantalla: si la tarifa cambió entretanto, no se
  -- registra la diferencia como un ajuste sin que lo sepa.
  if p_neto_esperado is null or round(p_neto_esperado, 2) <> v_esperado then
    raise exception 'La tarifa de estos cobros cambió mientras liquidabas: actualiza la pantalla y revisa el neto esperado.';
  end if;
  if p_neto_real > v_bruto then
    raise exception 'Lo que llegó no puede ser más que lo cobrado ($%).', replace(to_char(v_bruto, 'FM999,999,999,990'), ',', '.');
  end if;
  v_diferencia := v_esperado - round(p_neto_real, 2);

  insert into fin_liquidaciones_pasarela (
    id, clinica_id, fecha, cuenta_pasarela_id, cuenta_banco_id, cobros, bruto, comision, retefuente, reteica, reteiva,
    neto_esperado, neto_real, diferencia, soporte_storage_path, soporte_nombre_archivo, created_by)
  values (
    p_id, v_clinica, p_fecha, v_pasarela, p_cuenta_banco, v_cobros, v_bruto, v_comision, v_rf, v_rica, v_riva,
    v_esperado, round(p_neto_real, 2), v_diferencia, p_soporte_path, left(p_soporte_nombre, 255), auth.uid());

  -- Neto al banco.
  insert into fin_movimientos (clinica_id, fecha, tipo, cuenta_id, cuenta_destino_id, moneda, monto_original, monto_destino,
    descripcion, origen, origen_id, liquidacion_id, soporte_storage_path, soporte_nombre_archivo, created_by)
  values (v_clinica, p_fecha, 'transferencia', v_pasarela, p_cuenta_banco, 'COP', round(p_neto_real, 2), round(p_neto_real, 2),
    'Abono de la pasarela (' || v_cobros || ' cobros)', 'bold_liquidacion', p_id, p_id, p_soporte_path, left(p_soporte_nombre, 255), auth.uid());
  -- Comisión (IVA incluido).
  if v_comision > 0 then
    insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original,
      descripcion, origen, origen_id, liquidacion_id, created_by)
    values (v_clinica, p_fecha, 'egreso', 'COMISION_PASARELA', v_pasarela, 'COP', v_comision,
      'Comisión de la pasarela (IVA incluido)', 'bold_liquidacion', p_id, p_id, auth.uid());
  end if;
  -- Retenciones: anticipo de impuestos, no gasto.
  if v_rf + v_rica + v_riva > 0 then
    v_ret := jsonb_strip_nulls(jsonb_build_object(
      'retefuente', nullif(v_rf, 0), 'reteica', nullif(v_rica, 0), 'reteiva', nullif(v_riva, 0)));
    insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, retenciones,
      descripcion, origen, origen_id, liquidacion_id, created_by)
    values (v_clinica, p_fecha, 'egreso', 'RETENCIONES_PRACTICADAS', v_pasarela, 'COP', v_rf + v_rica + v_riva, v_ret,
      'Retenciones que nos practicó la pasarela', 'bold_liquidacion', p_id, p_id, auth.uid());
  end if;
  -- Diferencia: llegó menos (salida) o más (entrada) de lo esperado.
  if v_diferencia <> 0 then
    insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original,
      descripcion, origen, origen_id, liquidacion_id, created_by)
    values (v_clinica, p_fecha, case when v_diferencia > 0 then 'egreso' else 'ingreso' end, 'AJUSTE_CAJA', v_pasarela, 'COP', abs(v_diferencia),
      'Diferencia en liquidación de la pasarela', 'bold_liquidacion', p_id, p_id, auth.uid());
  end if;

  -- Detalle por cobro con la tarifa usada (protege esa tarifa de cambios).
  insert into fin_liquidacion_cobros (liquidacion_id, movimiento_id, tarifa_id, bruto, comision, retefuente, reteica, reteiva, neto)
  select p_id, p.movimiento_id, p.tarifa_id, p.bruto, p.comision, p.retefuente, p.reteica, p.reteiva, p.neto
  from fn_fin_pendientes_pasarela() p where p.movimiento_id = any(p_movimientos);

  update fin_movimientos set estado = 'registrado', liquidacion_id = p_id where id = any(p_movimientos);
  return p_id;
end;
$$;


-- Anular la liquidación también restaura cobros trasladados a un corregido.
revoke execute on function fn_fin_liquidar_pasarela(uuid, uuid[], uuid, date, numeric, numeric, text, text) from public, anon;
grant execute on function fn_fin_liquidar_pasarela(uuid, uuid[], uuid, date, numeric, numeric, text, text) to authenticated;
revoke execute on function fn_fin_tarifa_validar() from public, anon, authenticated;
revoke execute on function fn_fin_tratamientos_situacion(uuid, uuid) from public, anon, authenticated;
revoke execute on function fn_fin_tratamiento_sincronizar() from public, anon, authenticated;
revoke execute on function fn_fin_liquidacion_cobro_trasladado() from public, anon, authenticated;
