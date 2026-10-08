-- ============================================================
-- 0091 · Flujo de caja FC2 · Movimientos
-- ============================================================
-- Diseño: docs/finanzas/etapa1-flujo-de-caja.md (HU-4, HU-5, HU-10,
-- HU-11, §5 y §6).
--   1. fin_movimientos: ingresos, egresos y transferencias. Inmutables: se
--      corrigen anulando (fn_fin_anular_movimiento crea el movimiento
--      inverso con anula_a y marca el original). Ambos cuentan en los
--      saldos y se anulan entre sí, así el informe de un mes ya pasado no
--      cambia cuando se anula en otro mes.
--   2. Reglas en la BD (no en el cliente): fecha desde el inicio y no
--      futura, cuenta y moneda coherentes, categoría del tipo correcto y
--      activa, valor en COP calculado, socio en préstamos, cuentas de
--      pasarela solo por procesos automáticos (FC4).
--   3. fn_fin_saldos(fecha): saldo por cuenta = saldo inicial + movimientos.
--   4. Bucket privado `finanzas` para los soportes.

create table fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('ingreso', 'egreso', 'transferencia')),
  -- Categoría global o propia de la clínica (exactamente una en ingresos y
  -- egresos; ninguna en transferencias salvo las automáticas).
  categoria_codigo text references fin_categorias(codigo),
  categoria_propia_id uuid references fin_categorias_clinica(id),
  cuenta_id uuid not null references fin_cuentas(id),
  cuenta_destino_id uuid references fin_cuentas(id),
  sede_id uuid references sedes(id),
  tercero_tipo text check (tercero_tipo in ('proveedor', 'paciente', 'socio', 'empleado', 'otro')),
  proveedor_id uuid references proveedores(id),
  socio_id uuid references fin_socios(id),
  tercero_nombre text check (length(btrim(tercero_nombre)) between 1 and 200),
  moneda text not null check (moneda in ('COP', 'USD', 'EUR')),
  monto_original numeric(16, 2) not null check (monto_original > 0),
  tasa_cop numeric(18, 6) not null default 1 check (tasa_cop > 0),
  valor_cop numeric(16, 2) generated always as (round(monto_original * tasa_cop, 2)) stored,
  -- Transferencias: lo que llega a la cuenta destino (en su moneda).
  monto_destino numeric(16, 2) check (monto_destino > 0),
  -- Impuestos capturados (opcionales; la Etapa 1 no los usa para calcular).
  base numeric(16, 2) check (base >= 0),
  iva numeric(16, 2) check (iva >= 0),
  retenciones jsonb check (retenciones is null or jsonb_typeof(retenciones) = 'object'),
  descripcion text check (length(descripcion) <= 500),
  estado text not null default 'registrado' check (estado in ('registrado', 'pendiente_abono', 'por_cobrar', 'anulado')),
  fecha_esperada date,
  origen text not null default 'manual' check (origen in ('manual', 'anulacion', 'tratamiento', 'bold_liquidacion', 'reembolso_socio', 'cierre')),
  origen_id uuid,
  anula_a uuid references fin_movimientos(id),
  anulado_motivo text check (length(anulado_motivo) <= 500),
  anulado_por uuid references usuarios(id) on delete set null,
  anulado_en timestamptz,
  soporte_storage_path text,
  soporte_nombre_archivo text check (length(soporte_nombre_archivo) <= 255),
  -- Compra de activos: nombre y clase para la hoja de vida (Etapa 4).
  datos_activo jsonb check (datos_activo is null or jsonb_typeof(datos_activo) = 'object'),
  tasa_justificacion text check (length(tasa_justificacion) <= 300),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fin_mov_categoria check (
    (tipo = 'transferencia' and categoria_propia_id is null)
    or (tipo <> 'transferencia' and num_nonnulls(categoria_codigo, categoria_propia_id) = 1)
  ),
  constraint fin_mov_transferencia check (
    (tipo = 'transferencia') = (cuenta_destino_id is not null and monto_destino is not null)
    and (cuenta_destino_id is null or cuenta_destino_id <> cuenta_id)
  ),
  constraint fin_mov_tasa_cop check (moneda <> 'COP' or tasa_cop = 1),
  constraint fin_mov_anulacion check ((origen = 'anulacion') = (anula_a is not null)),
  constraint fin_mov_anulado check (estado <> 'anulado' or (anulado_motivo is not null and anulado_en is not null))
);

create index idx_fin_mov_clinica_fecha on fin_movimientos (clinica_id, fecha desc, created_at desc);
create index idx_fin_mov_cuenta on fin_movimientos (cuenta_id);
create index idx_fin_mov_cuenta_destino on fin_movimientos (cuenta_destino_id) where cuenta_destino_id is not null;
create unique index fin_mov_una_anulacion on fin_movimientos (anula_a) where anula_a is not null;
create unique index fin_mov_origen_unico on fin_movimientos (origen, origen_id) where origen_id is not null and origen not in ('manual', 'anulacion');

-- ============================================================
-- Reglas al registrar
-- ============================================================
create or replace function fn_fin_movimiento_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_inicio date;
  v_cuenta fin_cuentas%rowtype;
  v_destino fin_cuentas%rowtype;
  v_cat_tipo text;
  v_cat_comportamiento text;
  v_cat_automatica boolean;
  v_cat_activa boolean;
  v_usuario boolean := current_user in ('authenticated', 'anon');
begin
  select fecha_inicio into v_inicio from fin_config where clinica_id = new.clinica_id;
  if v_inicio is null then
    raise exception 'Primero activa el flujo de caja.';
  end if;
  if new.fecha < v_inicio then
    raise exception 'La fecha es anterior al inicio del flujo de caja (%).', to_char(v_inicio, 'DD/MM/YYYY');
  end if;
  if new.fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha no puede ser futura.';
  end if;

  select * into v_cuenta from fin_cuentas where id = new.cuenta_id and clinica_id = new.clinica_id;
  if not found then
    raise exception 'La cuenta no pertenece a esta clínica.';
  end if;
  if new.origen = 'manual' and not v_cuenta.activa then
    raise exception 'La cuenta "%" está inactiva.', v_cuenta.nombre;
  end if;
  if new.moneda <> v_cuenta.moneda then
    raise exception 'La cuenta "%" es en %: el movimiento debe ir en esa moneda.', v_cuenta.nombre, v_cuenta.moneda;
  end if;

  -- Usos de cada tipo de cuenta en movimientos manuales.
  if new.origen = 'manual' then
    if v_cuenta.tipo = 'pasarela' then
      raise exception 'La pasarela (Bold) se mueve sola: los cobros entran desde los tratamientos y salen al liquidar.';
    end if;
    if v_cuenta.tipo = 'tarjeta_socio' and new.tipo <> 'egreso' then
      raise exception 'Con la tarjeta del socio solo se registran gastos.';
    end if;
  end if;

  if new.tipo = 'transferencia' then
    select * into v_destino from fin_cuentas where id = new.cuenta_destino_id and clinica_id = new.clinica_id;
    if not found then
      raise exception 'La cuenta destino no pertenece a esta clínica.';
    end if;
    if new.origen = 'manual' then
      if not v_destino.activa then
        raise exception 'La cuenta "%" está inactiva.', v_destino.nombre;
      end if;
      if v_destino.tipo in ('pasarela', 'tarjeta_socio') then
        raise exception 'No se transfiere a "%": la pasarela se liquida y al socio se le reembolsa desde su ficha.', v_destino.nombre;
      end if;
    end if;
    if v_destino.moneda = new.moneda and new.monto_destino <> new.monto_original then
      raise exception 'En la misma moneda, lo que sale y lo que llega deben ser iguales.';
    end if;
  end if;

  -- Categoría: existe, es del tipo del movimiento, está activa y (si es
  -- automática) solo la usa un proceso del sistema.
  if new.categoria_codigo is not null then
    select g.tipo, g.comportamiento, g.automatica, coalesce(c.activa, true)
      into v_cat_tipo, v_cat_comportamiento, v_cat_automatica, v_cat_activa
    from fin_categorias g
    left join fin_categorias_clinica c on c.categoria_codigo = g.codigo and c.clinica_id = new.clinica_id
    where g.codigo = new.categoria_codigo;
  elsif new.categoria_propia_id is not null then
    select c.tipo, case c.actividad when 'financiacion' then 'financiacion' when 'inversion' then 'inversion'
                        else case c.tipo when 'ingreso' then 'ingreso' else 'gasto' end end, false, c.activa
      into v_cat_tipo, v_cat_comportamiento, v_cat_automatica, v_cat_activa
    from fin_categorias_clinica c
    where c.id = new.categoria_propia_id and c.clinica_id = new.clinica_id and c.categoria_codigo is null;
    if not found then
      raise exception 'La categoría no pertenece a esta clínica.';
    end if;
  end if;
  if new.tipo <> 'transferencia' or new.categoria_codigo is not null then
    if new.origen = 'manual' then
      if v_cat_automatica then
        raise exception 'Esa categoría la registra el sistema.';
      end if;
      if not v_cat_activa then
        raise exception 'La categoría está desactivada.';
      end if;
      if v_cat_tipo not in (new.tipo, 'ambos') then
        raise exception 'La categoría es de %: no sirve para un %.',
          case v_cat_tipo when 'ingreso' then 'entradas' when 'egreso' then 'salidas' else 'transferencias' end,
          case new.tipo when 'ingreso' then 'ingreso' else 'egreso' end;
      end if;
    end if;
  end if;
  if v_cat_comportamiento = 'prestamo_socio' and new.socio_id is null then
    raise exception 'Elige el socio del préstamo.';
  end if;
  if v_cat_comportamiento in ('prestamo_socio', 'aporte_socio') and v_usuario and not has_entitlement('finanzas', 'gestion') then
    raise exception 'Los préstamos y aportes de socios están disponibles en el plan Pro.';
  end if;
  if v_cuenta.tipo = 'tarjeta_socio' and v_usuario and new.origen = 'manual' and not has_entitlement('finanzas', 'gestion') then
    raise exception 'Los gastos con la tarjeta de un socio están disponibles en el plan Pro.';
  end if;
  if new.socio_id is not null then
    new.tercero_tipo := 'socio';
  end if;
  return new;
end;
$$;

-- Inmutable: solo se pasa a "anulado" (por fn_fin_anular_movimiento) o, en
-- FC4, de pendiente a registrado; nada más cambia.
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
  if (to_jsonb(new) - array['estado', 'anulado_motivo', 'anulado_por', 'anulado_en', 'valor_cop'])
     is distinct from (to_jsonb(old) - array['estado', 'anulado_motivo', 'anulado_por', 'anulado_en', 'valor_cop']) then
    raise exception 'Un movimiento no se modifica: anúlalo y regístralo de nuevo.';
  end if;
  if old.estado = 'anulado' then
    raise exception 'El movimiento ya está anulado.';
  end if;
  return new;
end;
$$;

create trigger fin_movimientos_00_autor before insert or update on fin_movimientos
  for each row execute function fn_hab_forzar_autor();
create trigger fin_movimientos_validar before insert on fin_movimientos
  for each row execute function fn_fin_movimiento_validar();
create trigger fin_movimientos_proteger before update or delete on fin_movimientos
  for each row execute function fn_fin_movimiento_proteger();
create trigger fin_movimientos_sede_misma_clinica before insert on fin_movimientos
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');
create trigger fin_movimientos_proveedor_misma_clinica before insert on fin_movimientos
  for each row execute function fn_hab_misma_clinica('proveedor_id', 'proveedores', 'El proveedor no pertenece a esta clínica.');
create trigger fin_movimientos_socio_misma_clinica before insert on fin_movimientos
  for each row execute function fn_hab_misma_clinica('socio_id', 'fin_socios', 'El socio no pertenece a esta clínica.');
create trigger fin_movimientos_auditoria after insert or update on fin_movimientos
  for each row execute function fn_auditoria();

alter table fin_movimientos enable row level security;
create policy "fin_movimientos_select" on fin_movimientos
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
-- Solo movimientos manuales por la API; los automáticos y las anulaciones
-- los crean funciones del sistema.
create policy "fin_movimientos_insert" on fin_movimientos
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('finanzas', 'CREATE')
    and origen = 'manual' and estado = 'registrado' and anula_a is null
  );
-- Sin políticas de update ni delete.

-- ============================================================
-- Anular (movimiento inverso + marca del original)
-- ============================================================
create or replace function fn_fin_anular_movimiento(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov fin_movimientos%rowtype;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_id uuid;
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
  if v_mov.origen <> 'manual' then
    raise exception 'Este movimiento lo registró el sistema: se anula desde su origen.';
  end if;

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, categoria_propia_id, cuenta_id, cuenta_destino_id, sede_id,
    tercero_tipo, proveedor_id, socio_id, tercero_nombre, moneda, monto_original, tasa_cop, monto_destino,
    descripcion, origen, anula_a, created_by)
  values (
    v_mov.clinica_id, greatest(v_hoy, v_mov.fecha),
    case v_mov.tipo when 'ingreso' then 'egreso' when 'egreso' then 'ingreso' else 'transferencia' end,
    v_mov.categoria_codigo, v_mov.categoria_propia_id,
    -- La transferencia se devuelve: sale de donde llegó y llega a donde salió.
    case when v_mov.tipo = 'transferencia' then v_mov.cuenta_destino_id else v_mov.cuenta_id end,
    case when v_mov.tipo = 'transferencia' then v_mov.cuenta_id end,
    v_mov.sede_id, v_mov.tercero_tipo, v_mov.proveedor_id, v_mov.socio_id, v_mov.tercero_nombre,
    case when v_mov.tipo = 'transferencia' then (select moneda from fin_cuentas where id = v_mov.cuenta_destino_id) else v_mov.moneda end,
    case when v_mov.tipo = 'transferencia' then v_mov.monto_destino else v_mov.monto_original end,
    case when v_mov.tipo = 'transferencia' then
      case when (select moneda from fin_cuentas where id = v_mov.cuenta_destino_id) = 'COP' then 1
           else v_mov.tasa_cop * v_mov.monto_original / v_mov.monto_destino end
      else v_mov.tasa_cop end,
    case when v_mov.tipo = 'transferencia' then v_mov.monto_original end,
    left('Anulación: ' || btrim(p_motivo), 500), 'anulacion', v_mov.id, auth.uid())
  returning id into v_id;

  update fin_movimientos
  set estado = 'anulado', anulado_motivo = left(btrim(p_motivo), 500), anulado_por = auth.uid(), anulado_en = now()
  where id = v_mov.id;
  return v_id;
end;
$$;

-- ============================================================
-- Saldos (invoker: respeta RLS)
-- ============================================================
create or replace function fn_fin_saldos(p_fecha date default null)
returns table (cuenta_id uuid, saldo numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with corte as (select coalesce(p_fecha, (now() at time zone 'America/Bogota')::date) as d),
  efectos as (
    select m.cuenta_id as cuenta, case m.tipo when 'ingreso' then m.monto_original else -m.monto_original end as monto
    from fin_movimientos m, corte where m.fecha <= corte.d
    union all
    select m.cuenta_destino_id, m.monto_destino
    from fin_movimientos m, corte where m.tipo = 'transferencia' and m.fecha <= corte.d
  )
  select c.id, c.saldo_inicial + coalesce((select sum(e.monto) from efectos e where e.cuenta = c.id), 0)
  from fin_cuentas c;
$$;

-- ============================================================
-- Soportes
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finanzas', 'finanzas', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

create policy "finanzas_storage_select" on storage.objects
  for select using (
    bucket_id = 'finanzas' and (storage.foldername(name))[1] = clinica_actual()::text and has_permission('finanzas', 'VIEW')
  );
create policy "finanzas_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'finanzas' and (storage.foldername(name))[1] = clinica_actual()::text and has_permission('finanzas', 'CREATE')
  );

revoke execute on function fn_fin_anular_movimiento(uuid, text) from public, anon;
grant execute on function fn_fin_anular_movimiento(uuid, text) to authenticated;
revoke execute on function fn_fin_saldos(date) from public, anon;
grant execute on function fn_fin_saldos(date) to authenticated;
revoke execute on function fn_fin_movimiento_validar() from public, anon, authenticated;
revoke execute on function fn_fin_movimiento_proteger() from public, anon, authenticated;
