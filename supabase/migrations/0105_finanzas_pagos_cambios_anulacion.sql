-- ============================================================
-- 0105 · Flujo de caja · Reporte de la pasarela: historial, cambios y anulación
-- ============================================================
-- Los reportes se suben a diario (o no) y a fin de mes llega el extracto del
-- mes con todo. Sobre 0103:
--   1. fin_importaciones_pasarela: cada subida queda en un historial (archivo,
--      quién, cuántos nuevos, repetidos, con cambios y con error).
--   2. Un pago que ya estaba pero vuelve con otros datos (la pasarela lo
--      reversó, cambió la comisión…) ya no se ignora en silencio: queda en
--      fin_pagos_pasarela_cambios para que la persona lo acepte o lo
--      descarte. Aceptar actualiza el pago (solo si su cobro no está
--      liquidado); el antes y el después quedan guardados.
--   3. Anular un pago (con motivo): por ejemplo, si se importó en la
--      pasarela equivocada. Deja de contar y de emparejarse; queda en el
--      historial. No se anula un pago cuyo cobro ya se liquidó.

-- ============================================================
-- 1. Historial de importaciones
-- ============================================================
create table fin_importaciones_pasarela (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  cuenta_id uuid not null references fin_cuentas(id),
  perfil text not null,
  nombre_archivo text check (length(nombre_archivo) <= 255),
  total int not null default 0,
  nuevos int not null default 0,
  repetidos int not null default 0,
  cambiados int not null default 0,
  -- Filas que el navegador no pudo leer (no llegaron a la BD).
  con_error int not null default 0,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_fin_importaciones_clinica on fin_importaciones_pasarela (clinica_id, created_at desc);
alter table fin_importaciones_pasarela enable row level security;
create policy "fin_importaciones_pasarela_select" on fin_importaciones_pasarela
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));

-- ============================================================
-- 2. Pagos: importación de origen y anulación
-- ============================================================
alter table fin_pagos_pasarela add column importacion_id uuid references fin_importaciones_pasarela(id);
alter table fin_pagos_pasarela add column anulado boolean not null default false;
alter table fin_pagos_pasarela add column anulado_motivo text check (length(anulado_motivo) <= 500);
alter table fin_pagos_pasarela add column anulado_por uuid references usuarios(id) on delete set null;
alter table fin_pagos_pasarela add column anulado_en timestamptz;
alter table fin_pagos_pasarela add constraint fin_pago_anulado
  check (not anulado or (anulado_motivo is not null and anulado_en is not null and movimiento_id is null));

-- Lo único que cambia de un pago: su emparejamiento, su anulación y, al
-- aceptar un cambio de la pasarela (ewah.pago_cambio = on), sus valores.
create or replace function fn_fin_pago_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_libres text[] := array['movimiento_id', 'emparejado_por', 'emparejado_en', 'anulado', 'anulado_motivo', 'anulado_por', 'anulado_en'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Un pago de la pasarela no se borra: anúlalo.';
  end if;
  if old.anulado then
    raise exception 'El pago está anulado.';
  end if;
  if coalesce(current_setting('ewah.pago_cambio', true), '') = 'on' then
    v_libres := v_libres || array['estado_externo', 'exitoso', 'compra', 'propina', 'valor_total', 'comision', 'retefuente',
      'reteica', 'reteiva', 'total_deduccion', 'deposito', 'tipo_tarjeta', 'franquicia', 'pais_tarjeta', 'canal', 'metodo', 'autorizacion', 'referencia'];
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Un pago de la pasarela no se modifica: solo su emparejamiento, su anulación o un cambio aceptado.';
  end if;
  return new;
end;
$$;

-- ============================================================
-- 3. Cambios detectados al reimportar
-- ============================================================
create table fin_pagos_pasarela_cambios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  pago_id uuid not null references fin_pagos_pasarela(id),
  importacion_id uuid references fin_importaciones_pasarela(id),
  antes jsonb not null,
  despues jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'descartado')),
  resuelto_por uuid references usuarios(id) on delete set null,
  resuelto_en timestamptz,
  created_at timestamptz not null default now()
);

create index idx_fin_pagos_cambios_pendientes on fin_pagos_pasarela_cambios (clinica_id) where estado = 'pendiente';
create unique index fin_pagos_cambios_un_pendiente on fin_pagos_pasarela_cambios (pago_id) where estado = 'pendiente';
create trigger fin_pagos_cambios_auditoria after insert or update on fin_pagos_pasarela_cambios
  for each row execute function fn_auditoria();
alter table fin_pagos_pasarela_cambios enable row level security;
create policy "fin_pagos_cambios_select" on fin_pagos_pasarela_cambios
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));

-- Los datos de un pago que cuentan para detectar un cambio.
create or replace function fn_fin_pago_datos(p fin_pagos_pasarela)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'estado_externo', p.estado_externo, 'exitoso', p.exitoso, 'compra', p.compra, 'propina', p.propina,
    'valor_total', p.valor_total, 'comision', p.comision, 'retefuente', p.retefuente, 'reteica', p.reteica,
    'reteiva', p.reteiva, 'total_deduccion', p.total_deduccion, 'deposito', p.deposito);
$$;

-- ============================================================
-- 4. Importar: historial, nuevos, repetidos y cambios
-- ============================================================
drop function fn_fin_importar_pagos(uuid, text, jsonb);
create function fn_fin_importar_pagos(p_cuenta uuid, p_perfil text, p_pagos jsonb, p_nombre_archivo text default null, p_con_error int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_importacion uuid;
  v_total int;
  v_nuevos int;
  v_cambiados int;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para importar pagos.';
  end if;
  if not has_entitlement('finanzas', 'gestion') then
    raise exception 'Importar el reporte de la pasarela está disponible en el plan Pro.';
  end if;
  if not exists (select 1 from fin_cuentas where id = p_cuenta and clinica_id = v_clinica and tipo = 'pasarela' and activa) then
    raise exception 'Elige una cuenta de pasarela activa.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'El reporte no trae pagos.';
  end if;
  if jsonb_array_length(p_pagos) > 5000 then
    raise exception 'El reporte es muy grande: súbelo por partes (máximo 5.000 pagos).';
  end if;
  if length(btrim(coalesce(p_perfil, ''))) = 0 then
    raise exception 'Falta el formato del reporte.';
  end if;
  v_total := jsonb_array_length(p_pagos);

  insert into fin_importaciones_pasarela (clinica_id, cuenta_id, perfil, nombre_archivo, total, con_error, created_by)
  values (v_clinica, p_cuenta, left(btrim(p_perfil), 40), left(nullif(btrim(coalesce(p_nombre_archivo, '')), ''), 255), v_total,
    greatest(coalesce(p_con_error, 0), 0), auth.uid())
  returning id into v_importacion;

  drop table if exists tmp_pagos_reporte;
  create temp table tmp_pagos_reporte on commit drop as
  select left(btrim(x.id_externo), 100) as id_externo, x.pagado_en, left(coalesce(x.estado_externo, ''), 100) as estado_externo,
    coalesce(x.exitoso, false) as exitoso, round(coalesce(x.compra, 0), 2) as compra, round(coalesce(x.propina, 0), 2) as propina,
    round(coalesce(x.valor_total, 0), 2) as valor_total, round(coalesce(x.comision, 0), 2) as comision,
    round(coalesce(x.retefuente, 0), 2) as retefuente, round(coalesce(x.reteica, 0), 2) as reteica, round(coalesce(x.reteiva, 0), 2) as reteiva,
    round(coalesce(x.total_deduccion, 0), 2) as total_deduccion, round(coalesce(x.deposito, 0), 2) as deposito,
    left(x.tipo_tarjeta, 60) as tipo_tarjeta, left(x.franquicia, 60) as franquicia, left(x.pais_tarjeta, 60) as pais_tarjeta,
    left(x.canal, 60) as canal, left(x.metodo, 80) as metodo, left(x.autorizacion, 60) as autorizacion, left(x.referencia, 200) as referencia
  from jsonb_to_recordset(p_pagos) as x(
    id_externo text, pagado_en timestamp, estado_externo text, exitoso boolean, compra numeric, propina numeric, valor_total numeric,
    comision numeric, retefuente numeric, reteica numeric, reteiva numeric, total_deduccion numeric, deposito numeric,
    tipo_tarjeta text, franquicia text, pais_tarjeta text, canal text, metodo text, autorizacion text, referencia text)
  where x.id_externo is not null and x.pagado_en is not null;

  -- Nuevos.
  with ins as (
    insert into fin_pagos_pasarela (
      clinica_id, cuenta_id, perfil, id_externo, pagado_en, estado_externo, exitoso, compra, propina, valor_total,
      comision, retefuente, reteica, reteiva, total_deduccion, deposito,
      tipo_tarjeta, franquicia, pais_tarjeta, canal, metodo, autorizacion, referencia, importacion_id, created_by)
    select v_clinica, p_cuenta, left(btrim(p_perfil), 40), t.id_externo, t.pagado_en, t.estado_externo, t.exitoso, t.compra, t.propina, t.valor_total,
      t.comision, t.retefuente, t.reteica, t.reteiva, t.total_deduccion, t.deposito,
      t.tipo_tarjeta, t.franquicia, t.pais_tarjeta, t.canal, t.metodo, t.autorizacion, t.referencia, v_importacion, auth.uid()
    from tmp_pagos_reporte t
    on conflict (clinica_id, cuenta_id, id_externo) do nothing
    returning 1
  )
  select count(*) into v_nuevos from ins;

  -- Ya estaban pero con otros datos (y sin un cambio igual ya pendiente).
  with distintos as (
    select p.id as pago_id, fn_fin_pago_datos(p) as antes,
      jsonb_build_object(
        'estado_externo', t.estado_externo, 'exitoso', t.exitoso, 'compra', t.compra, 'propina', t.propina,
        'valor_total', t.valor_total, 'comision', t.comision, 'retefuente', t.retefuente, 'reteica', t.reteica,
        'reteiva', t.reteiva, 'total_deduccion', t.total_deduccion, 'deposito', t.deposito) as despues
    from tmp_pagos_reporte t
    join fin_pagos_pasarela p on p.clinica_id = v_clinica and p.cuenta_id = p_cuenta and p.id_externo = t.id_externo
    where not p.anulado and p.importacion_id is distinct from v_importacion
  ),
  nuevos_cambios as (
    insert into fin_pagos_pasarela_cambios (clinica_id, pago_id, importacion_id, antes, despues)
    select v_clinica, d.pago_id, v_importacion, d.antes, d.despues
    from distintos d
    where d.antes is distinct from d.despues
      and not exists (select 1 from fin_pagos_pasarela_cambios c where c.pago_id = d.pago_id and c.estado = 'pendiente' and c.despues = d.despues)
    on conflict (pago_id) where estado = 'pendiente' do update
      set despues = excluded.despues, importacion_id = excluded.importacion_id, created_at = now()
    returning 1
  )
  select count(*) into v_cambiados from nuevos_cambios;

  update fin_importaciones_pasarela set nuevos = v_nuevos, repetidos = v_total - v_nuevos, cambiados = v_cambiados where id = v_importacion;
  return jsonb_build_object('importacion_id', v_importacion, 'total', v_total, 'nuevos', v_nuevos, 'repetidos', v_total - v_nuevos, 'cambiados', v_cambiados);
end;
$$;

-- ============================================================
-- 5. Aceptar o descartar un cambio
-- ============================================================
create or replace function fn_fin_resolver_cambio_pago(p_cambio uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c fin_pagos_pasarela_cambios%rowtype;
  v_p fin_pagos_pasarela%rowtype;
  v_d jsonb;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para revisar pagos.';
  end if;
  select * into v_c from fin_pagos_pasarela_cambios where id = p_cambio and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cambio no existe.';
  end if;
  if v_c.estado <> 'pendiente' then
    raise exception 'Ese cambio ya se revisó.';
  end if;
  select * into v_p from fin_pagos_pasarela where id = v_c.pago_id for update;

  if p_aceptar then
    if v_p.anulado then
      raise exception 'El pago está anulado.';
    end if;
    if exists (select 1 from fin_movimientos m where m.id = v_p.movimiento_id and m.liquidacion_id is not null and m.estado <> 'anulado') then
      raise exception 'El cobro de este pago ya se liquidó: anula primero esa liquidación en Pasarelas y vuelve a aceptar el cambio.';
    end if;
    v_d := v_c.despues;
    perform set_config('ewah.pago_cambio', 'on', true);
    update fin_pagos_pasarela set
      estado_externo = v_d ->> 'estado_externo', exitoso = (v_d ->> 'exitoso')::boolean,
      compra = (v_d ->> 'compra')::numeric, propina = (v_d ->> 'propina')::numeric, valor_total = (v_d ->> 'valor_total')::numeric,
      comision = (v_d ->> 'comision')::numeric, retefuente = (v_d ->> 'retefuente')::numeric, reteica = (v_d ->> 'reteica')::numeric,
      reteiva = (v_d ->> 'reteiva')::numeric, total_deduccion = (v_d ->> 'total_deduccion')::numeric, deposito = (v_d ->> 'deposito')::numeric,
      -- Si dejó de ser exitoso (reversado), ya no respalda a su cobro.
      movimiento_id = case when (v_d ->> 'exitoso')::boolean then movimiento_id end,
      emparejado_por = case when (v_d ->> 'exitoso')::boolean then emparejado_por end,
      emparejado_en = case when (v_d ->> 'exitoso')::boolean then emparejado_en end
    where id = v_p.id;
    perform set_config('ewah.pago_cambio', '', true);
  end if;

  update fin_pagos_pasarela_cambios
  set estado = case when p_aceptar then 'aceptado' else 'descartado' end, resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_cambio;
end;
$$;

-- ============================================================
-- 6. Anular un pago
-- ============================================================
create or replace function fn_fin_anular_pago(p_pago uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_p fin_pagos_pasarela%rowtype;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para anular pagos.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué se anula el pago (al menos 10 caracteres).';
  end if;
  select * into v_p from fin_pagos_pasarela where id = p_pago and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El pago no existe.';
  end if;
  if v_p.anulado then
    raise exception 'El pago ya está anulado.';
  end if;
  if exists (select 1 from fin_movimientos m where m.id = v_p.movimiento_id and m.liquidacion_id is not null and m.estado <> 'anulado') then
    raise exception 'El cobro de este pago ya se liquidó: anula primero esa liquidación en Pasarelas.';
  end if;
  update fin_pagos_pasarela
  set anulado = true, anulado_motivo = left(btrim(p_motivo), 500), anulado_por = auth.uid(), anulado_en = now(),
    movimiento_id = null, emparejado_por = null, emparejado_en = null
  where id = p_pago;
  update fin_pagos_pasarela_cambios set estado = 'descartado', resuelto_por = auth.uid(), resuelto_en = now()
  where pago_id = p_pago and estado = 'pendiente';
end;
$$;

-- ============================================================
-- 7. Emparejar: los anulados no cuentan
-- ============================================================
create or replace function fn_fin_candidatos_pago(p_pago uuid)
returns table (tipo text, movimiento_id uuid, tratamiento_id uuid, fecha date, valor numeric, descripcion text, paciente text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_p fin_pagos_pasarela%rowtype;
  v_dia date;
  v_nombres boolean;
begin
  if v_clinica is null or not has_permission('finanzas', 'VIEW') then
    return;
  end if;
  select * into v_p from fin_pagos_pasarela where id = p_pago and clinica_id = v_clinica;
  if not found or not v_p.exitoso or v_p.anulado then
    return;
  end if;
  v_dia := v_p.pagado_en::date;
  v_nombres := has_permission('pacientes', 'VIEW') or has_permission('tratamientos', 'VIEW');

  return query
  select 'cobro'::text, m.id, null::uuid, m.fecha, m.monto_original, m.descripcion,
    case when v_nombres then concat_ws(' ', pa.primer_nombre, pa.segundo_nombre, pa.primer_apellido, pa.segundo_apellido) end
  from fin_movimientos m
  left join tratamientos t on m.origen = 'tratamiento' and t.id = m.origen_id
  left join pacientes pa on pa.id = t.paciente_id
  where m.clinica_id = v_clinica and m.cuenta_id = v_p.cuenta_id and m.estado = 'pendiente_abono' and m.tipo = 'ingreso'
    and m.monto_original = v_p.compra
    and m.fecha between v_dia - 15 and v_dia + 2
    and not exists (select 1 from fin_pagos_pasarela o where o.movimiento_id = m.id)
  union all
  select 'tratamiento'::text, null::uuid, t.id, t.fecha, t.costo, tt.nombre,
    case when v_nombres then concat_ws(' ', pa.primer_nombre, pa.segundo_nombre, pa.primer_apellido, pa.segundo_apellido) end
  from fn_fin_tratamientos_situacion(v_clinica) s
  join tratamientos t on t.id = s.tratamiento_id
  join fin_medios_pago mp on mp.medio_pago_id = t.medio_pago_id and mp.cuenta_id = v_p.cuenta_id
  left join tipos_tratamiento tt on tt.id = t.tipo_tratamiento_id
  left join pacientes pa on pa.id = t.paciente_id
  where s.situacion = 'por_confirmar' and t.costo = v_p.compra
    and t.fecha between v_dia - 30 and v_dia
  order by 4, 5;
end;
$$;

create or replace function fn_fin_vincular_pago(p_pago uuid, p_movimiento uuid default null, p_tratamiento uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_p fin_pagos_pasarela%rowtype;
  v_mov uuid;
  v_ok boolean;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para emparejar pagos.';
  end if;
  if (p_movimiento is null) = (p_tratamiento is null) then
    raise exception 'Elige un cobro o un tratamiento.';
  end if;
  select * into v_p from fin_pagos_pasarela where id = p_pago and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El pago no existe.';
  end if;
  if v_p.anulado then
    raise exception 'El pago está anulado.';
  end if;
  if not v_p.exitoso then
    raise exception 'Ese pago no fue exitoso en la pasarela.';
  end if;
  if v_p.movimiento_id is not null and exists (select 1 from fin_movimientos where id = v_p.movimiento_id and estado <> 'anulado') then
    raise exception 'Ese pago ya está emparejado.';
  end if;

  if p_tratamiento is not null then
    select exists (select 1 from fn_fin_candidatos_pago(p_pago) c where c.tratamiento_id = p_tratamiento) into v_ok;
    if not v_ok then
      raise exception 'Ese tratamiento no coincide con el pago (valor, fecha o pasarela).';
    end if;
    v_mov := fn_fin_confirmar_pago(p_tratamiento, greatest(v_p.pagado_en::date, (select fecha from tratamientos where id = p_tratamiento)));
  else
    select exists (select 1 from fn_fin_candidatos_pago(p_pago) c where c.movimiento_id = p_movimiento) into v_ok;
    if not v_ok then
      raise exception 'Ese cobro no coincide con el pago (valor, fecha o pasarela).';
    end if;
    v_mov := p_movimiento;
  end if;

  update fin_pagos_pasarela set movimiento_id = v_mov, emparejado_por = auth.uid(), emparejado_en = now() where id = p_pago;
  return v_mov;
end;
$$;

create or replace function fn_fin_conciliar_pagos(p_cuenta uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_fila record;
  v_emparejados int := 0;
  v_sin int;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para emparejar pagos.';
  end if;
  if not exists (select 1 from fin_cuentas where id = p_cuenta and clinica_id = v_clinica and tipo = 'pasarela') then
    raise exception 'Elige una cuenta de pasarela.';
  end if;

  for v_fila in
    with cands as (
      select p.id as pago, coalesce(c.movimiento_id, c.tratamiento_id)::text as clave, c.movimiento_id as movimiento, c.tratamiento_id as tratamiento
      from fin_pagos_pasarela p
      cross join lateral fn_fin_candidatos_pago(p.id) c
      where p.clinica_id = v_clinica and p.cuenta_id = p_cuenta and p.exitoso and not p.anulado
        and not exists (select 1 from fin_movimientos m where m.id = p.movimiento_id and m.estado <> 'anulado')
    )
    select t.pago, t.movimiento, t.tratamiento from cands t
    where (select count(*) from cands x where x.pago = t.pago) = 1
      and (select count(*) from cands x where x.clave = t.clave) = 1
  loop
    begin
      perform fn_fin_vincular_pago(v_fila.pago, v_fila.movimiento, v_fila.tratamiento);
      v_emparejados := v_emparejados + 1;
    exception when others then
      raise warning 'Flujo de caja: no se emparejó el pago %: %', v_fila.pago, sqlerrm;
    end;
  end loop;

  select count(*) into v_sin from fin_pagos_pasarela p
  where p.clinica_id = v_clinica and p.cuenta_id = p_cuenta and p.exitoso and not p.anulado
    and not exists (select 1 from fin_movimientos m where m.id = p.movimiento_id and m.estado <> 'anulado');
  return jsonb_build_object('emparejados', v_emparejados, 'sin_emparejar', v_sin);
end;
$$;

-- ============================================================
-- 8. Pendientes de abono: avisar si el pago tiene un cambio sin revisar
-- ============================================================
drop function fn_fin_pendientes_pasarela();
create function fn_fin_pendientes_pasarela()
returns table (
  movimiento_id uuid, fecha date, fecha_esperada date, cuenta_id uuid, medio_pago_id uuid, descripcion text,
  bruto numeric, tarifa_id uuid, comision numeric, retefuente numeric, reteica numeric, reteiva numeric, neto numeric,
  pago_id uuid, cambio_pendiente boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.id, m.fecha, m.fecha_esperada, m.cuenta_id, m.medio_pago_id, m.descripcion, m.monto_original,
    case when pp.id is null then t.id end,
    coalesce(pp.comision, d.comision), coalesce(pp.retefuente, d.retefuente), coalesce(pp.reteica, d.reteica), coalesce(pp.reteiva, d.reteiva),
    case when pp.id is null then d.neto else m.monto_original - pp.total_deduccion end,
    pp.id,
    exists (select 1 from fin_pagos_pasarela_cambios c where c.pago_id = pp.id and c.estado = 'pendiente')
  from fin_movimientos m
  left join fin_pagos_pasarela pp on pp.movimiento_id = m.id
  cross join lateral (select * from fn_fin_tarifa_de(m.clinica_id, m.medio_pago_id, m.cuenta_id, m.fecha)) t
  cross join lateral fn_fin_desglose(m.monto_original, t) d
  where m.estado = 'pendiente_abono' and m.clinica_id = clinica_actual()
  order by m.fecha_esperada, m.fecha, m.created_at;
$$;

revoke execute on function fn_fin_pendientes_pasarela() from public, anon;
grant execute on function fn_fin_pendientes_pasarela() to authenticated;
revoke execute on function fn_fin_importar_pagos(uuid, text, jsonb, text, int) from public, anon;
grant execute on function fn_fin_importar_pagos(uuid, text, jsonb, text, int) to authenticated;
revoke execute on function fn_fin_resolver_cambio_pago(uuid, boolean) from public, anon;
grant execute on function fn_fin_resolver_cambio_pago(uuid, boolean) to authenticated;
revoke execute on function fn_fin_anular_pago(uuid, text) from public, anon;
grant execute on function fn_fin_anular_pago(uuid, text) to authenticated;
revoke execute on function fn_fin_pago_datos(fin_pagos_pasarela) from public, anon, authenticated;
