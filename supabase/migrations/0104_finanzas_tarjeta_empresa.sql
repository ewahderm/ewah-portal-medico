-- ============================================================
-- 0104 · Flujo de caja · Tarjeta de crédito de la empresa
-- ============================================================
-- Hasta ahora solo existía la tarjeta de crédito de un socio. La de la
-- clínica funciona igual pero sin socio dueño:
--   1. Tipo de cuenta 'tarjeta_empresa': no es plata disponible; su saldo
--      negativo es lo que la clínica le debe al banco de la tarjeta.
--   2. Con ella solo se registran gastos. Se paga con una transferencia
--      desde una cuenta disponible (banco, billetera o efectivo), sin pagar
--      más de lo que se debe. No recibe cobros de pacientes.
--   3. En el informe de flujo de efectivo, la plata sale cuando se paga la
--      tarjeta ("Pago de tarjeta de crédito", operación): el gasto con la
--      tarjeta todavía no movió efectivo.

-- ============================================================
-- 1. Tipo de cuenta
-- ============================================================
alter table fin_cuentas drop constraint fin_cuentas_tipo_check;
alter table fin_cuentas add constraint fin_cuentas_tipo_check
  check (tipo in ('banco', 'nequi', 'daviplata', 'efectivo', 'pasarela', 'tarjeta_socio', 'tarjeta_empresa'));

-- Columnas calculadas: se recrean con el tipo nuevo.
alter table fin_cuentas drop column es_disponible;
alter table fin_cuentas add column es_disponible boolean
  generated always as (tipo not in ('pasarela', 'tarjeta_socio', 'tarjeta_empresa')) stored;
alter table fin_cuentas drop column puc_codigo_defecto;
alter table fin_cuentas add column puc_codigo_defecto text generated always as (case tipo
  when 'efectivo' then '1105' when 'pasarela' then '1345' when 'tarjeta_socio' then '2355'
  when 'tarjeta_empresa' then '2105' else '1110' end) stored;

-- La deuda inicial de la tarjeta se guarda negativa (es un pasivo).
alter table fin_cuentas drop constraint fin_cuenta_saldo_signo;
alter table fin_cuentas add constraint fin_cuenta_saldo_signo check (
  (tipo not in ('tarjeta_socio', 'tarjeta_empresa') or saldo_inicial <= 0)
  and (tipo not in ('efectivo', 'pasarela', 'nequi', 'daviplata') or saldo_inicial >= 0));
alter table fin_cuentas add constraint fin_cuenta_tarjeta_empresa_moneda check (tipo <> 'tarjeta_empresa' or moneda = 'COP');

-- ============================================================
-- 2. Categoría del pago de la tarjeta
-- ============================================================
alter table fin_categorias drop constraint fin_categorias_comportamiento_check;
alter table fin_categorias add constraint fin_categorias_comportamiento_check check (comportamiento in (
  'ingreso', 'gasto', 'inventario', 'activo_fijo', 'anticipo_impuesto',
  'prestamo_socio', 'aporte_socio', 'reembolso_socio', 'ajuste_caja', 'pago_tarjeta'));

insert into fin_categorias (codigo, nombre, tipo, actividad, puc_codigo_defecto, comportamiento, automatica, icono, ayuda, orden) values
  ('PAGO_TARJETA_EMPRESA', 'Pago de tarjeta de crédito', 'transferencia', 'operacion', '2105', 'pago_tarjeta', true, 'credit-card',
   'Lo que pagas del extracto de la tarjeta de crédito de la clínica. Los gastos con la tarjeta se anotan el día de la compra; la plata sale el día que pagas la tarjeta.', 325);

-- ============================================================
-- 3. Reglas de uso
-- ============================================================
create or replace function fn_fin_movimiento_tarjeta_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_origen text;
  v_destino text;
  v_deuda numeric;
begin
  select tipo into v_origen from fin_cuentas where id = new.cuenta_id;
  if new.cuenta_destino_id is not null then
    select tipo into v_destino from fin_cuentas where id = new.cuenta_destino_id;
  end if;

  if v_origen = 'tarjeta_empresa' and new.origen <> 'anulacion' then
    if new.tipo = 'ingreso' then
      raise exception 'A la tarjeta de crédito de la empresa no llegan cobros ni ingresos.';
    end if;
    if new.tipo = 'transferencia' then
      raise exception 'Con la tarjeta de crédito de la empresa solo se registran gastos. Para pagarla, transfiere desde el banco hacia la tarjeta.';
    end if;
  end if;

  -- Pagar la tarjeta: no más de lo que se debe, ni hoy ni a la fecha del pago.
  if new.tipo = 'transferencia' and v_destino = 'tarjeta_empresa' and new.origen <> 'anulacion' then
    select least(
      (select -saldo from fn_fin_saldos() where cuenta_id = new.cuenta_destino_id),
      (select -saldo from fn_fin_saldos(new.fecha) where cuenta_id = new.cuenta_destino_id)) into v_deuda;
    if new.monto_destino > coalesce(v_deuda, 0) then
      raise exception 'No se paga de más: a esa fecha la tarjeta debe %.',
        '$' || replace(to_char(greatest(coalesce(v_deuda, 0), 0), 'FM999,999,999,990'), ',', '.');
    end if;
  end if;
  return new;
end;
$$;

create trigger fin_movimientos_tarjeta_empresa before insert on fin_movimientos
  for each row execute function fn_fin_movimiento_tarjeta_empresa();

-- Un medio de pago de pacientes no llega a la tarjeta de la empresa.
create or replace function fn_fin_medio_pago_tarjeta_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cuenta_id is not null and exists (select 1 from fin_cuentas where id = new.cuenta_id and tipo = 'tarjeta_empresa') then
    raise exception 'A la tarjeta de crédito de la empresa no llegan cobros: elige el banco, el efectivo o la pasarela.';
  end if;
  return new;
end;
$$;

create trigger fin_medios_pago_tarjeta_empresa before insert or update on fin_medios_pago
  for each row execute function fn_fin_medio_pago_tarjeta_empresa();

revoke execute on function fn_fin_movimiento_tarjeta_empresa() from public, anon, authenticated;
revoke execute on function fn_fin_medio_pago_tarjeta_empresa() from public, anon, authenticated;

-- ============================================================
-- 4. Informe: el pago de la tarjeta es la salida de efectivo
-- ============================================================
create or replace function fn_fin_flujo(p_desde date, p_hasta date, p_sede uuid default null)
returns table (codigo text, actividad text, entradas numeric, salidas numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with disp as (select id from fin_cuentas where clinica_id = clinica_actual() and es_disponible),
  noDisp as (select id, tipo from fin_cuentas where clinica_id = clinica_actual() and not es_disponible),
  mov as (
    select * from fin_movimientos m
    where m.clinica_id = clinica_actual() and m.fecha between p_desde and p_hasta
  ),
  efectos as (
    -- Ingresos y egresos de una cuenta disponible.
    select coalesce(m.categoria_codigo, 'PROPIA_' || m.categoria_propia_id) as codigo,
      case when m.tipo = 'ingreso' then m.valor_cop else 0 end as entradas,
      case when m.tipo = 'egreso' then m.valor_cop else 0 end as salidas
    from mov m where m.tipo in ('ingreso', 'egreso') and m.cuenta_id in (select id from disp)
      and (p_sede is null or m.sede_id = p_sede)
    union all
    -- Sale efectivo hacia la tarjeta de un socio (reembolso), la de la
    -- empresa (pago) o la pasarela.
    select case when n.tipo = 'pasarela' then 'ABONO_PASARELA'
                when n.tipo = 'tarjeta_empresa' then 'PAGO_TARJETA_EMPRESA'
                else coalesce(m.categoria_codigo, 'REEMBOLSO_SOCIO') end, 0,
      m.valor_cop * case when n.tipo = 'pasarela' and p_sede is not null then fn_fin_parte_sede(coalesce(m.liquidacion_id, a.liquidacion_id), p_sede)
                         when p_sede is null or m.sede_id = p_sede then 1 else 0 end
    from mov m join noDisp n on n.id = m.cuenta_destino_id left join fin_movimientos a on a.id = m.anula_a
    where m.tipo = 'transferencia' and m.cuenta_id in (select id from disp)
    union all
    -- Entra efectivo desde la pasarela (abono) o una tarjeta (anulación de un pago).
    select case when n.tipo = 'pasarela' then 'ABONO_PASARELA'
                when n.tipo = 'tarjeta_empresa' then 'PAGO_TARJETA_EMPRESA'
                else coalesce(m.categoria_codigo, 'REEMBOLSO_SOCIO') end,
      m.valor_cop * case when n.tipo = 'pasarela' and p_sede is not null then fn_fin_parte_sede(coalesce(m.liquidacion_id, a.liquidacion_id), p_sede)
                         when p_sede is null or m.sede_id = p_sede then 1 else 0 end, 0
    from mov m join noDisp n on n.id = m.cuenta_id left join fin_movimientos a on a.id = m.anula_a
    where m.tipo = 'transferencia' and m.cuenta_destino_id in (select id from disp)
  )
  select e.codigo,
    case when e.codigo = 'ABONO_PASARELA' then 'operacion'
         when e.codigo like 'PROPIA_%' then coalesce((select cc.actividad from fin_categorias_clinica cc
           where cc.id = substr(e.codigo, 8)::uuid and cc.clinica_id = clinica_actual()), 'operacion')
         else coalesce((select g.actividad from fin_categorias g where g.codigo = e.codigo), 'operacion') end,
    round(sum(e.entradas), 2), round(sum(e.salidas), 2)
  from efectos e
  group by e.codigo
  having round(sum(e.entradas), 2) <> 0 or round(sum(e.salidas), 2) <> 0;
$$;
