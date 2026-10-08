-- ============================================================
-- 0090 · Flujo de caja FC1 · Ajustes de la revisión
-- ============================================================
--   1. Bajar de Pro a Gratis no congela lo que ya existe: el plan se exige
--      al crear cuentas de pasarela/tarjeta y socios, no al editarlos
--      (desactivarlos, renombrarlos).
--   2. Una tarjeta de socio solo se crea para un socio activo.
--   3. Nombres de categoría únicos en lo que ve la clínica (globales con su
--      nombre vigente + propias), sin distinguir mayúsculas ni espacios.
--   4. Las categorías propias de inversión o financiación no se comportan
--      como ingreso o gasto (la contabilidad no las llevará al resultado).
--   5. Cambiar la fecha de inicio exige un motivo y queda en un historial.
--      Fecha mínima: 2000-01-01.
--   6. fn_fin_activar rechaza listas nulas.

-- 1 y 2. Cuentas
create or replace function fn_fin_cuenta_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo in ('pasarela', 'tarjeta_socio') and current_user in ('authenticated', 'anon')
       and not has_entitlement('finanzas', 'gestion') then
      raise exception 'Las cuentas de pasarela y de tarjeta de socio están disponibles en el plan Pro.';
    end if;
    if new.socio_id is not null and not (select activo from fin_socios where id = new.socio_id) then
      raise exception 'El socio está inactivo.';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.tipo <> old.tipo or new.moneda <> old.moneda or new.socio_id is distinct from old.socio_id) then
    raise exception 'Una cuenta no cambia de tipo, moneda ni socio: crea otra y desactiva esta.';
  end if;
  return new;
end;
$$;

drop policy "fin_socios_update" on fin_socios;
create policy "fin_socios_update" on fin_socios
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- 3. Nombres únicos de categoría
create or replace function fn_fin_categoria_clinica_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nombre text;
begin
  if tg_op = 'UPDATE' and (new.categoria_codigo is distinct from old.categoria_codigo
     or (old.categoria_codigo is null and (new.tipo <> old.tipo or new.actividad <> old.actividad))) then
    raise exception 'Una categoría no cambia de tipo ni de actividad: crea otra.';
  end if;
  if new.categoria_codigo is not null then
    if (select automatica from fin_categorias where codigo = new.categoria_codigo) then
      if not new.activa or new.nombre is not null then
        raise exception 'Las categorías automáticas no se renombran ni se desactivan.';
      end if;
    end if;
    new.tipo := null;
    new.actividad := null;
  end if;
  v_nombre := lower(btrim(coalesce(new.nombre, (select nombre from fin_categorias where codigo = new.categoria_codigo))));
  if exists (
    select 1
    from fin_categorias g
    left join fin_categorias_clinica p on p.categoria_codigo = g.codigo and p.clinica_id = new.clinica_id
    where g.codigo is distinct from new.categoria_codigo
      and lower(btrim(coalesce(p.nombre, g.nombre))) = v_nombre
  ) or exists (
    select 1 from fin_categorias_clinica p
    where p.clinica_id = new.clinica_id and p.categoria_codigo is null and p.id <> new.id
      and lower(btrim(p.nombre)) = v_nombre
  ) then
    raise exception 'Ya hay una categoría con ese nombre.';
  end if;
  return new;
end;
$$;

-- 4. Comportamiento de las categorías propias según su actividad
create or replace view v_fin_categorias
with (security_invoker = true) as
select
  coalesce(g.codigo, 'PROPIA_' || c.id::text) as codigo,
  c.id as personalizacion_id,
  coalesce(c.nombre, g.nombre) as nombre,
  g.nombre as nombre_original,
  coalesce(g.tipo, c.tipo) as tipo,
  coalesce(g.actividad, c.actividad) as actividad,
  g.puc_codigo_defecto,
  coalesce(g.comportamiento, case
    when c.actividad = 'financiacion' then 'financiacion'
    when c.actividad = 'inversion' then 'inversion'
    when c.tipo = 'ingreso' then 'ingreso'
    else 'gasto' end) as comportamiento,
  coalesce(g.automatica, false) as automatica,
  coalesce(c.activa, true) as activa,
  coalesce(g.icono, 'tag') as icono,
  coalesce(g.ayuda, 'Categoría propia de la clínica.') as ayuda,
  coalesce(g.orden, 1000) as orden,
  g.codigo is null as propia
from fin_categorias g
-- RLS deja ver solo las filas de la propia clínica.
full join fin_categorias_clinica c on c.categoria_codigo = g.codigo;

-- 5. Fecha de inicio con motivo e historial
alter table fin_config
  add column historial jsonb not null default '[]'::jsonb check (jsonb_typeof(historial) = 'array'),
  -- Campo de paso: el motivo viaja en el UPDATE y el trigger lo archiva.
  add column motivo_cambio text,
  add constraint fin_config_fecha_minima check (fecha_inicio >= date '2000-01-01');

create or replace function fn_fin_config_historial()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.historial is distinct from old.historial then
      raise exception 'El historial de la fecha de inicio no se edita.';
    end if;
    if new.fecha_inicio is distinct from old.fecha_inicio then
      if length(btrim(coalesce(new.motivo_cambio, ''))) < 10 then
        raise exception 'Explica por qué cambias la fecha de inicio (al menos 10 caracteres).';
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

create trigger fin_config_historial before insert or update on fin_config
  for each row execute function fn_fin_config_historial();

-- 6. Activación con listas nulas
create or replace function fn_fin_activar(p_fecha_inicio date, p_cuentas jsonb, p_socios jsonb default '[]'::jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_socios uuid[] := '{}';
  v_id uuid;
  v_s jsonb;
  v_c jsonb;
  v_indice int;
begin
  if v_clinica is null or not has_permission('finanzas', 'EDIT') then
    raise exception 'No tienes permiso para configurar el flujo de caja.';
  end if;
  if exists (select 1 from fin_config where clinica_id = v_clinica) then
    raise exception 'El flujo de caja ya está activado.';
  end if;
  if coalesce(jsonb_typeof(p_cuentas), '') <> 'array' or jsonb_array_length(p_cuentas) = 0 then
    raise exception 'Agrega al menos una cuenta.';
  end if;
  p_socios := coalesce(p_socios, '[]'::jsonb);
  if jsonb_typeof(p_socios) <> 'array' or jsonb_array_length(p_socios) > 20 or jsonb_array_length(p_cuentas) > 30 then
    raise exception 'Datos del asistente inválidos.';
  end if;

  insert into fin_config (clinica_id, fecha_inicio) values (v_clinica, p_fecha_inicio);

  for v_s in select value from jsonb_array_elements(p_socios) loop
    insert into fin_socios (clinica_id, tipo_identificacion_id, numero_identificacion, nombre, porcentaje_participacion)
    values (v_clinica, nullif(v_s ->> 'tipo_identificacion_id', '')::uuid, btrim(v_s ->> 'numero_identificacion'),
            btrim(v_s ->> 'nombre'), nullif(v_s ->> 'porcentaje_participacion', '')::numeric)
    returning id into v_id;
    v_socios := v_socios || v_id;
  end loop;

  for v_c in select value from jsonb_array_elements(p_cuentas) loop
    v_indice := nullif(v_c ->> 'socio_indice', '')::int;
    if v_indice is not null and (v_indice < 0 or v_indice >= coalesce(array_length(v_socios, 1), 0)) then
      raise exception 'La tarjeta apunta a un socio que no existe.';
    end if;
    insert into fin_cuentas (clinica_id, nombre, tipo, moneda, saldo_inicial, socio_id, orden)
    values (v_clinica, btrim(v_c ->> 'nombre'), v_c ->> 'tipo', coalesce(v_c ->> 'moneda', 'COP'),
            coalesce((v_c ->> 'saldo_inicial')::numeric, 0),
            case when v_indice is not null then v_socios[v_indice + 1] end,
            coalesce((v_c ->> 'orden')::int, 0));
  end loop;
end;
$$;

revoke execute on function fn_fin_activar(date, jsonb, jsonb) from public, anon;
grant execute on function fn_fin_activar(date, jsonb, jsonb) to authenticated;
revoke execute on function fn_fin_config_historial() from public, anon, authenticated;
revoke execute on function fn_fin_categoria_clinica_proteger() from public, anon, authenticated;
revoke execute on function fn_fin_cuenta_proteger() from public, anon, authenticated;
