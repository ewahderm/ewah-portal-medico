-- EWAH Tech Platform — Reportes: la analítica admite rangos de varios años.
-- Aplicar con: npx supabase db push --linked
--
-- 0084 limitaba el rango a 366 días y quien pedía el histórico de varios
-- años recibía "El rango máximo del reporte es de 366 días". La consulta
-- agrupa por mes con generate_series y el costo no crece con los años (a lo
-- sumo 120 filas de tendencia), así que el límite sube a 10 años (3.653
-- días contando el primero y el último). Misma firma y mismo tipo de
-- retorno que 0084: create or replace conserva los permisos (revoke/grant).
-- Es la misma definición de 0084 con SOLO la validación del rango cambiada.

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
           t.costo,
           coalesce(tt.id::text, '__sin_tipo__') as tipo_id,
           coalesce(tt.nombre, 'Sin tipo') as tipo_nombre,
           coalesce(u.id::text, '__sin_profesional__') as profesional_id,
           coalesce(u.nombre, 'Sin profesional') as profesional_nombre,
           coalesce(mp.id::text, '__sin_medio_pago__') as pago_id,
           coalesce(mp.nombre, 'Sin medio de pago') as pago_nombre,
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
    left join medios_pago mp
      on mp.id = t.medio_pago_id and mp.clinica_id = t.clinica_id
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

  -- Top 10 por dimensión: el tablero muestra rankings, no listados completos.
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

  -- Países sin límite: el mapa necesita todos los que tengan actividad.
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
