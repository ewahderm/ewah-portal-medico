-- ============================================================
-- 0100 · Flujo de caja FC6 · Ajustes de la revisión
-- ============================================================
--   1. fn_fin_flujo toma la actividad de la categoría global o de la propia
--      de la clínica (no de la vista, que fuera de RLS trae una fila por
--      cada clínica que personalizó la categoría y multiplicaba la foto del
--      cierre). Con una sede elegida, el abono de la pasarela se reparte
--      según la sede de los cobros que abona.
--      fn_fin_flujo_meses: la serie mensual en una sola consulta.
--   2. Un tratamiento (o su corrección) con fecha en un mes cerrado genera
--      su ingreso el primer día abierto, con la fecha original en la nota.
--   3. Reabrir un mes anula los ajustes de su arqueo (se rehace al cerrar)
--      y exige el plan Pro; los arqueos viejos quedan marcados.
--   4. El control de mes cerrado espera a un cierre en curso (bloqueo
--      compartido sobre fin_config).

alter table fin_arqueos add column reemplazado boolean not null default false;

-- 2. Primer día abierto: los meses se cierran en orden desde el inicio.
create or replace function fn_fin_fecha_abierta(p_clinica uuid, p_fecha date)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(p_fecha, coalesce((
    select (make_date(anio, mes, 1) + interval '1 month')::date
    from fin_periodos where clinica_id = p_clinica and estado = 'cerrado'
    order by anio desc, mes desc limit 1), p_fecha));
$$;

-- 4. Mes abierto, esperando un cierre en curso.
create or replace function fn_fin_mes_abierto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from fin_config where clinica_id = new.clinica_id for share;
  if exists (
    select 1 from fin_periodos p
    where p.clinica_id = new.clinica_id and p.estado = 'cerrado'
      and p.anio = extract(year from new.fecha) and p.mes = extract(month from new.fecha)
  ) then
    raise exception 'El mes de % está cerrado: para registrar en él, reábrelo.', to_char(new.fecha, 'MM/YYYY');
  end if;
  return new;
end;
$$;

-- Parte de una liquidación que corresponde a una sede (según el neto de
-- sus cobros).
create or replace function fn_fin_parte_sede(p_liquidacion uuid, p_sede uuid)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(lc.neto) filter (where c.sede_id = p_sede) / nullif(sum(lc.neto), 0), 0)
  from fin_liquidacion_cobros lc join fin_movimientos c on c.id = lc.movimiento_id
  where lc.liquidacion_id = p_liquidacion;
$$;

-- 1. Informe
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
    -- Sale efectivo hacia la tarjeta de un socio (reembolso) o la pasarela.
    select case when n.tipo = 'pasarela' then 'ABONO_PASARELA' else coalesce(m.categoria_codigo, 'REEMBOLSO_SOCIO') end, 0,
      m.valor_cop * case when n.tipo = 'pasarela' and p_sede is not null then fn_fin_parte_sede(coalesce(m.liquidacion_id, a.liquidacion_id), p_sede)
                         when p_sede is null or m.sede_id = p_sede then 1 else 0 end
    from mov m join noDisp n on n.id = m.cuenta_destino_id left join fin_movimientos a on a.id = m.anula_a
    where m.tipo = 'transferencia' and m.cuenta_id in (select id from disp)
    union all
    -- Entra efectivo desde la pasarela (abono) o la tarjeta de un socio.
    select case when n.tipo = 'pasarela' then 'ABONO_PASARELA' else coalesce(m.categoria_codigo, 'REEMBOLSO_SOCIO') end,
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

-- Serie mensual (neto por categoría, como el informe).
create or replace function fn_fin_flujo_meses(p_desde date, p_hasta date, p_sede uuid default null)
returns table (mes text, entradas numeric, salidas numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select to_char(m, 'YYYY-MM'),
    coalesce(sum(greatest(f.entradas - f.salidas, 0)), 0), coalesce(sum(greatest(f.salidas - f.entradas, 0)), 0)
  from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') m
  left join lateral fn_fin_flujo(greatest(m::date, p_desde), least((m + interval '1 month - 1 day')::date, p_hasta), p_sede) f on true
  group by m order by m;
$$;

-- 2. Ingreso de un tratamiento en el primer día abierto
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
  v_fecha date;
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
  v_fecha := fn_fin_fecha_abierta(v_t.clinica_id, v_t.fecha);

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, medio_pago_id, created_by)
  values (
    v_t.clinica_id, v_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', v_t.costo,
    left(coalesce(v_tipo, 'Tratamiento') || case when v_fecha <> v_t.fecha then ' (tratamiento del ' || to_char(v_t.fecha, 'DD/MM/YYYY') || ', mes cerrado)' else '' end, 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_fin_fecha_abono(v_t.clinica_id, v_t.medio_pago_id, v_cuenta.id, v_fecha) end,
    'tratamiento', v_t.id, v_t.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
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
              v_mov.clinica_id, fn_fin_fecha_abierta(v_mov.clinica_id, v_mov.fecha), 'ingreso', v_mov.categoria_codigo, v_mov.cuenta_id,
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


-- 3. Reabrir
create or replace function fn_fin_reabrir_mes(p_anio int, p_mes int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_periodo fin_periodos%rowtype;
  v_mov fin_movimientos%rowtype;
begin
  if v_clinica is null or not has_permission('finanzas', 'APPROVE') then
    raise exception 'No tienes permiso para reabrir el mes.';
  end if;
  if not has_entitlement('finanzas', 'gestion') then
    raise exception 'El cierre mensual está disponible en el plan Pro.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué se reabre (al menos 10 caracteres).';
  end if;
  select * into v_periodo from fin_periodos where clinica_id = v_clinica and anio = p_anio and mes = p_mes for update;
  if not found or v_periodo.estado <> 'cerrado' then
    raise exception 'Ese mes no está cerrado.';
  end if;
  if exists (
    select 1 from fin_periodos where clinica_id = v_clinica and estado = 'cerrado'
      and make_date(anio, mes, 1) > make_date(p_anio, p_mes, 1)
  ) then
    raise exception 'Primero reabre los meses posteriores.';
  end if;
  update fin_periodos
  set estado = 'abierto',
    historial = historial || jsonb_build_array(jsonb_build_object('accion', 'reabrir', 'por', auth.uid(), 'en', now(), 'motivo', left(btrim(p_motivo), 500)))
  where id = v_periodo.id;
  -- El arqueo se rehace al volver a cerrar: sus ajustes se anulan con la
  -- misma fecha (el mes ya está abierto), para que el mes vuelva a lo del
  -- sistema.
  for v_mov in
    select * from fin_movimientos where clinica_id = v_clinica and origen = 'cierre' and origen_id = v_periodo.id and estado <> 'anulado' for update
  loop
    insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, tasa_cop,
      descripcion, origen, anula_a, created_by)
    values (v_mov.clinica_id, v_mov.fecha, case v_mov.tipo when 'ingreso' then 'egreso' else 'ingreso' end, v_mov.categoria_codigo,
      v_mov.cuenta_id, v_mov.moneda, v_mov.monto_original, v_mov.tasa_cop,
      left('Anulación: mes reabierto: ' || btrim(p_motivo), 500), 'anulacion', v_mov.id, auth.uid());
    update fin_movimientos
    set estado = 'anulado', anulado_motivo = left('Mes reabierto: ' || btrim(p_motivo), 500), anulado_por = auth.uid(), anulado_en = now()
    where id = v_mov.id;
  end loop;
  update fin_arqueos set reemplazado = true where periodo_id = v_periodo.id and not reemplazado;
end;
$$;


revoke execute on function fn_fin_fecha_abierta(uuid, date) from public, anon, authenticated;
revoke execute on function fn_fin_mes_abierto() from public, anon, authenticated;
revoke execute on function fn_fin_flujo(date, date, uuid) from public, anon;
grant execute on function fn_fin_flujo(date, date, uuid) to authenticated;
revoke execute on function fn_fin_parte_sede(uuid, uuid) from public, anon;
grant execute on function fn_fin_parte_sede(uuid, uuid) to authenticated;
revoke execute on function fn_fin_flujo_meses(date, date, uuid) from public, anon;
grant execute on function fn_fin_flujo_meses(date, date, uuid) to authenticated;
revoke execute on function fn_fin_ingreso_de_tratamiento(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_tratamiento_sincronizar() from public, anon, authenticated;
revoke execute on function fn_fin_reabrir_mes(int, int, text) from public, anon;
grant execute on function fn_fin_reabrir_mes(int, int, text) to authenticated;
