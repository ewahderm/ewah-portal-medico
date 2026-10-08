-- ============================================================
-- 0092 · Flujo de caja FC2 · Ajustes de la revisión
-- ============================================================
--   1. La fecha de inicio no se puede mover a una fecha posterior a un
--      movimiento ya registrado (el saldo lo seguiría contando y la
--      pantalla ya no lo mostraría).
--   2. Un movimiento manual no trae del cliente campos que pone el sistema
--      (anulado_*, fecha_esperada, origen_id); el tipo de tercero se
--      deriva de lo que se eligió; el soporte debe estar en la carpeta del
--      propio movimiento.
--   3. fin_mov_origen_unico se retira: la liquidación de la pasarela (FC4)
--      genera varios movimientos del mismo origen y la corrección de un
--      tratamiento genera otro tras anular. Cada fase define su unicidad.
--   4. fn_fin_saldos agrupa en vez de una subconsulta por cuenta.

-- 1. Fecha de inicio vs movimientos
create or replace function fn_fin_config_historial()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_primero date;
begin
  if tg_op = 'UPDATE' then
    if new.historial is distinct from old.historial then
      raise exception 'El historial de la fecha de inicio no se edita.';
    end if;
    if new.fecha_inicio is distinct from old.fecha_inicio then
      if length(btrim(coalesce(new.motivo_cambio, ''))) < 10 then
        raise exception 'Explica por qué cambias la fecha de inicio (al menos 10 caracteres).';
      end if;
      select min(fecha) into v_primero from fin_movimientos where clinica_id = new.clinica_id;
      if v_primero is not null and new.fecha_inicio > v_primero then
        raise exception 'Hay movimientos desde el %: la fecha de inicio no puede ser posterior.', to_char(v_primero, 'DD/MM/YYYY');
      end if;
      new.historial := old.historial || jsonb_build_array(jsonb_build_object(
        'anterior', old.fecha_inicio, 'nueva', new.fecha_inicio,
        'motivo', left(btrim(new.motivo_cambio), 500), 'por', auth.uid(), 'en', now()));
    end if;
  else
    new.historial := '[]'::jsonb;
  end if;
  new.motivo_cambio := null;
  return new;
end;
$$;

-- 2. Campos del sistema en movimientos manuales
create or replace function fn_fin_movimiento_sanear()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.origen = 'manual' then
    new.anulado_motivo := null;
    new.anulado_por := null;
    new.anulado_en := null;
    new.fecha_esperada := null;
    new.origen_id := null;
    new.tercero_tipo := case
      when new.socio_id is not null then 'socio'
      when new.proveedor_id is not null then 'proveedor'
      when new.tercero_nombre is not null then 'otro'
    end;
    if new.soporte_storage_path is not null
       and new.soporte_storage_path not like new.clinica_id::text || '/movimientos/' || new.id::text || '/%' then
      raise exception 'El soporte no corresponde a este movimiento.';
    end if;
  end if;
  return new;
end;
$$;

-- "fin_movimientos_01_" para que corra justo después de la autoría y antes
-- de validar.
create trigger fin_movimientos_01_sanear before insert on fin_movimientos
  for each row execute function fn_fin_movimiento_sanear();

-- 3. Unicidad por origen
drop index if exists fin_mov_origen_unico;

-- 4. Saldos agrupados
create or replace function fn_fin_saldos(p_fecha date default null)
returns table (cuenta_id uuid, saldo numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with corte as (select coalesce(p_fecha, (now() at time zone 'America/Bogota')::date) as d),
  efectos as (
    select m.cuenta_id as cuenta, sum(case m.tipo when 'ingreso' then m.monto_original else -m.monto_original end) as monto
    from fin_movimientos m, corte where m.fecha <= corte.d
    group by m.cuenta_id
    union all
    select m.cuenta_destino_id, sum(m.monto_destino)
    from fin_movimientos m, corte where m.tipo = 'transferencia' and m.fecha <= corte.d
    group by m.cuenta_destino_id
  ),
  total as (select cuenta, sum(monto) as monto from efectos group by cuenta)
  select c.id, c.saldo_inicial + coalesce(t.monto, 0)
  from fin_cuentas c
  left join total t on t.cuenta = c.id;
$$;

alter function fn_fin_anular_movimiento(uuid, text) set search_path = public, pg_temp;

revoke execute on function fn_fin_movimiento_sanear() from public, anon, authenticated;
revoke execute on function fn_fin_saldos(date) from public, anon;
grant execute on function fn_fin_saldos(date) to authenticated;
