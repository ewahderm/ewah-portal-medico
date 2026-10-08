-- ============================================================
-- 0098 · Flujo de caja FC6 · Informe, cierre mensual y alertas
-- ============================================================
-- Diseño: docs/finanzas/etapa1-flujo-de-caja.md (HU-12, HU-13, HU-14, N8, N11).
--   1. fn_fin_flujo(desde, hasta, sede): entradas y salidas de EFECTIVO
--      (cuentas disponibles) por categoría y actividad NIIF (operación,
--      inversión, financiación). Las transferencias entre cuentas
--      disponibles no cuentan; el abono de la pasarela entra como cobro de
--      operación y el reembolso a un socio sale como financiación.
--      fn_fin_tasas(fecha): última tasa usada por moneda, para convertir
--      los saldos en divisas.
--   2. Cierre mensual (APPROVE, Pro): arqueo por cuenta (la diferencia se
--      registra como sobrante/faltante con motivo), foto de saldos y del
--      informe, y un mes cerrado no admite movimientos con fecha en él.
--      Se cierra en orden y se reabre el último con motivo (auditado). La
--      fecha de inicio queda fija cuando hay meses cerrados.
--   3. Alertas del cron diario (Pro): Bold sin abonar 2 días hábiles después
--      de lo esperado, deuda con un socio de más de 30 días, mes anterior sin
--      cerrar al día 10 e ingresos por revisar (una vez por semana).

-- ============================================================
-- 1. Informe
-- ============================================================
create or replace function fn_fin_tasas(p_fecha date default null)
returns table (moneda text, tasa numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with corte as (select coalesce(p_fecha, (now() at time zone 'America/Bogota')::date) as d),
  tasas as (
    select m.moneda, m.tasa_cop as tasa, m.fecha, m.created_at
    from fin_movimientos m, corte where m.clinica_id = clinica_actual() and m.moneda <> 'COP' and m.fecha <= corte.d
    union all
    -- Comprar divisas: la tasa implícita de lo que llegó.
    select c.moneda, m.valor_cop / m.monto_destino, m.fecha, m.created_at
    from fin_movimientos m join fin_cuentas c on c.id = m.cuenta_destino_id, corte
    where m.clinica_id = clinica_actual() and m.tipo = 'transferencia' and c.moneda <> 'COP' and m.moneda = 'COP' and m.fecha <= corte.d
  )
  select distinct on (moneda) moneda, round(tasa, 6) from tasas order by moneda, fecha desc, created_at desc;
$$;

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
    where m.clinica_id = clinica_actual() and m.fecha between p_desde and p_hasta and (p_sede is null or m.sede_id = p_sede)
  ),
  efectos as (
    -- Ingresos y egresos de una cuenta disponible.
    select coalesce(m.categoria_codigo, 'PROPIA_' || m.categoria_propia_id) as codigo,
      case when m.tipo = 'ingreso' then m.valor_cop else 0 end as entradas,
      case when m.tipo = 'egreso' then m.valor_cop else 0 end as salidas
    from mov m where m.tipo in ('ingreso', 'egreso') and m.cuenta_id in (select id from disp)
    union all
    -- Sale efectivo hacia una cuenta no disponible (reembolso a la tarjeta de un socio).
    select case when n.tipo = 'pasarela' then 'ABONO_PASARELA' else coalesce(m.categoria_codigo, 'REEMBOLSO_SOCIO') end, 0, m.valor_cop
    from mov m join noDisp n on n.id = m.cuenta_destino_id
    where m.tipo = 'transferencia' and m.cuenta_id in (select id from disp)
    union all
    -- Entra efectivo desde una cuenta no disponible (abono de la pasarela).
    select case when n.tipo = 'pasarela' then 'ABONO_PASARELA' else coalesce(m.categoria_codigo, 'REEMBOLSO_SOCIO') end, m.valor_cop, 0
    from mov m join noDisp n on n.id = m.cuenta_id
    where m.tipo = 'transferencia' and m.cuenta_destino_id in (select id from disp)
  )
  select e.codigo,
    case when e.codigo = 'ABONO_PASARELA' then 'operacion' else coalesce(c.actividad, 'operacion') end,
    sum(e.entradas), sum(e.salidas)
  from efectos e
  left join v_fin_categorias c on c.codigo = e.codigo
  group by e.codigo, c.actividad
  having sum(e.entradas) <> 0 or sum(e.salidas) <> 0;
$$;

-- Saldos de la clínica de la sesión: también cuando la llama una función
-- del sistema (definer), que no pasa por RLS.
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
    from fin_movimientos m, corte where m.clinica_id = clinica_actual() and m.fecha <= corte.d
    group by m.cuenta_id
    union all
    select m.cuenta_destino_id, sum(m.monto_destino)
    from fin_movimientos m, corte where m.clinica_id = clinica_actual() and m.tipo = 'transferencia' and m.fecha <= corte.d
    group by m.cuenta_destino_id
  ),
  total as (select cuenta, sum(monto) as monto from efectos group by cuenta)
  select c.id, c.saldo_inicial + coalesce(t.monto, 0)
  from fin_cuentas c
  left join total t on t.cuenta = c.id
  where c.clinica_id = clinica_actual();
$$;

-- ============================================================
-- 2. Cierre mensual
-- ============================================================
create table fin_periodos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  anio int not null check (anio between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  estado text not null check (estado in ('cerrado', 'abierto')),
  cerrado_por uuid references usuarios(id) on delete set null,
  cerrado_en timestamptz,
  foto jsonb,
  -- Cierres y reaperturas: [{accion, por, en, motivo}].
  historial jsonb not null default '[]'::jsonb,
  unique (clinica_id, anio, mes)
);

create table fin_arqueos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  periodo_id uuid not null references fin_periodos(id),
  cuenta_id uuid not null references fin_cuentas(id),
  saldo_sistema numeric(16, 2) not null,
  saldo_contado numeric(16, 2) not null,
  diferencia numeric(16, 2) generated always as (saldo_contado - saldo_sistema) stored,
  motivo text check (length(motivo) <= 500),
  movimiento_id uuid references fin_movimientos(id),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_fin_arqueos_periodo on fin_arqueos (periodo_id);

create trigger fin_periodos_auditoria after insert or update on fin_periodos
  for each row execute function fn_auditoria();
create trigger fin_arqueos_auditoria after insert on fin_arqueos
  for each row execute function fn_auditoria();
alter table fin_periodos enable row level security;
alter table fin_arqueos enable row level security;
create policy "fin_periodos_select" on fin_periodos
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_arqueos_select" on fin_arqueos
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
-- Se escriben solo con fn_fin_cerrar_mes / fn_fin_reabrir_mes.

-- N8: ningún movimiento con fecha en un mes cerrado.
create or replace function fn_fin_mes_abierto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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
create trigger fin_movimientos_02_mes_abierto before insert on fin_movimientos
  for each row execute function fn_fin_mes_abierto();

-- N11: la fecha de inicio queda fija con meses cerrados.
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
      if exists (select 1 from fin_periodos where clinica_id = new.clinica_id and estado = 'cerrado') then
        raise exception 'Hay meses cerrados: la fecha de inicio ya no se cambia.';
      end if;
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

-- p_arqueos: [{"cuenta_id": uuid, "contado": numeric, "motivo": text}]
create or replace function fn_fin_cerrar_mes(p_anio int, p_mes int, p_arqueos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_inicio date;
  v_primero date;
  v_ultimo date;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_periodo fin_periodos%rowtype;
  v_a jsonb;
  v_cuenta fin_cuentas%rowtype;
  v_sistema numeric;
  v_contado numeric;
  v_dif numeric;
  v_tasa numeric;
  v_mov uuid;
  v_motivo text;
begin
  if v_clinica is null or not has_permission('finanzas', 'APPROVE') then
    raise exception 'No tienes permiso para cerrar el mes.';
  end if;
  if not has_entitlement('finanzas', 'gestion') then
    raise exception 'El cierre mensual está disponible en el plan Pro.';
  end if;
  if p_anio is null or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'Elige el mes.';
  end if;
  select fecha_inicio into v_inicio from fin_config where clinica_id = v_clinica for update;
  if v_inicio is null then
    raise exception 'Primero activa el flujo de caja.';
  end if;
  v_primero := make_date(p_anio, p_mes, 1);
  v_ultimo := (v_primero + interval '1 month - 1 day')::date;
  if v_ultimo >= date_trunc('month', v_hoy)::date then
    raise exception 'Solo se cierran meses que ya terminaron.';
  end if;
  if v_ultimo < v_inicio then
    raise exception 'Ese mes es anterior al inicio del flujo de caja.';
  end if;
  -- En orden: el mes anterior (si es desde el inicio) debe estar cerrado.
  if v_primero > date_trunc('month', v_inicio)::date and not exists (
    select 1 from fin_periodos where clinica_id = v_clinica and estado = 'cerrado'
      and make_date(anio, mes, 1) = (v_primero - interval '1 month')::date
  ) then
    raise exception 'Primero cierra el mes anterior (%).', to_char(v_primero - interval '1 month', 'MM/YYYY');
  end if;
  select * into v_periodo from fin_periodos where clinica_id = v_clinica and anio = p_anio and mes = p_mes for update;
  if found and v_periodo.estado = 'cerrado' then
    raise exception 'Ese mes ya está cerrado.';
  end if;
  if not found then
    insert into fin_periodos (clinica_id, anio, mes, estado) values (v_clinica, p_anio, p_mes, 'abierto') returning * into v_periodo;
  end if;

  -- Arqueo: la diferencia queda como sobrante o faltante del último día.
  for v_a in select * from jsonb_array_elements(coalesce(p_arqueos, '[]'::jsonb)) loop
    select * into v_cuenta from fin_cuentas where id = (v_a ->> 'cuenta_id')::uuid and clinica_id = v_clinica and es_disponible;
    if not found then
      raise exception 'El arqueo es de cuentas de la clínica con plata disponible.';
    end if;
    v_contado := (v_a ->> 'contado')::numeric;
    if v_contado is null or v_contado < 0 then
      raise exception 'Revisa el saldo contado de "%".', v_cuenta.nombre;
    end if;
    select saldo into v_sistema from fn_fin_saldos(v_ultimo) where cuenta_id = v_cuenta.id;
    v_dif := round(v_contado, 2) - v_sistema;
    v_mov := null;
    v_motivo := nullif(btrim(coalesce(v_a ->> 'motivo', '')), '');
    if v_dif <> 0 then
      if length(coalesce(v_motivo, '')) < 10 then
        raise exception 'Explica la diferencia de "%" (al menos 10 caracteres).', v_cuenta.nombre;
      end if;
      v_tasa := 1;
      if v_cuenta.moneda <> 'COP' then
        select t.tasa into v_tasa from fn_fin_tasas(v_ultimo) t where t.moneda = v_cuenta.moneda;
        if v_tasa is null then
          raise exception 'No hay una tasa de % para registrar la diferencia de "%".', v_cuenta.moneda, v_cuenta.nombre;
        end if;
      end if;
      insert into fin_movimientos (clinica_id, fecha, tipo, categoria_codigo, cuenta_id, moneda, monto_original, tasa_cop,
        descripcion, origen, origen_id, created_by)
      values (v_clinica, v_ultimo, case when v_dif > 0 then 'ingreso' else 'egreso' end, 'AJUSTE_CAJA', v_cuenta.id, v_cuenta.moneda,
        abs(v_dif), v_tasa, left('Arqueo de ' || to_char(v_primero, 'MM/YYYY') || ': ' || v_motivo, 500), 'cierre', v_periodo.id, auth.uid())
      returning id into v_mov;
    end if;
    insert into fin_arqueos (clinica_id, periodo_id, cuenta_id, saldo_sistema, saldo_contado, motivo, movimiento_id, created_by)
    values (v_clinica, v_periodo.id, v_cuenta.id, v_sistema, round(v_contado, 2), left(v_motivo, 500), v_mov, auth.uid());
  end loop;

  update fin_periodos
  set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now(),
    foto = jsonb_build_object(
      'saldos', (select coalesce(jsonb_agg(jsonb_build_object('cuenta_id', s.cuenta_id, 'saldo', s.saldo)), '[]'::jsonb)
                 from fn_fin_saldos(v_ultimo) s),
      'flujo', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from fn_fin_flujo(v_primero, v_ultimo) f),
      'tasas', (select coalesce(jsonb_object_agg(t.moneda, t.tasa), '{}'::jsonb) from fn_fin_tasas(v_ultimo) t)),
    historial = historial || jsonb_build_array(jsonb_build_object('accion', 'cerrar', 'por', auth.uid(), 'en', now()))
  where id = v_periodo.id;
  return v_periodo.id;
end;
$$;

create or replace function fn_fin_reabrir_mes(p_anio int, p_mes int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_periodo fin_periodos%rowtype;
begin
  if v_clinica is null or not has_permission('finanzas', 'APPROVE') then
    raise exception 'No tienes permiso para reabrir el mes.';
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
end;
$$;

-- ============================================================
-- 3. Alertas (cron, service role)
-- ============================================================
create table fin_alertas_enviadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  objeto_tipo text not null check (length(objeto_tipo) <= 60),
  objeto_id uuid not null,
  umbral_dias int not null,
  destinatarios text[] not null default '{}',
  proveedor_id text,
  created_at timestamptz not null default now(),
  unique (objeto_tipo, objeto_id, umbral_dias)
);
create index idx_fin_alertas_enviadas_clinica on fin_alertas_enviadas (clinica_id, created_at desc);
alter table fin_alertas_enviadas enable row level security;
create policy "fin_alertas_enviadas_select" on fin_alertas_enviadas
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));

-- Clínicas con el flujo de caja activado y el plan Pro (las alertas son Pro).
create or replace function fn_fin_clinicas_alertas()
returns table (clinica_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
  from clinicas c
  join fin_config f on f.clinica_id = c.id
  join modulos m on m.codigo = 'finanzas'
  join clinica_modulos cm on cm.clinica_id = c.id and cm.modulo_id = m.id and cm.activo
  where c.activo and coalesce(
    (select o.incluido from clinica_feature_overrides o
      where o.clinica_id = c.id and o.modulo_id = m.id and o.feature_codigo = 'gestion'
        and (o.expira_at is null or o.expira_at > now())
      order by o.created_at desc limit 1),
    (select pf.incluido from plan_features pf
      where pf.plan_id = c.plan_id and pf.modulo_id = m.id and pf.feature_codigo = 'gestion'),
    false);
$$;

-- Destinatarios: nivel 1 o quien puede cerrar el mes (APPROVE).
create or replace function fn_fin_destinatarios(p_clinica_id uuid)
returns table (usuario_id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, lower(u.email)
  from usuarios u
  join roles r on r.id = u.rol_id
  where u.clinica_id = p_clinica_id and u.activo and u.email is not null
    and (r.nivel = 1 or exists (
      select 1 from rol_modulo_permiso rmp
      join modulos m on m.id = rmp.modulo_id and m.codigo = 'finanzas'
      join permisos p on p.id = rmp.permiso_id and p.codigo = 'APPROVE'
      where rmp.rol_id = u.rol_id and rmp.concedido
    ));
$$;

-- Mismo formato que fn_sst_alertas_pendientes (el correo es compartido).
-- objeto_id identifica qué se avisa (una vez): un cobro, una deuda desde
-- una fecha, un mes o una semana.
create or replace function fn_fin_alertas_pendientes(p_clinica_id uuid, p_hoy date default null)
returns table (
  objeto_tipo text, objeto_id uuid, umbrales int[], fecha date, dias int, titulo text, detalle text, ruta text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with hoy as (select coalesce(p_hoy, (now() at time zone 'America/Bogota')::date) as d),
  cfg as (select fecha_inicio from fin_config where clinica_id = p_clinica_id),
  pais as (select coalesce((select p.codigo from clinicas cl join paises p on p.id = cl.pais_operacion_id where cl.id = p_clinica_id), 'CO') as codigo),
  items as (
    -- Bold sin abonar 2 días hábiles después de la fecha esperada.
    select 'fin_bold_vencido'::text as tipo, m.id, coalesce(m.fecha_esperada, m.fecha) as fecha,
      'Cobro con pasarela sin abonar'::text as titulo,
      'Se esperaba el ' || to_char(coalesce(m.fecha_esperada, m.fecha), 'DD/MM/YYYY') || ': ' || to_char(m.monto_original, 'FM999,999,999,990') || ' COP' as detalle,
      '/finanzas/bold'::text as ruta
    from fin_movimientos m, hoy, pais
    where m.clinica_id = p_clinica_id and m.estado = 'pendiente_abono'
      and fn_hab_sumar_dias_habiles(coalesce(m.fecha_esperada, m.fecha), 2, pais.codigo) < hoy.d
    union all
    -- Deuda con un socio de más de 30 días: el gasto más antiguo sin reembolsar.
    select 'fin_deuda_socio', md5(d.cuenta_id::text || d.desde::text)::uuid, d.desde,
      'Deuda con un socio de más de 30 días', d.nombre || ': ' || to_char(d.deuda, 'FM999,999,999,990') || ' COP desde el ' || to_char(d.desde, 'DD/MM/YYYY'),
      '/finanzas/socios'
    from (
      select c.id as cuenta_id, s.nombre, -sal.saldo as deuda,
        coalesce((
          select x.fecha from (
            select g.fecha, sum(g.monto_original) over (order by g.fecha desc, g.created_at desc) as acumulado
            from fin_movimientos g
            where g.cuenta_id = c.id and g.tipo = 'egreso' and g.estado <> 'anulado' and g.origen <> 'anulacion'
          ) x where x.acumulado >= -sal.saldo order by x.acumulado limit 1
        ), (select fecha_inicio from cfg)) as desde
      from fin_cuentas c
      join fin_socios s on s.id = c.socio_id
      join lateral (
        select c.saldo_inicial + coalesce(sum(case when m.cuenta_id = c.id then case m.tipo when 'ingreso' then m.monto_original else -m.monto_original end else 0 end
          + case when m.cuenta_destino_id = c.id then m.monto_destino else 0 end), 0) as saldo
        from fin_movimientos m where m.cuenta_id = c.id or m.cuenta_destino_id = c.id
      ) sal on true
      where c.clinica_id = p_clinica_id and c.tipo = 'tarjeta_socio' and sal.saldo < 0
    ) d, hoy
    where d.desde < hoy.d - 30
    union all
    -- Mes anterior sin cerrar al día 10.
    select 'fin_mes_sin_cerrar', md5(p_clinica_id::text || to_char(hoy.d - interval '1 month', 'YYYY-MM'))::uuid,
      (date_trunc('month', hoy.d) - interval '1 day')::date,
      'Mes sin cerrar', 'El mes de ' || to_char(hoy.d - interval '1 month', 'MM/YYYY') || ' aún no se cierra.', '/finanzas/cierre'
    from hoy, cfg
    where extract(day from hoy.d) >= 10
      and (date_trunc('month', hoy.d) - interval '1 day')::date >= cfg.fecha_inicio
      and not exists (
        select 1 from fin_periodos p where p.clinica_id = p_clinica_id and p.estado = 'cerrado'
          and make_date(p.anio, p.mes, 1) = (date_trunc('month', hoy.d) - interval '1 month')::date)
    union all
    -- Ingresos por revisar (una vez por semana).
    select 'fin_por_revisar', md5(p_clinica_id::text || to_char(hoy.d, 'IYYY-IW'))::uuid, hoy.d,
      'Ingresos por revisar', r.n || ' tratamientos necesitan atención para entrar al flujo de caja.', '/finanzas/cobros'
    from hoy, (
      select count(*) as n from fn_fin_tratamientos_situacion(p_clinica_id)
      where situacion not in ('por_cobrar', 'fecha_futura')
    ) r
    where r.n > 0
  )
  -- dias: negativo = vencido (como en SG-SST).
  select i.tipo, i.id, array[0], i.fecha, (i.fecha - hoy.d)::int, i.titulo, i.detalle, i.ruta
  from items i, hoy
  where not exists (
    select 1 from fin_alertas_enviadas a where a.objeto_tipo = i.tipo and a.objeto_id = i.id and a.umbral_dias = 0
  );
$$;

revoke execute on function fn_fin_tasas(date) from public, anon;
grant execute on function fn_fin_tasas(date) to authenticated;
revoke execute on function fn_fin_flujo(date, date, uuid) from public, anon;
grant execute on function fn_fin_flujo(date, date, uuid) to authenticated;
revoke execute on function fn_fin_mes_abierto() from public, anon, authenticated;
revoke execute on function fn_fin_cerrar_mes(int, int, jsonb) from public, anon;
grant execute on function fn_fin_cerrar_mes(int, int, jsonb) to authenticated;
revoke execute on function fn_fin_reabrir_mes(int, int, text) from public, anon;
grant execute on function fn_fin_reabrir_mes(int, int, text) to authenticated;
revoke execute on function fn_fin_clinicas_alertas() from public, anon, authenticated;
revoke execute on function fn_fin_destinatarios(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_alertas_pendientes(uuid, date) from public, anon, authenticated;
grant execute on function fn_fin_clinicas_alertas() to service_role;
grant execute on function fn_fin_destinatarios(uuid) to service_role;
grant execute on function fn_fin_alertas_pendientes(uuid, date) to service_role;
