-- ============================================================
-- 0093 · Flujo de caja FC3 · Ingresos desde tratamientos
-- ============================================================
-- Diseño: docs/finanzas/etapa1-flujo-de-caja.md (HU-0, HU-3 parcial, HU-6).
--   1. fin_medios_pago: a qué cuenta llega cada medio de pago (o si es
--      crédito y queda por cobrar). Tabla de finanzas para no tocar el
--      catálogo de Parámetros; las tarifas de FC4 cuelgan de aquí.
--   2. Cada tratamiento no anulado desde la fecha de inicio, con valor y
--      con un medio que tiene cuenta, genera su ingreso (Servicios de
--      salud, origen 'tratamiento'). Si el tratamiento se anula, el ingreso
--      se anula; si se revierte la anulación, se genera de nuevo. A una
--      pasarela entra como pendiente de abono.
--   3. Lo que no se pudo generar (sin valor, medio sin cuenta, fecha
--      futura...) queda "por revisar"; el crédito queda "por cobrar" hasta
--      que se registre el cobro. Nada se pierde: fn_fin_generar_ingresos
--      pone al día lo pendiente (al activar, al asignar cuentas o al mover
--      el inicio hacia atrás).
--   4. Finanzas nunca bloquea el registro clínico: si el ingreso no se
--      puede generar, el tratamiento se guarda igual y queda por revisar.
--   5. El ingreso no lleva el nombre del paciente (dato de salud fuera de
--      la historia); solo el tipo de tratamiento. Las listas de por cobrar
--      y por revisar sí lo muestran a quien tiene finanzas, para cobrar.

-- ============================================================
-- 1. Medio de pago → cuenta
-- ============================================================
create table fin_medios_pago (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  medio_pago_id uuid not null unique references medios_pago(id) on delete cascade,
  cuenta_id uuid references fin_cuentas(id),
  -- Crédito / cuotas: no entra plata al registrar; queda por cobrar.
  es_credito boolean not null default false,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint fin_medio_destino check (not (es_credito and cuenta_id is not null))
);

create index idx_fin_medios_pago_clinica on fin_medios_pago (clinica_id);

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
  return new;
end;
$$;

create trigger fin_medios_pago_00_autor before insert or update on fin_medios_pago
  for each row execute function fn_hab_forzar_autor();
create trigger fin_medios_pago_validar before insert or update on fin_medios_pago
  for each row execute function fn_fin_medio_pago_validar();
create trigger fin_medios_pago_medio_misma_clinica before insert on fin_medios_pago
  for each row execute function fn_hab_misma_clinica('medio_pago_id', 'medios_pago', 'El medio de pago no pertenece a esta clínica.');
create trigger fin_medios_pago_set_updated_at before update on fin_medios_pago
  for each row execute function set_updated_at();
create trigger fin_medios_pago_auditoria after insert or update on fin_medios_pago
  for each row execute function fn_auditoria();

alter table fin_medios_pago enable row level security;
create policy "fin_medios_pago_select" on fin_medios_pago
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_medios_pago_insert" on fin_medios_pago
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'));
create policy "fin_medios_pago_update" on fin_medios_pago
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'))
  with check (clinica_id = clinica_actual());
-- Sin delete: "sin asignar" es cuenta_id null.

-- Un solo ingreso vivo por tratamiento (el automático o el cobro).
create unique index fin_mov_tratamiento_vivo on fin_movimientos (origen_id)
  where origen = 'tratamiento' and estado <> 'anulado';

-- ============================================================
-- 2. Anular: la parte común (movimiento inverso + marca)
-- ============================================================
-- Interna (sin grant): la usan fn_fin_anular_movimiento, tras sus
-- permisos, y la anulación de un tratamiento.
create or replace function fn_fin_anular_registro(p_mov fin_movimientos, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_moneda_destino text;
  v_id uuid;
begin
  if p_mov.tipo = 'transferencia' then
    select moneda into v_moneda_destino from fin_cuentas where id = p_mov.cuenta_destino_id;
  end if;
  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, categoria_propia_id, cuenta_id, cuenta_destino_id, sede_id,
    tercero_tipo, proveedor_id, socio_id, tercero_nombre, moneda, monto_original, tasa_cop, monto_destino,
    descripcion, origen, anula_a, created_by)
  values (
    p_mov.clinica_id, greatest(v_hoy, p_mov.fecha),
    case p_mov.tipo when 'ingreso' then 'egreso' when 'egreso' then 'ingreso' else 'transferencia' end,
    p_mov.categoria_codigo, p_mov.categoria_propia_id,
    -- La transferencia se devuelve: sale de donde llegó y llega a donde salió.
    case when p_mov.tipo = 'transferencia' then p_mov.cuenta_destino_id else p_mov.cuenta_id end,
    case when p_mov.tipo = 'transferencia' then p_mov.cuenta_id end,
    p_mov.sede_id, p_mov.tercero_tipo, p_mov.proveedor_id, p_mov.socio_id, p_mov.tercero_nombre,
    case when p_mov.tipo = 'transferencia' then v_moneda_destino else p_mov.moneda end,
    case when p_mov.tipo = 'transferencia' then p_mov.monto_destino else p_mov.monto_original end,
    case when p_mov.tipo = 'transferencia' then
      case when v_moneda_destino = 'COP' then 1 else p_mov.tasa_cop * p_mov.monto_original / p_mov.monto_destino end
      else p_mov.tasa_cop end,
    case when p_mov.tipo = 'transferencia' then p_mov.monto_original end,
    left('Anulación: ' || btrim(p_motivo), 500), 'anulacion', p_mov.id, auth.uid())
  returning id into v_id;

  update fin_movimientos
  set estado = 'anulado', anulado_motivo = left(btrim(p_motivo), 500), anulado_por = auth.uid(), anulado_en = now()
  where id = p_mov.id;
  return v_id;
end;
$$;

-- Ahora también anula el ingreso de un tratamiento (por ejemplo, porque el
-- medio tenía la cuenta equivocada): el tratamiento vuelve a "por revisar"
-- o "por cobrar" y se genera de nuevo o se registra el cobro.
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
  if v_mov.origen not in ('manual', 'tratamiento') then
    raise exception 'Este movimiento lo registró el sistema: se anula desde su origen.';
  end if;
  return fn_fin_anular_registro(v_mov, p_motivo);
end;
$$;

-- ============================================================
-- 3. Situación de los tratamientos frente al flujo de caja
-- ============================================================
-- Interna. Una fila por tratamiento que pide atención:
--   por_generar          listo para generar su ingreso (no se generó aún)
--   por_cobrar           medio de crédito, sin cobro registrado
--   sin_valor            sin valor registrado
--   medio_sin_cuenta     su medio de pago no tiene cuenta asignada (o está inactiva)
--   fecha_futura         con fecha posterior a hoy
--   anulado_con_ingreso  tratamiento anulado cuyo ingreso sigue vivo
-- Los de valor 0 (cortesías) no generan ingreso ni piden revisión.
create or replace function fn_fin_tratamientos_situacion(p_clinica uuid, p_tratamiento uuid default null)
returns table (tratamiento_id uuid, situacion text, movimiento_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (select fecha_inicio from fin_config where clinica_id = p_clinica),
  vivos as (
    select m.origen_id, m.id from fin_movimientos m
    where m.clinica_id = p_clinica and m.origen = 'tratamiento' and m.estado <> 'anulado'
      and (p_tratamiento is null or m.origen_id = p_tratamiento)
  )
  select t.id,
    case
      when t.anulado then 'anulado_con_ingreso'
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
    );
$$;

-- ============================================================
-- 4. Generar el ingreso de un tratamiento
-- ============================================================
-- Interna. Devuelve el id del ingreso o null si no aplica.
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
  v_pais text;
  v_id uuid;
begin
  select * into v_t from tratamientos where id = p_id;
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
  select p.codigo into v_pais from clinicas cl join paises p on p.id = cl.pais_operacion_id where cl.id = v_t.clinica_id;

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, created_by)
  values (
    v_t.clinica_id, v_t.fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', v_t.costo,
    left(coalesce(v_tipo, 'Tratamiento'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    -- FC4 ajusta los días con la tarifa del medio; mientras, 1 día hábil.
    case when v_cuenta.tipo = 'pasarela' then fn_hab_sumar_dias_habiles(v_t.fecha, 1, coalesce(v_pais, 'CO')) end,
    'tratamiento', v_t.id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Trigger en tratamientos: nace, se anula o se revierte su anulación.
create or replace function fn_fin_tratamiento_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov fin_movimientos%rowtype;
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
          perform fn_fin_anular_registro(v_mov, 'Tratamiento anulado: ' || coalesce(nullif(btrim(new.anulado_motivo), ''), 'sin motivo'));
        end loop;
      end if;
    elsif tg_op = 'INSERT' or old.anulado then
      perform fn_fin_ingreso_de_tratamiento(new.id);
    end if;
  exception when others then
    -- El tratamiento se guarda igual: queda en "por revisar".
    raise warning 'Flujo de caja: no se sincronizó el tratamiento %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger tratamientos_flujo_caja after insert or update of anulado on tratamientos
  for each row execute function fn_fin_tratamiento_sincronizar();

-- ============================================================
-- 5. Lo pendiente (por cobrar y por revisar), para la pantalla
-- ============================================================
create or replace function fn_fin_ingresos_pendientes()
returns table (
  tratamiento_id uuid, fecha date, valor numeric, situacion text, movimiento_id uuid,
  medio_pago_id uuid, medio_pago text, tratamiento text, paciente text, sede_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.fecha, t.costo, s.situacion, s.movimiento_id,
    t.medio_pago_id, mp.nombre, tt.nombre,
    concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido),
    t.sede_id
  from fn_fin_tratamientos_situacion(clinica_actual()) s
  join tratamientos t on t.id = s.tratamiento_id
  left join medios_pago mp on mp.id = t.medio_pago_id
  left join tipos_tratamiento tt on tt.id = t.tipo_tratamiento_id
  left join pacientes p on p.id = t.paciente_id
  where clinica_actual() is not null and has_permission('finanzas', 'VIEW')
  order by t.fecha, t.created_at;
$$;

-- ============================================================
-- 6. Poner al día: genera lo listo y anula lo de tratamientos anulados
-- ============================================================
create or replace function fn_fin_generar_ingresos()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_fila record;
  v_mov fin_movimientos%rowtype;
  v_generados int := 0;
  v_valor numeric := 0;
  v_anulados int := 0;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para registrar ingresos.';
  end if;
  if not exists (select 1 from fin_config where clinica_id = v_clinica) then
    raise exception 'Primero activa el flujo de caja.';
  end if;
  for v_fila in select * from fn_fin_tratamientos_situacion(v_clinica) where situacion in ('por_generar', 'anulado_con_ingreso') loop
    if v_fila.situacion = 'por_generar' then
      if fn_fin_ingreso_de_tratamiento(v_fila.tratamiento_id) is not null then
        v_generados := v_generados + 1;
        v_valor := v_valor + (select costo from tratamientos where id = v_fila.tratamiento_id);
      end if;
    else
      select * into v_mov from fin_movimientos where id = v_fila.movimiento_id for update;
      if v_mov.estado <> 'anulado' then
        perform fn_fin_anular_registro(v_mov, 'Tratamiento anulado: puesta al día del flujo de caja');
        v_anulados := v_anulados + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('generados', v_generados, 'valor', v_valor, 'anulados', v_anulados);
end;
$$;

-- ============================================================
-- 7. Registrar el cobro de un tratamiento (crédito o resolver a mano)
-- ============================================================
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
  v_pais text;
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
  select p.codigo into v_pais from clinicas cl join paises p on p.id = cl.pais_operacion_id where cl.id = v_clinica;

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, created_by)
  values (
    v_clinica, p_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', round(p_monto, 2),
    left('Cobro: ' || coalesce(v_tipo, 'Tratamiento') || ' del ' || to_char(v_t.fecha, 'DD/MM/YYYY'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_hab_sumar_dias_habiles(p_fecha, 1, coalesce(v_pais, 'CO')) end,
    'tratamiento', v_t.id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function fn_fin_medio_pago_validar() from public, anon, authenticated;
revoke execute on function fn_fin_anular_registro(fin_movimientos, text) from public, anon, authenticated;
revoke execute on function fn_fin_tratamientos_situacion(uuid, uuid) from public, anon, authenticated;
revoke execute on function fn_fin_ingreso_de_tratamiento(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_tratamiento_sincronizar() from public, anon, authenticated;
revoke execute on function fn_fin_ingresos_pendientes() from public, anon;
grant execute on function fn_fin_ingresos_pendientes() to authenticated;
revoke execute on function fn_fin_generar_ingresos() from public, anon;
grant execute on function fn_fin_generar_ingresos() to authenticated;
revoke execute on function fn_fin_registrar_cobro(uuid, uuid, date, numeric) from public, anon;
grant execute on function fn_fin_registrar_cobro(uuid, uuid, date, numeric) to authenticated;
