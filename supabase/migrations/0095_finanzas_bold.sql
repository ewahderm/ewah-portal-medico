-- ============================================================
-- 0095 · Flujo de caja FC4 · Bold: tarifas y liquidación
-- ============================================================
-- Diseño: docs/finanzas/etapa1-flujo-de-caja.md (HU-3, HU-7, N5, N6).
--   1. fin_tarifas_medio_pago: tarifa por medio de pago con vigencia
--      (comisión %, valor fijo, IVA incluido o no, retenciones y días
--      hábiles de abono). Una tarifa nueva aplica desde su fecha; una ya
--      usada en una liquidación no se modifica.
--   2. Cada cobro guarda su medio de pago (medio_pago_id) y su fecha
--      esperada de abono sale de la tarifa (con festivos).
--   3. fn_fin_liquidar_pasarela: el usuario confirma el neto que llegó al
--      banco; el sistema registra la transferencia del neto, la comisión,
--      las retenciones (no son gasto: anticipo de impuestos) y la
--      diferencia, y marca los cobros como abonados. El saldo de la
--      pasarela vuelve a cero por esos cobros.
--   4. fn_fin_anular_liquidacion: anula lo generado y los cobros vuelven a
--      estar pendientes.

-- ============================================================
-- 1. Tarifas
-- ============================================================
create table fin_tarifas_medio_pago (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  medio_pago_id uuid not null references medios_pago(id) on delete cascade,
  vigente_desde date not null,
  porcentaje_comision numeric(7, 4) not null default 0 check (porcentaje_comision between 0 and 100),
  comision_incluye_iva boolean not null default true,
  valor_fijo_comision numeric(16, 2) not null default 0 check (valor_fijo_comision >= 0),
  porcentaje_retefuente numeric(7, 4) not null default 0 check (porcentaje_retefuente between 0 and 100),
  porcentaje_reteica numeric(7, 4) not null default 0 check (porcentaje_reteica between 0 and 100),
  porcentaje_reteiva numeric(7, 4) not null default 0 check (porcentaje_reteiva between 0 and 100),
  -- Informativo en la Etapa 1 (el cobro no dice si la tarjeta es extranjera).
  recargo_internacional numeric(7, 4) not null default 0 check (recargo_internacional between 0 and 100),
  dias_habiles_abono int not null default 1 check (dias_habiles_abono between 0 and 30),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (medio_pago_id, vigente_desde)
);

create index idx_fin_tarifas_clinica on fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde desc);

create table fin_liquidaciones_pasarela (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  fecha date not null,
  cuenta_pasarela_id uuid not null references fin_cuentas(id),
  cuenta_banco_id uuid not null references fin_cuentas(id),
  cobros int not null check (cobros > 0),
  bruto numeric(16, 2) not null check (bruto > 0),
  comision numeric(16, 2) not null check (comision >= 0),
  retefuente numeric(16, 2) not null check (retefuente >= 0),
  reteica numeric(16, 2) not null check (reteica >= 0),
  reteiva numeric(16, 2) not null check (reteiva >= 0),
  neto_esperado numeric(16, 2) not null,
  neto_real numeric(16, 2) not null check (neto_real > 0),
  -- Positiva: llegó menos de lo esperado; negativa: llegó más.
  diferencia numeric(16, 2) not null,
  soporte_storage_path text,
  soporte_nombre_archivo text check (length(soporte_nombre_archivo) <= 255),
  anulada boolean not null default false,
  anulada_motivo text check (length(anulada_motivo) <= 500),
  anulada_por uuid references usuarios(id) on delete set null,
  anulada_en timestamptz,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fin_liq_cuadre check (bruto = neto_real + comision + retefuente + reteica + reteiva + diferencia),
  constraint fin_liq_esperado check (neto_esperado = bruto - comision - retefuente - reteica - reteiva),
  constraint fin_liq_anulada check (not anulada or (anulada_motivo is not null and anulada_en is not null))
);

create index idx_fin_liq_clinica_fecha on fin_liquidaciones_pasarela (clinica_id, fecha desc);

alter table fin_movimientos add column medio_pago_id uuid references medios_pago(id);
alter table fin_movimientos add column liquidacion_id uuid references fin_liquidaciones_pasarela(id);
create index idx_fin_mov_liquidacion on fin_movimientos (liquidacion_id) where liquidacion_id is not null;
create index idx_fin_mov_pendientes on fin_movimientos (clinica_id, fecha_esperada) where estado = 'pendiente_abono';

-- Medio de pago de los cobros ya registrados (desde su tratamiento).
alter table fin_movimientos disable trigger fin_movimientos_proteger;
update fin_movimientos m set medio_pago_id = t.medio_pago_id
from tratamientos t where m.origen = 'tratamiento' and t.id = m.origen_id and m.medio_pago_id is null;
alter table fin_movimientos enable trigger fin_movimientos_proteger;

create or replace function fn_fin_tarifa_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from fin_movimientos m join fin_liquidaciones_pasarela l on l.id = m.liquidacion_id
      where m.medio_pago_id = old.medio_pago_id and m.fecha >= old.vigente_desde and not l.anulada
    ) then
      raise exception 'Esta tarifa ya se usó en una liquidación: registra una nueva con otra fecha de vigencia.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.clinica_id <> old.clinica_id or new.medio_pago_id <> old.medio_pago_id then
      raise exception 'La tarifa no cambia de medio de pago.';
    end if;
    if exists (
      select 1 from fin_movimientos m join fin_liquidaciones_pasarela l on l.id = m.liquidacion_id
      where m.medio_pago_id = old.medio_pago_id and m.fecha >= least(old.vigente_desde, new.vigente_desde) and not l.anulada
    ) then
      raise exception 'Esta tarifa ya se usó en una liquidación: registra una nueva con otra fecha de vigencia.';
    end if;
  end if;
  return new;
end;
$$;

create trigger fin_tarifas_00_autor before insert or update on fin_tarifas_medio_pago
  for each row execute function fn_hab_forzar_autor();
create trigger fin_tarifas_validar before insert or update or delete on fin_tarifas_medio_pago
  for each row execute function fn_fin_tarifa_validar();
create trigger fin_tarifas_medio_misma_clinica before insert on fin_tarifas_medio_pago
  for each row execute function fn_hab_misma_clinica('medio_pago_id', 'medios_pago', 'El medio de pago no pertenece a esta clínica.');
create trigger fin_tarifas_set_updated_at before update on fin_tarifas_medio_pago
  for each row execute function set_updated_at();
create trigger fin_tarifas_auditoria after insert or update or delete on fin_tarifas_medio_pago
  for each row execute function fn_auditoria();

alter table fin_tarifas_medio_pago enable row level security;
create policy "fin_tarifas_select" on fin_tarifas_medio_pago
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_tarifas_insert" on fin_tarifas_medio_pago
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT') and has_entitlement('finanzas', 'gestion'));
create policy "fin_tarifas_update" on fin_tarifas_medio_pago
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'))
  with check (clinica_id = clinica_actual());
create policy "fin_tarifas_delete" on fin_tarifas_medio_pago
  for delete to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'));

create trigger fin_liquidaciones_auditoria after insert or update on fin_liquidaciones_pasarela
  for each row execute function fn_auditoria();
alter table fin_liquidaciones_pasarela enable row level security;
create policy "fin_liquidaciones_select" on fin_liquidaciones_pasarela
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
-- Se crean y anulan solo con sus funciones.

-- ============================================================
-- 2. Cálculo (N6)
-- ============================================================
-- Invoker: desde la pantalla respeta RLS; desde las funciones del sistema
-- (definer) ve la clínica del cobro.
-- Tarifa de un cobro: la del medio vigente a la fecha; si el medio no tiene
-- (p. ej. un crédito cobrado con el datáfono), la de otro medio que llega a
-- la misma pasarela.
create or replace function fn_fin_tarifa_de(p_clinica uuid, p_medio uuid, p_cuenta uuid, p_fecha date)
returns fin_tarifas_medio_pago
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select t.* from fin_tarifas_medio_pago t
  where t.clinica_id = p_clinica and t.vigente_desde <= p_fecha
    and (t.medio_pago_id = p_medio
         or t.medio_pago_id in (select mp.medio_pago_id from fin_medios_pago mp where mp.clinica_id = p_clinica and mp.cuenta_id = p_cuenta))
  order by (t.medio_pago_id is not distinct from p_medio) desc, t.vigente_desde desc, t.created_at desc
  limit 1;
$$;

-- Comisión = (bruto × % + fijo), × 1,19 si la tarifa no incluye IVA.
-- Retenciones = bruto × %. Neto = bruto − comisión − retenciones.
create or replace function fn_fin_desglose(p_bruto numeric, p_tarifa fin_tarifas_medio_pago)
returns table (comision numeric, retefuente numeric, reteica numeric, reteiva numeric, neto numeric)
language sql
immutable
set search_path = public, pg_temp
as $$
  with c as (
    select
      coalesce(round((p_bruto * p_tarifa.porcentaje_comision / 100 + p_tarifa.valor_fijo_comision)
        * case when p_tarifa.comision_incluye_iva then 1 else 1.19 end, 2), 0) as comision,
      coalesce(round(p_bruto * p_tarifa.porcentaje_retefuente / 100, 2), 0) as retefuente,
      coalesce(round(p_bruto * p_tarifa.porcentaje_reteica / 100, 2), 0) as reteica,
      coalesce(round(p_bruto * p_tarifa.porcentaje_reteiva / 100, 2), 0) as reteiva
  )
  select comision, retefuente, reteica, reteiva, p_bruto - comision - retefuente - reteica - reteiva from c;
$$;

-- Días hábiles de abono de un cobro (1 si no hay tarifa).
create or replace function fn_fin_fecha_abono(p_clinica uuid, p_medio uuid, p_cuenta uuid, p_fecha date)
returns date
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select fn_hab_sumar_dias_habiles(p_fecha,
    coalesce((fn_fin_tarifa_de(p_clinica, p_medio, p_cuenta, p_fecha)).dias_habiles_abono, 1),
    coalesce((select p.codigo from clinicas cl join paises p on p.id = cl.pais_operacion_id where cl.id = p_clinica), 'CO'));
$$;

-- Cobros pendientes de abono con su neto esperado (invoker: respeta RLS).
create or replace function fn_fin_pendientes_pasarela()
returns table (
  movimiento_id uuid, fecha date, fecha_esperada date, cuenta_id uuid, medio_pago_id uuid, descripcion text,
  bruto numeric, tarifa_id uuid, comision numeric, retefuente numeric, reteica numeric, reteiva numeric, neto numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.id, m.fecha, m.fecha_esperada, m.cuenta_id, m.medio_pago_id, m.descripcion, m.monto_original,
    t.id, d.comision, d.retefuente, d.reteica, d.reteiva, d.neto
  from fin_movimientos m
  cross join lateral (select * from fn_fin_tarifa_de(m.clinica_id, m.medio_pago_id, m.cuenta_id, m.fecha)) t
  cross join lateral fn_fin_desglose(m.monto_original, t) d
  where m.estado = 'pendiente_abono' and m.clinica_id = clinica_actual()
  order by m.fecha_esperada, m.fecha, m.created_at;
$$;

-- ============================================================
-- 3. Movimientos: el cobro guarda su medio; liquidar/desliquidar
-- ============================================================
create or replace function fn_fin_movimiento_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un movimiento no se borra: anúlalo.';
  end if;
  -- valor_cop es generada: en un BEFORE UPDATE todavía viene vacía en NEW.
  if (to_jsonb(new) - array['estado', 'anulado_motivo', 'anulado_por', 'anulado_en', 'valor_cop', 'liquidacion_id'])
     is distinct from (to_jsonb(old) - array['estado', 'anulado_motivo', 'anulado_por', 'anulado_en', 'valor_cop', 'liquidacion_id']) then
    raise exception 'Un movimiento no se modifica: anúlalo y regístralo de nuevo.';
  end if;
  if old.estado = 'anulado' then
    raise exception 'El movimiento ya está anulado.';
  end if;
  -- Transiciones válidas: anular; liquidar (pendiente → registrado con su
  -- liquidación) y anular la liquidación (de vuelta a pendiente).
  if new.estado = 'anulado' then
    if new.liquidacion_id is distinct from old.liquidacion_id then
      raise exception 'Cambio de estado no permitido.';
    end if;
  elsif new.estado is distinct from old.estado or new.liquidacion_id is distinct from old.liquidacion_id then
    if not (
      (old.estado = 'pendiente_abono' and new.estado = 'registrado' and old.liquidacion_id is null and new.liquidacion_id is not null)
      or (old.estado = 'registrado' and new.estado = 'pendiente_abono' and old.liquidacion_id is not null and new.liquidacion_id is null)
    ) then
      raise exception 'Cambio de estado no permitido.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function fn_fin_ingreso_de_tratamiento(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t tratamientos%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_tipo text;
  v_id uuid;
begin
  select * into v_t from tratamientos where id = p_id for share;
  if not found then
    return null;
  end if;
  if not exists (
    select 1 from fn_fin_tratamientos_situacion(v_t.clinica_id, p_id) s
    where s.situacion = 'por_generar'
  ) then
    return null;
  end if;
  select c.* into v_cuenta
  from fin_medios_pago mp join fin_cuentas c on c.id = mp.cuenta_id
  where mp.medio_pago_id = v_t.medio_pago_id;
  select nombre into v_tipo from tipos_tratamiento where id = v_t.tipo_tratamiento_id;

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, medio_pago_id, created_by)
  values (
    v_t.clinica_id, v_t.fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', v_t.costo,
    left(coalesce(v_tipo, 'Tratamiento'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_fin_fecha_abono(v_t.clinica_id, v_t.medio_pago_id, v_cuenta.id, v_t.fecha) end,
    'tratamiento', v_t.id, v_t.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function fn_fin_registrar_cobro(p_tratamiento uuid, p_cuenta uuid, p_fecha date, p_monto numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_t tratamientos%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_tipo text;
  v_id uuid;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para registrar ingresos.';
  end if;
  if p_tratamiento is null or p_cuenta is null or p_fecha is null or p_monto is null then
    raise exception 'Faltan datos del cobro.';
  end if;
  if p_monto <= 0 then
    raise exception 'El valor cobrado debe ser mayor que cero.';
  end if;
  select * into v_t from tratamientos where id = p_tratamiento and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El tratamiento no existe.';
  end if;
  if v_t.anulado then
    raise exception 'El tratamiento está anulado.';
  end if;
  if exists (select 1 from fin_movimientos where origen = 'tratamiento' and origen_id = v_t.id and estado <> 'anulado') then
    raise exception 'Este tratamiento ya tiene su ingreso registrado.';
  end if;
  select * into v_cuenta from fin_cuentas where id = p_cuenta and clinica_id = v_clinica;
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
  select nombre into v_tipo from tipos_tratamiento where id = v_t.tipo_tratamiento_id;

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, medio_pago_id, created_by)
  values (
    v_clinica, p_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', round(p_monto, 2),
    left('Cobro: ' || coalesce(v_tipo, 'Tratamiento') || ' del ' || to_char(v_t.fecha, 'DD/MM/YYYY'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_fin_fecha_abono(v_clinica, v_t.medio_pago_id, v_cuenta.id, p_fecha) end,
    'tratamiento', v_t.id, true, v_t.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- El traslado del cobro al tratamiento corregido conserva su medio (y su
-- liquidación queda en el original anulado).
create or replace function fn_fin_tratamiento_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov fin_movimientos%rowtype;
  v_sucesor uuid;
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
          if v_mov.cobro_manual then
            select s.id into v_sucesor from tratamientos s
            where s.clinica_id = new.clinica_id and s.corrige_a = new.id and not s.anulado
              and not exists (select 1 from fin_movimientos m where m.origen = 'tratamiento' and m.origen_id = s.id and m.estado <> 'anulado')
            order by s.created_at desc limit 1;
          end if;
          perform fn_fin_anular_registro(v_mov,
            case when v_sucesor is not null then 'Tratamiento corregido: el cobro pasa al registro corregido'
                 else 'Tratamiento anulado: ' || coalesce(nullif(btrim(new.anulado_motivo), ''), 'sin motivo') end);
          if v_sucesor is not null then
            insert into fin_movimientos (
              clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
              descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, medio_pago_id, created_by)
            values (
              v_mov.clinica_id, v_mov.fecha, 'ingreso', v_mov.categoria_codigo, v_mov.cuenta_id,
              (select sede_id from tratamientos where id = v_sucesor), 'paciente', v_mov.moneda, v_mov.monto_original,
              v_mov.descripcion,
              case when (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela' then 'pendiente_abono' else 'registrado' end,
              case when (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela' then coalesce(v_mov.fecha_esperada, v_mov.fecha) end,
              'tratamiento', v_sucesor, true, v_mov.medio_pago_id, auth.uid());
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

-- ============================================================
-- 4. Liquidar
-- ============================================================
create or replace function fn_fin_liquidar_pasarela(
  p_id uuid, p_movimientos uuid[], p_cuenta_banco uuid, p_fecha date, p_neto_real numeric,
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

  -- Bloquea los cobros (evita liquidar dos veces el mismo).
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
  if p_neto_real > v_bruto then
    raise exception 'Lo que llegó no puede ser más que lo cobrado (%).', to_char(v_bruto, 'FM999G999G999G990D00');
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

  update fin_movimientos set estado = 'registrado', liquidacion_id = p_id where id = any(p_movimientos);
  return p_id;
end;
$$;

create or replace function fn_fin_anular_liquidacion(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_liq fin_liquidaciones_pasarela%rowtype;
  v_mov fin_movimientos%rowtype;
begin
  if clinica_actual() is null or not has_permission('finanzas', 'VOID') then
    raise exception 'No tienes permiso para anular liquidaciones.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué se anula (al menos 10 caracteres).';
  end if;
  select * into v_liq from fin_liquidaciones_pasarela where id = p_id and clinica_id = clinica_actual() for update;
  if not found then
    raise exception 'La liquidación no existe.';
  end if;
  if v_liq.anulada then
    raise exception 'La liquidación ya está anulada.';
  end if;
  for v_mov in
    select * from fin_movimientos where origen = 'bold_liquidacion' and origen_id = p_id and estado <> 'anulado' for update
  loop
    perform fn_fin_anular_registro(v_mov, 'Liquidación anulada: ' || btrim(p_motivo));
  end loop;
  -- Los cobros vuelven a estar pendientes de abono.
  update fin_movimientos set estado = 'pendiente_abono', liquidacion_id = null
  where liquidacion_id = p_id and estado = 'registrado' and origen <> 'bold_liquidacion';
  update fin_liquidaciones_pasarela
  set anulada = true, anulada_motivo = left(btrim(p_motivo), 500), anulada_por = auth.uid(), anulada_en = now()
  where id = p_id;
end;
$$;

revoke execute on function fn_fin_tarifa_validar() from public, anon, authenticated;
revoke execute on function fn_fin_tarifa_de(uuid, uuid, uuid, date) from public, anon;
grant execute on function fn_fin_tarifa_de(uuid, uuid, uuid, date) to authenticated;
revoke execute on function fn_fin_fecha_abono(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke execute on function fn_fin_desglose(numeric, fin_tarifas_medio_pago) from public, anon;
grant execute on function fn_fin_desglose(numeric, fin_tarifas_medio_pago) to authenticated;
revoke execute on function fn_fin_pendientes_pasarela() from public, anon;
grant execute on function fn_fin_pendientes_pasarela() to authenticated;
revoke execute on function fn_fin_liquidar_pasarela(uuid, uuid[], uuid, date, numeric, text, text) from public, anon;
grant execute on function fn_fin_liquidar_pasarela(uuid, uuid[], uuid, date, numeric, text, text) to authenticated;
revoke execute on function fn_fin_anular_liquidacion(uuid, text) from public, anon;
grant execute on function fn_fin_anular_liquidacion(uuid, text) to authenticated;
revoke execute on function fn_fin_ingreso_de_tratamiento(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_tratamiento_sincronizar() from public, anon, authenticated;
revoke execute on function fn_fin_movimiento_proteger() from public, anon, authenticated;
