-- ============================================================
-- 0103 · Flujo de caja · Reporte de la pasarela: pagos reales
-- ============================================================
-- La pasarela (Bold, Wompi, PayU…) descarga un reporte con cada pago: su
-- estado, la comisión y las retenciones reales y lo que se deposita. Subirlo
-- permite:
--   1. Saber que el cobro se realizó (pago exitoso).
--   2. Emparejar cada pago con su cobro (o confirmar el tratamiento que
--      esperaba la confirmación, 0102) por valor y fecha.
--   3. Liquidar con la comisión y retenciones REALES de cada pago, no con la
--      estimación de la tarifa: el neto esperado es exacto.
-- No se guarda dato del pagador ni la tarjeta (no hacen falta y son datos
-- personales). Las filas son inmutables salvo el emparejamiento.

-- ============================================================
-- 1. Pagos de la pasarela
-- ============================================================
create table fin_pagos_pasarela (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  cuenta_id uuid not null references fin_cuentas(id),
  perfil text not null check (length(btrim(perfil)) between 1 and 40),
  id_externo text not null check (length(btrim(id_externo)) between 1 and 100),
  -- Hora local de Colombia, tal como la trae el reporte.
  pagado_en timestamp not null,
  estado_externo text not null check (length(estado_externo) <= 100),
  exitoso boolean not null,
  compra numeric(16, 2) not null check (compra >= 0),
  propina numeric(16, 2) not null default 0 check (propina >= 0),
  valor_total numeric(16, 2) not null check (valor_total >= 0),
  -- Comisión de la pasarela: la parte porcentual más la fija (IVA incluido).
  comision numeric(16, 2) not null default 0 check (comision >= 0),
  retefuente numeric(16, 2) not null default 0 check (retefuente >= 0),
  reteica numeric(16, 2) not null default 0 check (reteica >= 0),
  reteiva numeric(16, 2) not null default 0 check (reteiva >= 0),
  total_deduccion numeric(16, 2) not null default 0 check (total_deduccion >= 0),
  deposito numeric(16, 2) not null default 0 check (deposito >= 0),
  tipo_tarjeta text check (length(tipo_tarjeta) <= 60),
  franquicia text check (length(franquicia) <= 60),
  pais_tarjeta text check (length(pais_tarjeta) <= 60),
  canal text check (length(canal) <= 60),
  metodo text check (length(metodo) <= 80),
  autorizacion text check (length(autorizacion) <= 60),
  referencia text check (length(referencia) <= 200),
  -- Cobro del flujo de caja con el que se emparejó.
  movimiento_id uuid references fin_movimientos(id),
  emparejado_por uuid references usuarios(id) on delete set null,
  emparejado_en timestamptz,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (clinica_id, cuenta_id, id_externo),
  constraint fin_pago_deducciones check (
    not exitoso or abs(total_deduccion - (comision + retefuente + reteica + reteiva)) <= 0.05),
  constraint fin_pago_deposito check (
    not exitoso or abs(valor_total - total_deduccion - deposito) <= 0.05)
);

create unique index fin_pagos_pasarela_movimiento on fin_pagos_pasarela (movimiento_id) where movimiento_id is not null;
create index idx_fin_pagos_pasarela_cuenta on fin_pagos_pasarela (clinica_id, cuenta_id, pagado_en desc);

create or replace function fn_fin_pago_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un pago de la pasarela no se borra.';
  end if;
  if (to_jsonb(new) - array['movimiento_id', 'emparejado_por', 'emparejado_en'])
     is distinct from (to_jsonb(old) - array['movimiento_id', 'emparejado_por', 'emparejado_en']) then
    raise exception 'Un pago de la pasarela no se modifica: solo su emparejamiento.';
  end if;
  return new;
end;
$$;

create trigger fin_pagos_pasarela_proteger before update or delete on fin_pagos_pasarela
  for each row execute function fn_fin_pago_proteger();
create trigger fin_pagos_pasarela_auditoria after insert or update on fin_pagos_pasarela
  for each row execute function fn_auditoria();

alter table fin_pagos_pasarela enable row level security;
create policy "fin_pagos_pasarela_select" on fin_pagos_pasarela
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
-- Se escribe solo por fn_fin_importar_pagos y fn_fin_vincular_pago.

-- ============================================================
-- 2. Importar
-- ============================================================
-- p_pagos: arreglo de objetos (el navegador ya leyó el archivo). Los
-- repetidos (mismo id de transacción) se ignoran: se puede volver a subir
-- el mismo reporte sin duplicar.
create or replace function fn_fin_importar_pagos(p_cuenta uuid, p_perfil text, p_pagos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_nuevos int;
  v_total int;
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

  with ins as (
    insert into fin_pagos_pasarela (
      clinica_id, cuenta_id, perfil, id_externo, pagado_en, estado_externo, exitoso, compra, propina, valor_total,
      comision, retefuente, reteica, reteiva, total_deduccion, deposito,
      tipo_tarjeta, franquicia, pais_tarjeta, canal, metodo, autorizacion, referencia, created_by)
    select v_clinica, p_cuenta, left(btrim(p_perfil), 40), left(btrim(x.id_externo), 100), x.pagado_en, left(coalesce(x.estado_externo, ''), 100),
      coalesce(x.exitoso, false), round(coalesce(x.compra, 0), 2), round(coalesce(x.propina, 0), 2), round(coalesce(x.valor_total, 0), 2),
      round(coalesce(x.comision, 0), 2), round(coalesce(x.retefuente, 0), 2), round(coalesce(x.reteica, 0), 2), round(coalesce(x.reteiva, 0), 2),
      round(coalesce(x.total_deduccion, 0), 2), round(coalesce(x.deposito, 0), 2),
      left(x.tipo_tarjeta, 60), left(x.franquicia, 60), left(x.pais_tarjeta, 60), left(x.canal, 60), left(x.metodo, 80),
      left(x.autorizacion, 60), left(x.referencia, 200), auth.uid()
    from jsonb_to_recordset(p_pagos) as x(
      id_externo text, pagado_en timestamp, estado_externo text, exitoso boolean, compra numeric, propina numeric, valor_total numeric,
      comision numeric, retefuente numeric, reteica numeric, reteiva numeric, total_deduccion numeric, deposito numeric,
      tipo_tarjeta text, franquicia text, pais_tarjeta text, canal text, metodo text, autorizacion text, referencia text)
    where x.id_externo is not null and x.pagado_en is not null
    on conflict (clinica_id, cuenta_id, id_externo) do nothing
    returning 1
  )
  select count(*) into v_nuevos from ins;
  return jsonb_build_object('total', v_total, 'nuevos', v_nuevos, 'repetidos', v_total - v_nuevos);
end;
$$;

-- ============================================================
-- 3. Candidatos de un pago
-- ============================================================
-- Cobros pendientes de abono de esa pasarela con el mismo valor y fecha
-- cercana, y tratamientos que esperan la confirmación de esa pasarela.
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
  if not found or not v_p.exitoso then
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

-- ============================================================
-- 4. Emparejar
-- ============================================================
-- Un pago exitoso con un cobro pendiente (p_movimiento) o con un
-- tratamiento que esperaba la confirmación (p_tratamiento): en ese caso se
-- confirma con la fecha del pago.
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

-- Empareja solo lo inequívoco: un pago con un único candidato que ningún
-- otro pago comparte. Lo ambiguo (varios cobros del mismo valor) lo elige
-- la persona. Devuelve cuántos emparejó.
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
      where p.clinica_id = v_clinica and p.cuenta_id = p_cuenta and p.exitoso
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
  where p.clinica_id = v_clinica and p.cuenta_id = p_cuenta and p.exitoso
    and not exists (select 1 from fin_movimientos m where m.id = p.movimiento_id and m.estado <> 'anulado');
  return jsonb_build_object('emparejados', v_emparejados, 'sin_emparejar', v_sin);
end;
$$;

-- ============================================================
-- 5. El neto esperado usa los valores reales del pago
-- ============================================================
-- Si el cobro está emparejado con un pago, la comisión y las retenciones son
-- las reales; si no, siguen siendo la estimación de la tarifa. La
-- liquidación (0097) lee de aquí, así que queda exacta sin otro cambio.
drop function fn_fin_pendientes_pasarela();
create function fn_fin_pendientes_pasarela()
returns table (
  movimiento_id uuid, fecha date, fecha_esperada date, cuenta_id uuid, medio_pago_id uuid, descripcion text,
  bruto numeric, tarifa_id uuid, comision numeric, retefuente numeric, reteica numeric, reteiva numeric, neto numeric,
  pago_id uuid
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
    pp.id
  from fin_movimientos m
  left join fin_pagos_pasarela pp on pp.movimiento_id = m.id
  cross join lateral (select * from fn_fin_tarifa_de(m.clinica_id, m.medio_pago_id, m.cuenta_id, m.fecha)) t
  cross join lateral fn_fin_desglose(m.monto_original, t) d
  where m.estado = 'pendiente_abono' and m.clinica_id = clinica_actual()
  order by m.fecha_esperada, m.fecha, m.created_at;
$$;

revoke execute on function fn_fin_pendientes_pasarela() from public, anon;
grant execute on function fn_fin_pendientes_pasarela() to authenticated;
revoke execute on function fn_fin_importar_pagos(uuid, text, jsonb) from public, anon;
grant execute on function fn_fin_importar_pagos(uuid, text, jsonb) to authenticated;
revoke execute on function fn_fin_candidatos_pago(uuid) from public, anon;
grant execute on function fn_fin_candidatos_pago(uuid) to authenticated;
revoke execute on function fn_fin_vincular_pago(uuid, uuid, uuid) from public, anon;
grant execute on function fn_fin_vincular_pago(uuid, uuid, uuid) to authenticated;
revoke execute on function fn_fin_conciliar_pagos(uuid) from public, anon;
grant execute on function fn_fin_conciliar_pagos(uuid) to authenticated;
revoke execute on function fn_fin_pago_proteger() from public, anon, authenticated;
