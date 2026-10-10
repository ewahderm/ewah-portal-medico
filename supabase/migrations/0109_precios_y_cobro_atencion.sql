-- ============================================================
-- 0109 · Precio de los tratamientos y cobro por atención
-- ============================================================
-- Decisiones del usuario (2026-10-10):
--   * Cada tipo de tratamiento tiene un precio con historial y fecha
--     "vigente desde" (se puede programar un aumento). Al registrar un
--     tratamiento el precio se propone solo, pero se puede cambiar.
--   * El tratamiento guarda su precio (costo) y lo que realmente se cobró por
--     él (valor_cobrado). El análisis de ventas por tratamiento usa lo cobrado.
--   * El paciente paga la ATENCIÓN, no cada tratamiento: el cobro (medio de
--     pago y valor) vive en la atención, con un botón "Cobrar atención". El
--     descuento se reparte entre los tratamientos y cada valor se ajusta.
--   * El flujo de caja genera UN ingreso por cobro, y la pasarela concilia
--     contra ese total (un pago de Bold = el total de la atención).
--
-- Compatibilidad (para no tocar los ingresos reales ya registrados):
--   * Un tratamiento registrado CON medio de pago (los antiguos, importados o
--     por la API) se cobra solo: se crea un cobro de un solo tratamiento cuyo
--     id ES el id del tratamiento. Como los ingresos se enlazan por
--     fin_movimientos.origen_id, los ingresos que ya existen quedan enlazados
--     a su cobro sin modificar ninguna fila. El valor de origen sigue siendo
--     'tratamiento' (= ingreso por servicios de salud); origen_id ahora es el
--     id del cobro.
--   * Anular un tratamiento que es el único de su cobro anula el cobro (y su
--     ingreso), como antes. Si el cobro tiene otros tratamientos, primero se
--     anula el cobro. Editar (anular + corregido) traspasa el cobro al
--     registro corregido.

-- ============================================================
-- 1. Precios con historial
-- ============================================================
create table precios_tratamiento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo_tratamiento_id uuid not null references tipos_tratamiento(id) on delete cascade,
  valor numeric(14,2) not null check (valor >= 0),
  vigente_desde date not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index precios_tratamiento_tipo_idx on precios_tratamiento (tipo_tratamiento_id, vigente_desde desc, created_at desc);

create or replace function fn_precio_autor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function fn_precio_autor() from public, anon, authenticated;

create trigger precios_tratamiento_00_autor before insert on precios_tratamiento
  for each row execute function fn_precio_autor();
create trigger precios_tratamiento_misma_clinica before insert on precios_tratamiento
  for each row execute function fn_hab_misma_clinica('tipo_tratamiento_id', 'tipos_tratamiento', 'El tipo de tratamiento no pertenece a esta clínica.');

alter table precios_tratamiento enable row level security;
create policy "precios_tratamiento_select" on precios_tratamiento
  for select to authenticated using (clinica_id = clinica_actual());
create policy "precios_tratamiento_insert" on precios_tratamiento
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('parametros', 'EDIT'));
-- Sin update ni delete: el historial es de solo agregar. Un error se
-- corrige con un precio nuevo.

-- Precio que regía para un tipo en una fecha (el último registrado para
-- la vigencia más reciente que no sea posterior a la fecha).
create or replace function fn_precio_vigente(p_tipo uuid, p_fecha date)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select valor from precios_tratamiento
  where tipo_tratamiento_id = p_tipo and vigente_desde <= p_fecha
  order by vigente_desde desc, created_at desc
  limit 1;
$$;

-- ============================================================
-- 2. Cobro de la atención
-- ============================================================
create table cobros_atencion (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  atencion_id uuid not null references atenciones(id),
  fecha date not null,
  medio_pago_id uuid not null references medios_pago(id),
  -- Lo que se cobró. Solo es null en un cobro automático de un tratamiento
  -- sin valor (queda "sin valor" en finanzas).
  valor numeric(14,2) check (valor >= 0),
  sede_id uuid references sedes(id),
  notas text check (notas is null or length(notas) <= 500),
  -- Creado solo a partir de un tratamiento con medio de pago (legado/API).
  automatico boolean not null default false,
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_por uuid references usuarios(id) on delete set null,
  anulado_en timestamptz,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index cobros_atencion_atencion_idx on cobros_atencion (atencion_id);
create index cobros_atencion_clinica_fecha_idx on cobros_atencion (clinica_id, fecha);

-- Detalle histórico: qué tratamientos cubrió y por cuánto cada uno. Es de
-- solo agregar; el cobro vigente de un tratamiento es tratamientos.cobro_id.
create table cobros_atencion_items (
  cobro_id uuid not null references cobros_atencion(id) on delete cascade deferrable initially deferred,
  tratamiento_id uuid not null references tratamientos(id),
  valor numeric(14,2) check (valor >= 0),
  primary key (cobro_id, tratamiento_id)
);

create index cobros_atencion_items_tratamiento_idx on cobros_atencion_items (tratamiento_id);

-- El medio de pago pasa al cobro: el tratamiento ya no lo exige (los que
-- lo traen se cobran solos, ver abajo).
alter table tratamientos alter column medio_pago_id drop not null;
alter table tratamientos add column valor_cobrado numeric(14,2) check (valor_cobrado >= 0);
alter table tratamientos add column cobro_id uuid references cobros_atencion(id) deferrable initially deferred;
create index tratamientos_cobro_id_idx on tratamientos (cobro_id);

-- ============================================================
-- 3. Traspaso del legado (antes de crear los disparadores)
-- ============================================================
-- Sin auditoría fila a fila: es la puesta en marcha del modelo.
alter table tratamientos disable trigger tratamientos_auditoria;

update tratamientos set valor_cobrado = costo where valor_cobrado is null and costo is not null;

-- Un cobro automático por cada tratamiento con medio de pago, con su mismo id.
insert into cobros_atencion (id, clinica_id, atencion_id, fecha, medio_pago_id, valor, sede_id, automatico,
  anulado, anulado_motivo, anulado_por, anulado_en, created_by, created_at)
select t.id, t.clinica_id, t.atencion_id, t.fecha, t.medio_pago_id, t.costo, t.sede_id, true,
  t.anulado, t.anulado_motivo, t.anulado_por, t.anulado_en, t.created_by, t.created_at
from tratamientos t
where t.medio_pago_id is not null;

insert into cobros_atencion_items (cobro_id, tratamiento_id, valor)
select t.id, t.id, t.costo from tratamientos t where t.medio_pago_id is not null;

update tratamientos set cobro_id = id where medio_pago_id is not null and not anulado;

alter table tratamientos enable trigger tratamientos_auditoria;

-- Exclusiones del flujo: ahora por cobro (mismo id en el legado).
create table fin_cobros_excluidos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  cobro_id uuid not null unique references cobros_atencion(id) on delete cascade,
  motivo text not null check (length(btrim(motivo)) between 10 and 500),
  activa boolean not null default true,
  reincluido_por uuid references usuarios(id) on delete set null,
  reincluido_en timestamptz,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index idx_fin_cobros_excluidos_clinica on fin_cobros_excluidos (clinica_id) where activa;

insert into fin_cobros_excluidos (id, clinica_id, cobro_id, motivo, activa, reincluido_por, reincluido_en,
  created_by, created_at, updated_by, updated_at)
select x.id, x.clinica_id, x.tratamiento_id, x.motivo, x.activa, x.reincluido_por, x.reincluido_en,
  x.created_by, x.created_at, x.updated_by, x.updated_at
from fin_tratamientos_excluidos x
where exists (select 1 from cobros_atencion c where c.id = x.tratamiento_id);

create trigger fin_cobros_excluidos_00_autor before insert or update on fin_cobros_excluidos
  for each row execute function fn_hab_forzar_autor();
create trigger fin_cobros_excluidos_misma_clinica before insert on fin_cobros_excluidos
  for each row execute function fn_hab_misma_clinica('cobro_id', 'cobros_atencion', 'El cobro no pertenece a esta clínica.');
create trigger fin_cobros_excluidos_set_updated_at before update on fin_cobros_excluidos
  for each row execute function set_updated_at();
create trigger fin_cobros_excluidos_auditoria after insert or update on fin_cobros_excluidos
  for each row execute function fn_auditoria();

alter table fin_cobros_excluidos enable row level security;
create policy "fin_cobros_excluidos_select" on fin_cobros_excluidos
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));

-- El modelo anterior deja de usarse.
drop trigger tratamientos_flujo_caja on tratamientos;
drop function fn_fin_tratamiento_sincronizar();
drop function fn_fin_ingresos_pendientes();
drop function fn_fin_generar_ingresos();
drop function fn_fin_registrar_cobro(uuid, uuid, date, numeric);
drop function fn_fin_excluir_tratamiento(uuid, text);
drop function fn_fin_reincluir_tratamiento(uuid);
drop function fn_fin_tratamientos_flujo(text);
drop function fn_fin_confirmar_pago(uuid, date);
drop function fn_fin_conciliar_pagos(uuid);
drop function fn_fin_vincular_pago(uuid, uuid, uuid);
drop function fn_fin_candidatos_pago(uuid);
drop function fn_fin_ingreso_de_tratamiento(uuid);
drop function fn_fin_tratamientos_situacion(uuid, uuid);
drop table fin_tratamientos_excluidos;

-- ============================================================
-- 4. Reglas del cobro y del tratamiento
-- ============================================================
alter table cobros_atencion enable row level security;
alter table cobros_atencion_items enable row level security;
create policy "cobros_atencion_select" on cobros_atencion
  for select to authenticated using (
    clinica_id = clinica_actual() and (has_permission('tratamientos', 'VIEW') or has_permission('finanzas', 'VIEW')));
create policy "cobros_atencion_items_select" on cobros_atencion_items
  for select to authenticated using (
    exists (select 1 from cobros_atencion c where c.id = cobro_id and c.clinica_id = clinica_actual())
    and (has_permission('tratamientos', 'VIEW') or has_permission('finanzas', 'VIEW')));
-- Se escriben solo por las funciones de abajo (security definer).

-- Un cobro no se modifica: solo se anula (o se reactiva su anulación,
-- cuando se revierte la del único tratamiento de un cobro automático).
create or replace function fn_cobro_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cobro no se borra: anúlalo.';
  end if;
  if (to_jsonb(new) - array['anulado', 'anulado_motivo', 'anulado_por', 'anulado_en'])
     is distinct from (to_jsonb(old) - array['anulado', 'anulado_motivo', 'anulado_por', 'anulado_en']) then
    raise exception 'Un cobro no se modifica: anúlalo y cobra de nuevo.';
  end if;
  return new;
end;
$$;
revoke execute on function fn_cobro_proteger() from public, anon, authenticated;

create trigger cobros_atencion_proteger before update or delete on cobros_atencion
  for each row execute function fn_cobro_proteger();
create trigger cobros_atencion_auditoria after insert or update on cobros_atencion
  for each row execute function fn_auditoria();

-- Al insertar un tratamiento: lo cobrado arranca igual al precio, y si
-- viene con medio de pago se cobra solo (cobro con su mismo id). El
-- cobro_id que mande quien inserta se ignora.
create or replace function fn_tratamientos_preparar_cobro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.valor_cobrado := coalesce(new.valor_cobrado, new.costo);
  new.cobro_id := case when new.medio_pago_id is not null then new.id end;
  return new;
end;
$$;
revoke execute on function fn_tratamientos_preparar_cobro() from public, anon, authenticated;

create trigger tratamientos_preparar_cobro before insert on tratamientos
  for each row execute function fn_tratamientos_preparar_cobro();

create or replace function fn_tratamientos_cobro_automatico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cobro_id is not null and new.cobro_id = new.id then
    -- El detalle primero (la llave al cobro se revisa al final de la
    -- transacción): el ingreso se genera al insertar el cobro y su
    -- descripción sale del detalle.
    insert into cobros_atencion_items (cobro_id, tratamiento_id, valor) values (new.id, new.id, new.valor_cobrado);
    insert into cobros_atencion (id, clinica_id, atencion_id, fecha, medio_pago_id, valor, sede_id, automatico, created_by)
    values (new.id, new.clinica_id, new.atencion_id, new.fecha, new.medio_pago_id, new.valor_cobrado, new.sede_id, true, auth.uid());
  end if;
  return null;
end;
$$;
revoke execute on function fn_tratamientos_cobro_automatico() from public, anon, authenticated;

create trigger tratamientos_cobro_automatico after insert on tratamientos
  for each row execute function fn_tratamientos_cobro_automatico();

-- Inmutabilidad + el cobro al anular o revertir la anulación.
-- valor_cobrado y cobro_id solo cambian dentro de las funciones de cobro
-- (marca de sesión ewah.cobro) o aquí mismo al anular/revertir.
create or replace function fn_tratamientos_solo_anular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otros int;
  v_sucesor boolean;
  v_cobro cobros_atencion%rowtype;
  v_en_cobro boolean := coalesce(current_setting('ewah.cobro', true), '') = 'si';
begin
  if new.clinica_id is distinct from old.clinica_id
    or new.paciente_id is distinct from old.paciente_id
    or new.tipo_tratamiento_id is distinct from old.tipo_tratamiento_id
    or new.profesional_id is distinct from old.profesional_id
    or new.fecha is distinct from old.fecha
    or new.edad_paciente is distinct from old.edad_paciente
    or new.costo is distinct from old.costo
    or new.notas is distinct from old.notas
    or new.corrige_a is distinct from old.corrige_a
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.sede_id is distinct from old.sede_id
    or new.consultorio_id is distinct from old.consultorio_id
    or new.medio_pago_id is distinct from old.medio_pago_id
    or new.cufe is distinct from old.cufe
    or new.atencion_id is distinct from old.atencion_id
    or (not v_en_cobro and new.valor_cobrado is distinct from old.valor_cobrado)
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;

  if old.anulado = true and new.anulado = false and not es_admin() then
    raise exception 'Solo un administrador puede revertir la anulación de un tratamiento.';
  end if;

  -- Anular un tratamiento que está en un cobro vigente.
  if new.anulado and not old.anulado and old.cobro_id is not null then
    select exists (
      select 1 from tratamientos s
      where s.corrige_a = old.id and not s.anulado and s.cobro_id = old.cobro_id
    ) into v_sucesor;
    if not v_sucesor then
      select count(*) into v_otros from tratamientos
      where cobro_id = old.cobro_id and id <> old.id and not anulado;
      if v_otros > 0 then
        raise exception 'Este tratamiento hace parte del cobro de la atención junto con otros: anula primero ese cobro para poder anularlo.';
      end if;
      -- Era el único: el cobro se anula con él (y su ingreso, en finanzas).
      update cobros_atencion
      set anulado = true,
          anulado_motivo = 'Tratamiento anulado: ' || coalesce(nullif(btrim(new.anulado_motivo), ''), 'sin motivo'),
          anulado_por = coalesce(new.anulado_por, auth.uid()), anulado_en = now()
      where id = old.cobro_id and not anulado;
    end if;
    new.cobro_id := null;
    return new;
  end if;

  -- Revertir la anulación: un cobro automático de solo este tratamiento
  -- vuelve a quedar vigente.
  if old.anulado and not new.anulado and old.cobro_id is null then
    select * into v_cobro from cobros_atencion where id = old.id and automatico and anulado;
    if found and not exists (
      select 1 from tratamientos x where x.cobro_id = v_cobro.id and x.id <> old.id
    ) then
      update cobros_atencion set anulado = false, anulado_motivo = null, anulado_por = null, anulado_en = null
      where id = v_cobro.id;
      new.cobro_id := v_cobro.id;
    end if;
    return new;
  end if;

  if not v_en_cobro and new.cobro_id is distinct from old.cobro_id then
    raise exception 'El cobro de un tratamiento se registra desde la atención.';
  end if;
  return new;
end;
$$;

-- ============================================================
-- 5. Cobrar, anular el cobro y traspasarlo al corregido
-- ============================================================
-- p_items: [{"tratamiento_id": "...", "valor": 120000}, ...] — los
-- tratamientos vigentes de la atención que aún no tienen cobro.
create or replace function fn_cobrar_atencion(p_atencion uuid, p_fecha date, p_medio uuid, p_items jsonb, p_notas text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_a atenciones%rowtype;
  v_id uuid := gen_random_uuid();
  v_item record;
  v_total numeric := 0;
  v_n int := 0;
  v_sede uuid;
begin
  if v_clinica is null or not has_permission('tratamientos', 'CREATE') then
    raise exception 'No tienes permiso para cobrar atenciones.';
  end if;
  select * into v_a from atenciones where id = p_atencion and clinica_id = v_clinica for update;
  if not found then
    raise exception 'La atención no existe.';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha del cobro no puede ser futura.';
  end if;
  if p_medio is null or not exists (select 1 from medios_pago where id = p_medio and clinica_id = v_clinica and activo) then
    raise exception 'Elige un medio de pago válido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay tratamientos para cobrar.';
  end if;

  perform set_config('ewah.cobro', 'si', true);
  for v_item in
    select (e ->> 'tratamiento_id')::uuid as tratamiento_id, (e ->> 'valor')::numeric as valor
    from jsonb_array_elements(p_items) e
  loop
    if v_item.valor is null or v_item.valor < 0 then
      raise exception 'Cada tratamiento necesita un valor cobrado (0 o más).';
    end if;
    update tratamientos set cobro_id = v_id, valor_cobrado = round(v_item.valor, 2)
    where id = v_item.tratamiento_id and atencion_id = p_atencion and clinica_id = v_clinica
      and not anulado and cobro_id is null
    returning sede_id into v_sede;
    if not found then
      raise exception 'Uno de los tratamientos ya se cobró, se anuló o no es de esta atención. Vuelve a abrir la atención.';
    end if;
    insert into cobros_atencion_items (cobro_id, tratamiento_id, valor) values (v_id, v_item.tratamiento_id, round(v_item.valor, 2));
    v_total := v_total + round(v_item.valor, 2);
    v_n := v_n + 1;
  end loop;
  perform set_config('ewah.cobro', '', true);

  insert into cobros_atencion (id, clinica_id, atencion_id, fecha, medio_pago_id, valor, sede_id, notas, created_by)
  values (v_id, v_clinica, p_atencion, p_fecha, p_medio, v_total, coalesce(v_a.sede_id, v_sede),
    nullif(left(btrim(coalesce(p_notas, '')), 500), ''), auth.uid());
  return v_id;
end;
$$;

create or replace function fn_anular_cobro_atencion(p_cobro uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c cobros_atencion%rowtype;
begin
  if v_clinica is null or not has_permission('tratamientos', 'VOID') then
    raise exception 'No tienes permiso para anular cobros.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué se anula el cobro (al menos 10 caracteres).';
  end if;
  select * into v_c from cobros_atencion where id = p_cobro and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cobro no existe.';
  end if;
  if v_c.anulado then
    raise exception 'El cobro ya está anulado.';
  end if;
  perform set_config('ewah.cobro', 'si', true);
  update tratamientos set cobro_id = null where cobro_id = p_cobro;
  perform set_config('ewah.cobro', '', true);
  update cobros_atencion
  set anulado = true, anulado_motivo = left(btrim(p_motivo), 500), anulado_por = auth.uid(), anulado_en = now()
  where id = p_cobro;
end;
$$;

-- Editar un tratamiento ya cobrado: el corregido entra al mismo cobro con
-- el mismo valor cobrado (lo pagado no cambia); luego se anula el original.
create or replace function fn_tratamiento_reemplazar_en_cobro(p_original uuid, p_nuevo uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_o tratamientos%rowtype;
  v_n tratamientos%rowtype;
begin
  if v_clinica is null or not has_permission('tratamientos', 'CREATE') then
    raise exception 'No tienes permiso para registrar tratamientos.';
  end if;
  select * into v_o from tratamientos where id = p_original and clinica_id = v_clinica for update;
  select * into v_n from tratamientos where id = p_nuevo and clinica_id = v_clinica for update;
  if v_o.id is null or v_n.id is null or v_n.corrige_a is distinct from v_o.id or v_n.atencion_id <> v_o.atencion_id then
    raise exception 'El registro corregido no corresponde al original.';
  end if;
  if v_o.cobro_id is null or v_n.cobro_id is not null or v_n.anulado then
    return;
  end if;
  perform set_config('ewah.cobro', 'si', true);
  update tratamientos set cobro_id = v_o.cobro_id, valor_cobrado = v_o.valor_cobrado where id = v_n.id;
  perform set_config('ewah.cobro', '', true);
  insert into cobros_atencion_items (cobro_id, tratamiento_id, valor) values (v_o.cobro_id, v_n.id, v_o.valor_cobrado)
  on conflict do nothing;
end;
$$;

revoke execute on function fn_cobrar_atencion(uuid, date, uuid, jsonb, text) from public, anon;
grant execute on function fn_cobrar_atencion(uuid, date, uuid, jsonb, text) to authenticated;
revoke execute on function fn_anular_cobro_atencion(uuid, text) from public, anon;
grant execute on function fn_anular_cobro_atencion(uuid, text) to authenticated;
revoke execute on function fn_tratamiento_reemplazar_en_cobro(uuid, uuid) from public, anon;
grant execute on function fn_tratamiento_reemplazar_en_cobro(uuid, uuid) to authenticated;

-- ============================================================
-- 6. Finanzas por cobro
-- ============================================================
-- Nombres de los tratamientos de un cobro, para la descripción del ingreso.
create or replace function fn_fin_cobro_descripcion(p_cobro uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(string_agg(coalesce(tt.nombre, 'Tratamiento'), ' + ' order by t.created_at), 'Tratamiento')
  from cobros_atencion_items i
  join tratamientos t on t.id = i.tratamiento_id
  left join tipos_tratamiento tt on tt.id = t.tipo_tratamiento_id
  where i.cobro_id = p_cobro
    -- Si se corrigió dentro del mismo cobro, cuenta solo el corregido.
    and not exists (
      select 1 from cobros_atencion_items i2 join tratamientos s on s.id = i2.tratamiento_id
      where i2.cobro_id = p_cobro and s.corrige_a = t.id);
$$;

-- Situación de los cobros frente al flujo de caja (misma lógica que antes
-- por tratamiento, ahora por cobro):
--   por_generar, por_confirmar, por_cobrar, sin_valor, medio_sin_cuenta,
--   fecha_futura, anulado_con_ingreso, anulado_liquidado, corregido_sin_anular.
create or replace function fn_fin_cobros_situacion(p_clinica uuid, p_cobro uuid default null)
returns table (cobro_id uuid, situacion text, movimiento_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (select fecha_inicio from fin_config where clinica_id = p_clinica),
  vivos as (
    select m.origen_id, m.id, m.liquidacion_id from fin_movimientos m
    where m.clinica_id = p_clinica and m.origen = 'tratamiento' and m.estado <> 'anulado'
      and (p_cobro is null or m.origen_id = p_cobro)
  ),
  -- Cobros cuyo tratamiento tiene un corregido vigente con OTRO cobro: los
  -- dos contarían como ingreso hasta que se anule el original.
  corregidos as (
    select distinct o.cobro_id as id from tratamientos o
    join tratamientos s on s.corrige_a = o.id and not s.anulado and s.cobro_id is not null and s.cobro_id <> o.cobro_id
    where o.clinica_id = p_clinica and not o.anulado and o.cobro_id is not null
  )
  select c.id,
    case
      when c.anulado and v.liquidacion_id is not null then 'anulado_liquidado'
      when c.anulado then 'anulado_con_ingreso'
      when v.id is not null then 'corregido_sin_anular'
      when c.valor is null then 'sin_valor'
      when c.fecha > (now() at time zone 'America/Bogota')::date then 'fecha_futura'
      when mp.es_credito then 'por_cobrar'
      when cu.id is null or not cu.activa then 'medio_sin_cuenta'
      when mp.requiere_confirmacion and cu.tipo = 'pasarela' then 'por_confirmar'
      else 'por_generar'
    end,
    v.id
  from cobros_atencion c
  cross join cfg
  left join vivos v on v.origen_id = c.id
  left join fin_medios_pago mp on mp.medio_pago_id = c.medio_pago_id
  left join fin_cuentas cu on cu.id = mp.cuenta_id
  where c.clinica_id = p_clinica
    and (p_cobro is null or c.id = p_cobro)
    and not exists (select 1 from fin_cobros_excluidos x where x.cobro_id = c.id and x.activa)
    and (
      (c.anulado and v.id is not null)
      or (not c.anulado and v.id is null and c.fecha >= cfg.fecha_inicio and coalesce(c.valor, -1) <> 0)
      or (not c.anulado and v.id is not null and c.id in (select id from corregidos))
    );
$$;

-- Atenciones con tratamientos vigentes que nadie ha cobrado (desde el inicio
-- del flujo de caja; las cortesías en 0 no cuentan).
create or replace function fn_fin_atenciones_sin_cobrar(p_clinica uuid)
returns table (atencion_id uuid, fecha date, valor numeric, paciente_id uuid, sede_id uuid, tratamientos text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, max(t.fecha), sum(coalesce(t.valor_cobrado, t.costo, 0)), a.paciente_id,
    coalesce(a.sede_id, min(t.sede_id::text)::uuid),
    string_agg(coalesce(tt.nombre, 'Tratamiento'), ' + ' order by t.created_at)
  from tratamientos t
  join atenciones a on a.id = t.atencion_id
  join fin_config cfg on cfg.clinica_id = p_clinica
  left join tipos_tratamiento tt on tt.id = t.tipo_tratamiento_id
  where t.clinica_id = p_clinica and not t.anulado and t.cobro_id is null and t.fecha >= cfg.fecha_inicio
  group by a.id, a.paciente_id, a.sede_id
  having sum(coalesce(t.valor_cobrado, t.costo, 0)) > 0;
$$;

create or replace function fn_fin_ingreso_de_cobro(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c cobros_atencion%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_id uuid;
  v_fecha date;
begin
  select * into v_c from cobros_atencion where id = p_id for share;
  if not found then
    return null;
  end if;
  if not exists (select 1 from fn_fin_cobros_situacion(v_c.clinica_id, p_id) s where s.situacion = 'por_generar') then
    return null;
  end if;
  select cu.* into v_cuenta from fin_medios_pago mp join fin_cuentas cu on cu.id = mp.cuenta_id
  where mp.medio_pago_id = v_c.medio_pago_id;
  v_fecha := fn_fin_fecha_abierta(v_c.clinica_id, v_c.fecha);

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, medio_pago_id, created_by)
  values (
    v_c.clinica_id, v_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_c.sede_id, 'paciente', 'COP', v_c.valor,
    left(fn_fin_cobro_descripcion(v_c.id) || case when v_fecha <> v_c.fecha then ' (cobro del ' || to_char(v_c.fecha, 'DD/MM/YYYY') || ', mes cerrado)' else '' end, 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_fin_fecha_abono(v_c.clinica_id, v_c.medio_pago_id, v_cuenta.id, v_fecha) end,
    'tratamiento', v_c.id, v_c.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Disparador en cobros: nace, se anula o se reactiva.
create or replace function fn_fin_cobro_sincronizar()
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
          -- Un cobro registrado a mano pasa al cobro del tratamiento corregido.
          if v_mov.cobro_manual then
            select s.cobro_id into v_sucesor
            from cobros_atencion_items i
            join tratamientos s on s.corrige_a = i.tratamiento_id and not s.anulado and s.cobro_id is not null and s.cobro_id <> new.id
            where i.cobro_id = new.id
              and not exists (select 1 from fin_movimientos m where m.origen = 'tratamiento' and m.origen_id = s.cobro_id and m.estado <> 'anulado')
            order by s.created_at desc limit 1;
          end if;
          continue when v_liquidada and v_sucesor is null;
          perform fn_fin_anular_registro(v_mov,
            case when v_sucesor is not null then 'Tratamiento corregido: el cobro pasa al registro corregido'
                 else coalesce(nullif(btrim(new.anulado_motivo), ''), 'Cobro anulado') end);
          if v_sucesor is not null then
            insert into fin_movimientos (
              clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
              descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, medio_pago_id, liquidacion_id, created_by)
            values (
              v_mov.clinica_id, fn_fin_fecha_abierta(v_mov.clinica_id, v_mov.fecha), 'ingreso', v_mov.categoria_codigo, v_mov.cuenta_id,
              (select sede_id from cobros_atencion where id = v_sucesor), 'paciente', v_mov.moneda, v_mov.monto_original,
              v_mov.descripcion,
              case when v_liquidada then 'registrado'
                   when (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela' then 'pendiente_abono'
                   else 'registrado' end,
              case when (select tipo from fin_cuentas where id = v_mov.cuenta_id) = 'pasarela'
                   then coalesce(v_mov.fecha_esperada, v_mov.fecha) end,
              'tratamiento', v_sucesor, true, v_mov.medio_pago_id, v_mov.liquidacion_id, auth.uid());
          end if;
        end loop;
      end if;
    elsif tg_op = 'INSERT' or old.anulado then
      perform fn_fin_ingreso_de_cobro(new.id);
    end if;
  exception when others then
    -- Lo clínico se guarda igual: queda en "por revisar".
    raise warning 'Flujo de caja: no se sincronizó el cobro %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger cobros_atencion_flujo_caja after insert or update of anulado on cobros_atencion
  for each row execute function fn_fin_cobro_sincronizar();

-- Lo pendiente para la pantalla de cobros: los cobros que piden atención y
-- las atenciones sin cobrar (situación 'sin_cobrar', sin cobro_id).
create or replace function fn_fin_ingresos_pendientes()
returns table (
  cobro_id uuid, atencion_id uuid, fecha date, valor numeric, situacion text, movimiento_id uuid,
  medio_pago_id uuid, medio_pago text, tratamiento text, paciente text, sede_id uuid, paciente_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with acceso as (
    select has_permission('pacientes', 'VIEW') or has_permission('tratamientos', 'VIEW') as nombres
  )
  select * from (
    select c.id, c.atencion_id, c.fecha, c.valor, s.situacion, s.movimiento_id,
      c.medio_pago_id, mp.nombre, fn_fin_cobro_descripcion(c.id),
      case when acceso.nombres then concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) end,
      c.sede_id, case when acceso.nombres then a.paciente_id end
    from fn_fin_cobros_situacion(clinica_actual()) s
    cross join acceso
    join cobros_atencion c on c.id = s.cobro_id
    join atenciones a on a.id = c.atencion_id
    left join medios_pago mp on mp.id = c.medio_pago_id
    left join pacientes p on p.id = a.paciente_id
    union all
    select null::uuid, x.atencion_id, x.fecha, x.valor, 'sin_cobrar', null::uuid, null::uuid, null::text, x.tratamientos,
      case when acceso.nombres then concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) end,
      x.sede_id, case when acceso.nombres then x.paciente_id end
    from fn_fin_atenciones_sin_cobrar(clinica_actual()) x
    cross join acceso
    left join pacientes p on p.id = x.paciente_id
  ) r
  where clinica_actual() is not null and has_permission('finanzas', 'VIEW')
  order by 3;
$$;

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
  v_valor_c numeric;
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
  for v_fila in select * from fn_fin_cobros_situacion(v_clinica) where situacion in ('por_generar', 'anulado_con_ingreso') loop
    begin
      if v_fila.situacion = 'por_generar' then
        if fn_fin_ingreso_de_cobro(v_fila.cobro_id) is not null then
          select valor into v_valor_c from cobros_atencion where id = v_fila.cobro_id;
          v_generados := v_generados + 1;
          v_valor := v_valor + v_valor_c;
        end if;
      else
        select * into v_mov from fin_movimientos where id = v_fila.movimiento_id for update;
        if v_mov.estado <> 'anulado' then
          perform fn_fin_anular_registro(v_mov, 'Cobro anulado: puesta al día del flujo de caja');
          v_anulados := v_anulados + 1;
        end if;
      end if;
    exception when others then
      v_fallidos := v_fallidos + 1;
      raise warning 'Flujo de caja: no se puso al día el cobro %: %', v_fila.cobro_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('generados', v_generados, 'valor', v_valor, 'anulados', v_anulados, 'fallidos', v_fallidos);
end;
$$;

-- Registrar a mano lo que llegó de un cobro (crédito o resolver a mano).
create or replace function fn_fin_registrar_cobro(p_cobro uuid, p_cuenta uuid, p_fecha date, p_monto numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c cobros_atencion%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_id uuid;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para registrar ingresos.';
  end if;
  if p_cobro is null or p_cuenta is null or p_fecha is null or p_monto is null then
    raise exception 'Faltan datos del cobro.';
  end if;
  if p_monto <= 0 then
    raise exception 'El valor cobrado debe ser mayor que cero.';
  end if;
  select * into v_c from cobros_atencion where id = p_cobro and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cobro no existe.';
  end if;
  if v_c.anulado then
    raise exception 'El cobro está anulado.';
  end if;
  if exists (select 1 from fin_cobros_excluidos where cobro_id = v_c.id and activa) then
    raise exception 'Este cobro está excluido del flujo de caja: vuelve a incluirlo para registrar su ingreso.';
  end if;
  if exists (select 1 from fin_movimientos where origen = 'tratamiento' and origen_id = v_c.id and estado <> 'anulado') then
    raise exception 'Este cobro ya tiene su ingreso registrado.';
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

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, cobro_manual, medio_pago_id, created_by)
  values (
    v_clinica, p_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_c.sede_id, 'paciente', 'COP', round(p_monto, 2),
    left('Cobro: ' || fn_fin_cobro_descripcion(v_c.id) || ' del ' || to_char(v_c.fecha, 'DD/MM/YYYY'), 500),
    case when v_cuenta.tipo = 'pasarela' then 'pendiente_abono' else 'registrado' end,
    case when v_cuenta.tipo = 'pasarela' then fn_fin_fecha_abono(v_clinica, v_c.medio_pago_id, v_cuenta.id, p_fecha) end,
    'tratamiento', v_c.id, true, v_c.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function fn_fin_excluir_cobro(p_cobro uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c cobros_atencion%rowtype;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para excluir cobros del flujo de caja.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué no entra al flujo de caja (al menos 10 caracteres).';
  end if;
  select * into v_c from cobros_atencion where id = p_cobro and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cobro no existe.';
  end if;
  if exists (select 1 from fin_movimientos where origen = 'tratamiento' and origen_id = v_c.id and estado <> 'anulado') then
    raise exception 'Este cobro ya tiene su ingreso en el flujo de caja: anula primero ese ingreso.';
  end if;
  insert into fin_cobros_excluidos (clinica_id, cobro_id, motivo)
  values (v_clinica, v_c.id, left(btrim(p_motivo), 500))
  on conflict (cobro_id) do update
    set motivo = excluded.motivo, activa = true, reincluido_por = null, reincluido_en = null
    where fin_cobros_excluidos.activa = false;
  if not found then
    raise exception 'Este cobro ya está excluido del flujo de caja.';
  end if;
end;
$$;

create or replace function fn_fin_reincluir_cobro(p_cobro uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if clinica_actual() is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para incluir cobros en el flujo de caja.';
  end if;
  update fin_cobros_excluidos
  set activa = false, reincluido_por = auth.uid(), reincluido_en = now()
  where cobro_id = p_cobro and clinica_id = clinica_actual() and activa;
  if not found then
    raise exception 'Este cobro no está excluido del flujo de caja.';
  end if;
end;
$$;

-- Los que ya entraron al flujo ('en_flujo', los 200 más recientes) y los
-- excluidos ('excluidos').
create or replace function fn_fin_cobros_flujo(p_vista text)
returns table (
  cobro_id uuid, atencion_id uuid, fecha date, valor numeric, situacion text, movimiento_id uuid,
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
    select c.id as cid, c.atencion_id as aid, c.fecha as cfecha, c.valor as cvalor, c.created_at as ccreado,
      case when p_vista = 'excluidos' then 'excluido' else 'en_flujo' end as sit,
      m.id as mov, x.motivo as mot, c.medio_pago_id as mpid, c.sede_id as csede
    from cobros_atencion c
    left join lateral (
      select id from fin_movimientos
      where origen = 'tratamiento' and origen_id = c.id and estado <> 'anulado' limit 1
    ) m on true
    left join fin_cobros_excluidos x on x.cobro_id = c.id and x.activa
    where c.clinica_id = clinica_actual()
      and ((p_vista = 'excluidos' and x.id is not null)
        or (p_vista = 'en_flujo' and not c.anulado and m.id is not null))
  )
  select b.cid, b.aid, b.cfecha, b.cvalor, b.sit, b.mov, b.mpid, mp.nombre, fn_fin_cobro_descripcion(b.cid),
    case when acceso.nombres then concat_ws(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) end,
    b.csede, b.mot
  from base b
  cross join acceso
  join atenciones a on a.id = b.aid
  left join medios_pago mp on mp.id = b.mpid
  left join pacientes p on p.id = a.paciente_id
  where clinica_actual() is not null and has_permission('finanzas', 'VIEW')
    and p_vista in ('en_flujo', 'excluidos')
  order by b.cfecha desc, b.ccreado desc
  limit 200;
$$;

create or replace function fn_fin_confirmar_pago(p_cobro uuid, p_fecha date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid := clinica_actual();
  v_c cobros_atencion%rowtype;
  v_cuenta fin_cuentas%rowtype;
  v_inicio date;
  v_fecha date;
  v_id uuid;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if v_clinica is null or not has_permission('finanzas', 'CREATE') then
    raise exception 'No tienes permiso para confirmar pagos.';
  end if;
  if p_cobro is null or p_fecha is null then
    raise exception 'Faltan datos de la confirmación.';
  end if;
  select * into v_c from cobros_atencion where id = p_cobro and clinica_id = v_clinica for update;
  if not found then
    raise exception 'El cobro no existe.';
  end if;
  select fecha_inicio into v_inicio from fin_config where clinica_id = v_clinica;
  if v_inicio is null then
    raise exception 'Primero activa el flujo de caja.';
  end if;
  if not exists (select 1 from fn_fin_cobros_situacion(v_clinica, p_cobro) s where s.situacion = 'por_confirmar') then
    raise exception 'Este cobro no está esperando la confirmación de una pasarela.';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha del pago no puede ser futura.';
  end if;
  if p_fecha < v_c.fecha then
    raise exception 'El pago no puede ser anterior al cobro.';
  end if;
  if p_fecha < v_inicio then
    raise exception 'La fecha es anterior al inicio del flujo de caja.';
  end if;
  select cu.* into v_cuenta from fin_medios_pago mp join fin_cuentas cu on cu.id = mp.cuenta_id
  where mp.medio_pago_id = v_c.medio_pago_id;
  v_fecha := fn_fin_fecha_abierta(v_clinica, p_fecha);

  insert into fin_movimientos (
    clinica_id, fecha, tipo, categoria_codigo, cuenta_id, sede_id, tercero_tipo, moneda, monto_original,
    descripcion, estado, fecha_esperada, origen, origen_id, medio_pago_id, created_by)
  values (
    v_clinica, v_fecha, 'ingreso', 'SERVICIOS_SALUD', v_cuenta.id, v_c.sede_id, 'paciente', 'COP', v_c.valor,
    left(fn_fin_cobro_descripcion(v_c.id) || case when v_fecha <> p_fecha then ' (pago del ' || to_char(p_fecha, 'DD/MM/YYYY') || ', mes cerrado)' else '' end, 500),
    'pendiente_abono',
    fn_fin_fecha_abono(v_clinica, v_c.medio_pago_id, v_cuenta.id, v_fecha),
    'tratamiento', v_c.id, v_c.medio_pago_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Candidatos de un pago de la pasarela: el total de cada cobro (no el de un
-- tratamiento suelto). tipo 'cobro' = ingreso pendiente de abono;
-- 'confirmacion' = cobro que espera la confirmación de la pasarela.
create or replace function fn_fin_candidatos_pago(p_pago uuid)
returns table (tipo text, movimiento_id uuid, cobro_id uuid, fecha date, valor numeric, descripcion text, paciente text)
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
  left join cobros_atencion c on m.origen = 'tratamiento' and c.id = m.origen_id
  left join atenciones a on a.id = c.atencion_id
  left join pacientes pa on pa.id = a.paciente_id
  where m.clinica_id = v_clinica and m.cuenta_id = v_p.cuenta_id and m.estado = 'pendiente_abono' and m.tipo = 'ingreso'
    and m.monto_original = v_p.compra
    and m.fecha between v_dia - 15 and v_dia + 2
    and not exists (select 1 from fin_pagos_pasarela o where o.movimiento_id = m.id)
  union all
  select 'confirmacion'::text, null::uuid, c.id, c.fecha, c.valor, fn_fin_cobro_descripcion(c.id),
    case when v_nombres then concat_ws(' ', pa.primer_nombre, pa.segundo_nombre, pa.primer_apellido, pa.segundo_apellido) end
  from fn_fin_cobros_situacion(v_clinica) s
  join cobros_atencion c on c.id = s.cobro_id
  join fin_medios_pago mp on mp.medio_pago_id = c.medio_pago_id and mp.cuenta_id = v_p.cuenta_id
  join atenciones a on a.id = c.atencion_id
  left join pacientes pa on pa.id = a.paciente_id
  where s.situacion = 'por_confirmar' and c.valor = v_p.compra
    and c.fecha between v_dia - 30 and v_dia
  order by 4, 5;
end;
$$;

create or replace function fn_fin_vincular_pago(p_pago uuid, p_movimiento uuid default null, p_cobro uuid default null)
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
  if (p_movimiento is null) = (p_cobro is null) then
    raise exception 'Elige un ingreso o un cobro por confirmar.';
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

  if p_cobro is not null then
    select exists (select 1 from fn_fin_candidatos_pago(p_pago) c where c.cobro_id = p_cobro) into v_ok;
    if not v_ok then
      raise exception 'Ese cobro no coincide con el pago (valor, fecha o pasarela).';
    end if;
    v_mov := fn_fin_confirmar_pago(p_cobro, greatest(v_p.pagado_en::date, (select fecha from cobros_atencion where id = p_cobro)));
  else
    select exists (select 1 from fn_fin_candidatos_pago(p_pago) c where c.movimiento_id = p_movimiento) into v_ok;
    if not v_ok then
      raise exception 'Ese ingreso no coincide con el pago (valor, fecha o pasarela).';
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
      select p.id as pago, coalesce(c.movimiento_id, c.cobro_id)::text as clave, c.movimiento_id as movimiento, c.cobro_id as cobro
      from fin_pagos_pasarela p
      cross join lateral fn_fin_candidatos_pago(p.id) c
      where p.clinica_id = v_clinica and p.cuenta_id = p_cuenta and p.exitoso and not p.anulado
        and not exists (select 1 from fin_movimientos m where m.id = p.movimiento_id and m.estado <> 'anulado')
    )
    select t.pago, t.movimiento, t.cobro from cands t
    where (select count(*) from cands x where x.pago = t.pago) = 1
      and (select count(*) from cands x where x.clave = t.clave) = 1
  loop
    begin
      perform fn_fin_vincular_pago(v_fila.pago, v_fila.movimiento, v_fila.cobro);
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

-- Alertas: "por revisar" cuenta cobros y atenciones sin cobrar.
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
    select 'fin_bold_vencido'::text as tipo, m.id, coalesce(m.fecha_esperada, m.fecha) as fecha,
      'Cobro con pasarela sin abonar'::text as titulo,
      'Se esperaba el ' || to_char(coalesce(m.fecha_esperada, m.fecha), 'DD/MM/YYYY') || ': ' || to_char(m.monto_original, 'FM999,999,999,990') || ' COP' as detalle,
      '/finanzas/bold'::text as ruta
    from fin_movimientos m, hoy, pais
    where m.clinica_id = p_clinica_id and m.estado = 'pendiente_abono'
      and fn_hab_sumar_dias_habiles(coalesce(m.fecha_esperada, m.fecha), 2, pais.codigo) < hoy.d
    union all
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
    select 'fin_por_revisar', md5(p_clinica_id::text || to_char(hoy.d, 'IYYY-IW'))::uuid, hoy.d,
      'Ingresos por revisar', r.n || ' cobros o atenciones necesitan atención para entrar al flujo de caja.', '/finanzas/cobros'
    from hoy, (
      select (select count(*) from fn_fin_cobros_situacion(p_clinica_id) where situacion not in ('por_cobrar', 'fecha_futura'))
        + (select count(*) from fn_fin_atenciones_sin_cobrar(p_clinica_id)) as n
    ) r
    where r.n > 0
  )
  select i.tipo, i.id, array[0], i.fecha, (i.fecha - hoy.d)::int, i.titulo, i.detalle, i.ruta
  from items i, hoy
  where not exists (
    select 1 from fin_alertas_enviadas a where a.objeto_tipo = i.tipo and a.objeto_id = i.id and a.umbral_dias = 0
  );
$$;

-- Permisos de las funciones.
revoke execute on function fn_precio_vigente(uuid, date) from public, anon;
grant execute on function fn_precio_vigente(uuid, date) to authenticated;
revoke execute on function fn_fin_cobro_descripcion(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_cobros_situacion(uuid, uuid) from public, anon, authenticated;
revoke execute on function fn_fin_atenciones_sin_cobrar(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_ingreso_de_cobro(uuid) from public, anon, authenticated;
revoke execute on function fn_fin_cobro_sincronizar() from public, anon, authenticated;
revoke execute on function fn_tratamientos_solo_anular() from public, anon, authenticated;
revoke execute on function fn_fin_ingresos_pendientes() from public, anon;
grant execute on function fn_fin_ingresos_pendientes() to authenticated;
revoke execute on function fn_fin_generar_ingresos() from public, anon;
grant execute on function fn_fin_generar_ingresos() to authenticated;
revoke execute on function fn_fin_registrar_cobro(uuid, uuid, date, numeric) from public, anon;
grant execute on function fn_fin_registrar_cobro(uuid, uuid, date, numeric) to authenticated;
revoke execute on function fn_fin_excluir_cobro(uuid, text) from public, anon;
grant execute on function fn_fin_excluir_cobro(uuid, text) to authenticated;
revoke execute on function fn_fin_reincluir_cobro(uuid) from public, anon;
grant execute on function fn_fin_reincluir_cobro(uuid) to authenticated;
revoke execute on function fn_fin_cobros_flujo(text) from public, anon;
grant execute on function fn_fin_cobros_flujo(text) to authenticated;
revoke execute on function fn_fin_confirmar_pago(uuid, date) from public, anon;
grant execute on function fn_fin_confirmar_pago(uuid, date) to authenticated;
revoke execute on function fn_fin_candidatos_pago(uuid) from public, anon;
grant execute on function fn_fin_candidatos_pago(uuid) to authenticated;
revoke execute on function fn_fin_vincular_pago(uuid, uuid, uuid) from public, anon;
grant execute on function fn_fin_vincular_pago(uuid, uuid, uuid) to authenticated;
revoke execute on function fn_fin_conciliar_pagos(uuid) from public, anon;
grant execute on function fn_fin_conciliar_pagos(uuid) to authenticated;
revoke execute on function fn_fin_alertas_pendientes(uuid, date) from public, anon, authenticated;
grant execute on function fn_fin_alertas_pendientes(uuid, date) to service_role;

-- ============================================================
-- 7. Analítica: ventas por lo cobrado y medio de pago del cobro
-- ============================================================
create or replace function fn_reportes_analitica_clinica(p_desde date, p_hasta date)
returns table (
  dimension text,
  periodo date,
  clave text,
  nombre text,
  pais_iso text,
  cantidad bigint,
  cantidad_con_valor bigint,
  valor_registrado numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
begin
  if not has_permission('reportes', 'VIEW')
    or not has_permission('tratamientos', 'VIEW')
    or not has_permission('pacientes', 'VIEW') then
    raise exception 'Para consultar esta analítica necesitas permisos de Reportes, Tratamientos y Pacientes.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if p_hasta - p_desde > 3652 then
    raise exception 'El rango máximo del reporte es de 10 años.';
  end if;

  return query
  with filtrados as (
    select t.fecha,
           -- Lo cobrado por el tratamiento (con su parte del descuento); si
           -- no se registró, el precio.
           coalesce(t.valor_cobrado, t.costo) as costo,
           coalesce(tt.id::text, '__sin_tipo__') as tipo_id,
           coalesce(tt.nombre, 'Sin tipo') as tipo_nombre,
           coalesce(u.id::text, '__sin_profesional__') as profesional_id,
           coalesce(u.nombre, 'Sin profesional') as profesional_nombre,
           coalesce(mp.id::text, '__sin_medio_pago__') as pago_id,
           coalesce(mp.nombre, 'Sin cobrar') as pago_nombre,
           case
             when trim(coalesce(pa.codigo, '')) ~* '^[A-Z]{2}$' and nullif(trim(pa.nombre), '') is not null
               then trim(pa.nombre)
             else 'Sin país informado'
           end as pais_nombre,
           case
             when trim(coalesce(pa.codigo, '')) ~* '^[A-Z]{2}$' and nullif(trim(pa.nombre), '') is not null
               then upper(trim(pa.codigo))
             else '__sin_pais__'
           end as pais_clave,
           case
             when trim(coalesce(pa.codigo, '')) ~* '^[A-Z]{2}$' and nullif(trim(pa.nombre), '') is not null
               then upper(trim(pa.codigo))
             else null
           end as pais_iso
    from tratamientos t
    left join pacientes px
      on px.id = t.paciente_id and px.clinica_id = t.clinica_id
    left join paises pa on pa.id = px.pais_residencia_id
    left join tipos_tratamiento tt
      on tt.id = t.tipo_tratamiento_id and tt.clinica_id = t.clinica_id
    left join usuarios u
      on u.id = t.profesional_id and u.clinica_id = t.clinica_id
    left join cobros_atencion ca on ca.id = t.cobro_id
    left join medios_pago mp
      on mp.id = coalesce(ca.medio_pago_id, t.medio_pago_id) and mp.clinica_id = t.clinica_id
    where t.clinica_id = v_clinica_id
      and t.anulado = false
      and t.fecha >= p_desde
      and t.fecha <= p_hasta
  ),
  meses as (
    select generate_series(
      date_trunc('month', p_desde::timestamp),
      date_trunc('month', p_hasta::timestamp),
      interval '1 month'
    )::date as mes
  )
  select 'resumen'::text, null::date, 'total'::text, 'Todo el periodo'::text, null::text,
         count(*)::bigint, count(f.costo)::bigint, coalesce(sum(f.costo), 0)::numeric
  from filtrados f

  union all

  select 'mes'::text, m.mes, to_char(m.mes, 'YYYY-MM'), to_char(m.mes, 'YYYY-MM'), null::text,
         count(f.fecha)::bigint, count(f.costo)::bigint, coalesce(sum(f.costo), 0)::numeric
  from meses m
  left join filtrados f on date_trunc('month', f.fecha)::date = m.mes
  group by m.mes

  union all

  select 'tratamiento'::text, null::date, x.tipo_id, x.tipo_nombre, null::text,
         x.cantidad, x.con_valor, x.valor
  from (
    select f.tipo_id, min(f.tipo_nombre) as tipo_nombre, count(*)::bigint as cantidad,
           count(f.costo)::bigint as con_valor, coalesce(sum(f.costo), 0)::numeric as valor
    from filtrados f
    group by f.tipo_id
    order by count(*) desc, coalesce(sum(f.costo), 0) desc, min(f.tipo_nombre)
    limit 10
  ) x

  union all

  select 'profesional'::text, null::date, x.profesional_id, x.profesional_nombre, null::text,
         x.cantidad, x.con_valor, x.valor
  from (
    select f.profesional_id, min(f.profesional_nombre) as profesional_nombre, count(*)::bigint as cantidad,
           count(f.costo)::bigint as con_valor, coalesce(sum(f.costo), 0)::numeric as valor
    from filtrados f
    group by f.profesional_id
    order by count(*) desc, coalesce(sum(f.costo), 0) desc, min(f.profesional_nombre)
    limit 10
  ) x

  union all

  select 'medio_pago'::text, null::date, x.pago_id, x.pago_nombre, null::text,
         x.cantidad, x.con_valor, x.valor
  from (
    select f.pago_id, min(f.pago_nombre) as pago_nombre, count(*)::bigint as cantidad,
           count(f.costo)::bigint as con_valor, coalesce(sum(f.costo), 0)::numeric as valor
    from filtrados f
    group by f.pago_id
    order by count(*) desc, coalesce(sum(f.costo), 0) desc, min(f.pago_nombre)
    limit 10
  ) x

  union all

  select 'pais'::text, null::date, x.pais_clave, x.pais_nombre, x.pais_iso,
         x.cantidad, x.con_valor, x.valor
  from (
    select f.pais_clave, min(f.pais_nombre) as pais_nombre, min(f.pais_iso) as pais_iso,
           count(*)::bigint as cantidad,
           count(f.costo)::bigint as con_valor, coalesce(sum(f.costo), 0)::numeric as valor
    from filtrados f
    group by f.pais_clave
  ) x;
end;
$$;
