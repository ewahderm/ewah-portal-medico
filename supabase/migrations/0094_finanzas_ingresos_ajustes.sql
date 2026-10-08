-- ============================================================
-- 0094 · Flujo de caja FC3 · Ajustes de la revisión
-- ============================================================
--   1. Un cobro registrado a mano (crédito pagado, pendiente resuelto) se
--      marca (cobro_manual). Si el tratamiento se edita (la app crea el
--      corregido y anula el original), el cobro pasa al corregido en vez
--      de perderse y dejar al paciente "debiendo" lo que ya pagó.
--   2. Si la edición quedó a medias (el corregido existe y el original no
--      se anuló), los dos tendrían ingreso: queda "por revisar".
--   3. Generar el ingreso bloquea el tratamiento (for share): una anulación
--      concurrente espera y anula lo generado.
--   4. La puesta al día sigue con las demás filas si una falla, y las cuenta.
--   5. El nombre del paciente solo llega a quien puede ver pacientes o
--      tratamientos (finanzas sola no es acceso a datos de salud).

-- 1. Marca del cobro manual
alter table fin_movimientos add column cobro_manual boolean not null default false;

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
    new.cobro_manual := false;
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

-- 2. Situación: corregido sin anular
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
  ),
  corregidos as (
    select distinct c.corrige_a as id from tratamientos c
    where c.clinica_id = p_clinica and c.corrige_a is not null and not c.anulado
  )
  select t.id,
    case
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

-- 3. Generar con el tratamiento bloqueado
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
  select p.codigo into v_pais from clinicas cl join paises p on p.id = cl.pais_operacion_id where cl.id = v_t.clinica_id;

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, created_by)
  values (
    v_t.clinica_id, v_t.fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', v_t.costo,
    left(coalesce(v_tipo, 'Tratamiento'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_hab_sumar_dias_habiles(v_t.fecha, 1, coalesce(v_pais, 'CO')) end,
    'tratamiento', v_t.id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 1. Al anular un tratamiento editado, su cobro manual pasa al corregido
-- (si este aún no tiene ingreso). El resto de ingresos se anula como antes.
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
              descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, created_by)
            values (
              v_mov.clinica_id, v_mov.fecha, 'ingreso', v_mov.categoria_codigo, v_mov.cuenta_id,
              (select sede_id from tratamientos where id = v_sucesor), 'paciente', v_mov.moneda, v_mov.monto_original,
              v_mov.descripcion, case when v_mov.estado = 'pendiente_abono' then 'pendiente_abono' else 'registrado' end,
              v_mov.fecha_esperada, 'tratamiento', v_sucesor, true, auth.uid());
          end if;
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

-- 5. Pendientes: el nombre del paciente solo con acceso clínico
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
  with acceso as (
    select has_permission('pacientes', 'VIEW') or has_permission('tratamientos', 'VIEW') as nombres
  )
  select t.id, t.fecha, t.costo, s.situacion, s.movimiento_id,
    t.medio_pago_id, mp.nombre, tt.nombre,
    case when acceso.nombres then concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) end,
    t.sede_id
  from fn_fin_tratamientos_situacion(clinica_actual()) s
  cross join acceso
  join tratamientos t on t.id = s.tratamiento_id
  left join medios_pago mp on mp.id = t.medio_pago_id
  left join tipos_tratamiento tt on tt.id = t.tipo_tratamiento_id
  left join pacientes p on p.id = t.paciente_id
  where clinica_actual() is not null and has_permission('finanzas', 'VIEW')
  order by t.fecha, t.created_at;
$$;

-- 4. Puesta al día fila por fila
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
  v_costo numeric;
  v_generados int := 0;
  v_valor numeric := 0;
  v_anulados int := 0;
  v_fallidos int := 0;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para registrar ingresos.';
  end if;
  if not exists (select 1 from fin_config where clinica_id = v_clinica) then
    raise exception 'Primero activa el flujo de caja.';
  end if;
  for v_fila in select * from fn_fin_tratamientos_situacion(v_clinica) where situacion in ('por_generar', 'anulado_con_ingreso') loop
    begin
      if v_fila.situacion = 'por_generar' then
        if fn_fin_ingreso_de_tratamiento(v_fila.tratamiento_id) is not null then
          select costo into v_costo from tratamientos where id = v_fila.tratamiento_id;
          v_generados := v_generados + 1;
          v_valor := v_valor + v_costo;
        end if;
      else
        select * into v_mov from fin_movimientos where id = v_fila.movimiento_id for update;
        if v_mov.estado <> 'anulado' then
          perform fn_fin_anular_registro(v_mov, 'Tratamiento anulado: puesta al día del flujo de caja');
          v_anulados := v_anulados + 1;
        end if;
      end if;
    exception when others then
      v_fallidos := v_fallidos + 1;
      raise warning 'Flujo de caja: no se puso al día el tratamiento %: %', v_fila.tratamiento_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('generados', v_generados, 'valor', v_valor, 'anulados', v_anulados, 'fallidos', v_fallidos);
end;
$$;

-- 1. El cobro manual queda marcado
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
    descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, created_by)
  values (
    v_clinica, p_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_t.sede_id, 'paciente', 'COP', round(p_monto, 2),
    left('Cobro: ' || coalesce(v_tipo, 'Tratamiento') || ' del ' || to_char(v_t.fecha, 'DD/MM/YYYY'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_hab_sumar_dias_habiles(p_fecha, 1, coalesce(v_pais, 'CO')) end,
    'tratamiento', v_t.id, true, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Búsqueda de correcciones (corrige_a) sin recorrer la tabla.
create index if not exists tratamientos_corrige_a_idx on tratamientos (corrige_a) where corrige_a is not null;

revoke execute on function fn_fin_tratamientos_situacion(uuid, uuid) from public, anon, authenticated;
revoke execute on function fn_fin_ingreso_de_tratamiento(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_tratamiento_sincronizar() from public, anon, authenticated;
revoke execute on function fn_fin_movimiento_sanear() from public, anon, authenticated;
