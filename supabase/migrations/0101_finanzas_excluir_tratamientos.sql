-- ============================================================
-- 0101 · Flujo de caja · Excluir tratamientos del flujo y ver su estado
-- ============================================================
-- 1. fin_tratamientos_excluidos: tratamientos que la clínica decidió NO meter
--    en el flujo de caja (con motivo). Reversible: "volver a incluir" apaga
--    la marca (activa = false); la fila no se borra, queda la historia y la
--    auditoría. Un tratamiento que ya tiene su ingreso vivo no se excluye
--    (primero se anula ese ingreso).
-- 2. fn_fin_tratamientos_situacion deja de listar los excluidos, así que
--    "Poner al día", las alertas y el informe los ignoran sin más cambios.
-- 3. fn_fin_registrar_cobro rechaza un tratamiento excluido.
-- 4. fn_fin_tratamientos_flujo(vista): los que ya entraron al flujo
--    ('en_flujo') y los excluidos ('excluidos'), para la pantalla de cobros.

-- ============================================================
-- 1. Tabla
-- ============================================================
create table fin_tratamientos_excluidos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tratamiento_id uuid not null unique references tratamientos(id) on delete cascade,
  motivo text not null check (length(btrim(motivo)) between 10 and 500),
  activa boolean not null default true,
  reincluido_por uuid references usuarios(id) on delete set null,
  reincluido_en timestamptz,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index idx_fin_trat_excluidos_clinica on fin_tratamientos_excluidos (clinica_id) where activa;

create trigger fin_trat_excluidos_00_autor before insert or update on fin_tratamientos_excluidos
  for each row execute function fn_hab_forzar_autor();
create trigger fin_trat_excluidos_misma_clinica before insert on fin_tratamientos_excluidos
  for each row execute function fn_hab_misma_clinica('tratamiento_id', 'tratamientos', 'El tratamiento no pertenece a esta clínica.');
create trigger fin_trat_excluidos_set_updated_at before update on fin_tratamientos_excluidos
  for each row execute function set_updated_at();
create trigger fin_trat_excluidos_auditoria after insert or update on fin_tratamientos_excluidos
  for each row execute function fn_auditoria();

alter table fin_tratamientos_excluidos enable row level security;
create policy "fin_trat_excluidos_select" on fin_tratamientos_excluidos
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
-- Se escribe solo por fn_fin_excluir_tratamiento / fn_fin_reincluir_tratamiento.

-- ============================================================
-- 2. La situación ignora los excluidos
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
-- 3. Excluir y volver a incluir
-- ============================================================
create or replace function fn_fin_excluir_tratamiento(p_tratamiento uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_t tratamientos%rowtype;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para excluir tratamientos del flujo de caja.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué no entra al flujo de caja (al menos 10 caracteres).';
  end if;
  select * into v_t from tratamientos where id = p_tratamiento and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El tratamiento no existe.';
  end if;
  if exists (select 1 from fin_movimientos where origen = 'tratamiento' and origen_id = v_t.id and estado <> 'anulado') then
    raise exception 'Este tratamiento ya tiene su ingreso en el flujo de caja: anula primero ese ingreso.';
  end if;
  insert into fin_tratamientos_excluidos (clinica_id, tratamiento_id, motivo)
  values (v_clinica, v_t.id, left(btrim(p_motivo), 500))
  on conflict (tratamiento_id) do update
    set motivo = excluded.motivo, activa = true, reincluido_por = null, reincluido_en = null
    where fin_tratamientos_excluidos.activa = false;
  if not found then
    raise exception 'Este tratamiento ya está excluido del flujo de caja.';
  end if;
end;
$$;

create or replace function fn_fin_reincluir_tratamiento(p_tratamiento uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para incluir tratamientos en el flujo de caja.';
  end if;
  update fin_tratamientos_excluidos
  set activa = false, reincluido_por = auth.uid(), reincluido_en = now()
  where tratamiento_id = p_tratamiento and clinica_id = v_clinica and activa;
  if not found then
    raise exception 'Este tratamiento no está excluido del flujo de caja.';
  end if;
end;
$$;

revoke execute on function fn_fin_excluir_tratamiento(uuid, text) from public, anon;
grant execute on function fn_fin_excluir_tratamiento(uuid, text) to authenticated;
revoke execute on function fn_fin_reincluir_tratamiento(uuid) from public, anon;
grant execute on function fn_fin_reincluir_tratamiento(uuid) to authenticated;

-- ============================================================
-- 4. El cobro manual no aplica a un excluido
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
  if exists (select 1 from fin_tratamientos_excluidos where tratamiento_id = v_t.id and activa) then
    raise exception 'Este tratamiento está excluido del flujo de caja: vuelve a incluirlo para registrar su cobro.';
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

revoke execute on function fn_fin_registrar_cobro(uuid, uuid, date, numeric) from public, anon;
grant execute on function fn_fin_registrar_cobro(uuid, uuid, date, numeric) to authenticated;

-- ============================================================
-- 5. Los que ya entraron al flujo y los excluidos
-- ============================================================
-- p_vista: 'en_flujo' (con ingreso vivo, los 200 más recientes) o
-- 'excluidos'. Mismo criterio de nombres de paciente que los pendientes.
create or replace function fn_fin_tratamientos_flujo(p_vista text)
returns table (
  tratamiento_id uuid, fecha date, valor numeric, situacion text, movimiento_id uuid,
  medio_pago_id uuid, medio_pago text, tratamiento text, paciente text, sede_id uuid, motivo text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with acceso as (
    select has_permission('pacientes', 'VIEW') or has_permission('tratamientos', 'VIEW') as nombres
  ),
  base as (
    select t.id as tid, t.fecha as tfecha, t.costo as tcosto, t.created_at as tcreado,
      case when p_vista = 'excluidos' then 'excluido' else 'en_flujo' end as sit,
      m.id as mov, x.motivo as mot,
      t.medio_pago_id as mpid, t.tipo_tratamiento_id, t.paciente_id, t.sede_id as tsede
    from tratamientos t
    left join lateral (
      select id from fin_movimientos
      where origen = 'tratamiento' and origen_id = t.id and estado <> 'anulado' limit 1
    ) m on true
    left join fin_tratamientos_excluidos x on x.tratamiento_id = t.id and x.activa
    where t.clinica_id = clinica_actual()
      and ((p_vista = 'excluidos' and x.id is not null)
        or (p_vista = 'en_flujo' and not t.anulado and m.id is not null))
  )
  select b.tid, b.tfecha, b.tcosto, b.sit, b.mov, b.mpid, mp.nombre, tt.nombre,
    case when acceso.nombres then concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) end,
    b.tsede, b.mot
  from base b
  cross join acceso
  left join medios_pago mp on mp.id = b.mpid
  left join tipos_tratamiento tt on tt.id = b.tipo_tratamiento_id
  left join pacientes p on p.id = b.paciente_id
  where clinica_actual() is not null and has_permission('finanzas', 'VIEW')
    and p_vista in ('en_flujo', 'excluidos')
  order by b.tfecha desc, b.tcreado desc
  limit 200;
$$;

revoke execute on function fn_fin_tratamientos_flujo(text) from public, anon;
grant execute on function fn_fin_tratamientos_flujo(text) to authenticated;
