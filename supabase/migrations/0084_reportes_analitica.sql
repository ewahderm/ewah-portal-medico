-- ============================================================
-- 0084 · Reportes · Analítica clínica agregada
-- ============================================================
--   1. Módulo `reportes` en RBAC y en todos los planes + VIEW para los
--      Administradores existentes. La descarga en Excel (INVIMA) no usa un
--      permiso EXPORT: exportar es exclusivo del Administrador
--      (lib/exportar/acceso.ts), así que no se siembra.
--   2. fn_modulos_nav_visibles(): códigos de módulo que el menú puede
--      mostrar a la sesión actual.
--   3. fn_reportes_analitica_clinica(desde, hasta): agregados SIN datos
--      personales (cantidad, cantidad con valor y valor registrado) por
--      mes, tipo de tratamiento, profesional, medio de pago y país de
--      residencia del paciente. Una sola tabla "larga" (columna
--      `dimension`) para no hacer seis viajes; lib/reportes/analitica.ts
--      la reparte.
--      Tipos, profesionales y medios de pago se agrupan por id, no por
--      nombre: dos profesionales homónimos no deben sumarse en una fila.
--      `clave` es ese id (o el ISO del país, o "AAAA-MM" del mes); los
--      grupos sin dato usan una clave explícita '__sin_...__' para que la
--      suma de cada lista cuadre con el resumen.
-- Datos de prueba: scripts/habilitacion/bd-local/rp1-*.sql.

-- ============================================================
-- 1. RBAC y plan
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('reportes', 'Reportes', 'Analítica agregada de tratamientos y valor registrado por periodo.', '/reportes', 17, true)
on conflict (codigo) do nothing;

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p cross join modulos m
where m.codigo = 'reportes'
on conflict do nothing;

do $$
declare v record;
begin
  for v in select id from clinicas loop
    perform fn_sync_clinica_modulos(v.id);
  end loop;
end $$;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where r.nivel = 1
  and m.codigo = 'reportes'
  and p.codigo = 'VIEW'
on conflict do nothing;

-- ============================================================
-- 2. Módulos visibles en el menú
-- ============================================================
-- security definer: recorre el catálogo `modulos` completo y pregunta
-- has_permission() por cada uno; el resultado son solo códigos de módulo,
-- nunca filas de la clínica.
create or replace function fn_modulos_nav_visibles()
returns table (codigo text)
language sql
stable
security definer
set search_path = public
as $$
  select m.codigo
  from modulos m
  where auth.uid() is not null
    and clinica_actual() is not null
    and (es_admin() or has_permission(m.codigo, 'VIEW'));
$$;

revoke all on function fn_modulos_nav_visibles() from public, anon, authenticated;
grant execute on function fn_modulos_nav_visibles() to authenticated;

-- ============================================================
-- 3. Analítica clínica
-- ============================================================
-- security definer: los totales deben salir completos para la clínica.
-- Con el cliente de sesión, la RLS de pacientes/usuarios/catálogos podría
-- ocultar filas de los joins y el reporte cuadraría mal en silencio. A
-- cambio, la función hace a mano lo que haría la RLS: exige los permisos
-- de Reportes, Tratamientos y Pacientes, fija el tenant con
-- clinica_actual() y cada join exige el mismo clinica_id del tratamiento.
-- Solo devuelve agregados (sin nombres de pacientes ni documentos).
-- El tipo de retorno cambió frente a borradores anteriores de esta
-- migración (codigo → clave), y create or replace no puede cambiarlo.
drop function if exists fn_reportes_analitica_clinica(date, date);

create function fn_reportes_analitica_clinica(p_desde date, p_hasta date)
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
  if p_hasta - p_desde > 365 then
    raise exception 'El rango máximo del reporte es de 366 días.';
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

comment on function fn_reportes_analitica_clinica(date, date) is
  'Agregados sin datos personales por mes, tipo, profesional, medio de pago y país de residencia (agrupados por id/ISO). Excluye anulados, limita al tenant de sesión y requiere permisos de reportes, tratamientos y pacientes.';

revoke all on function fn_reportes_analitica_clinica(date, date)
  from public, anon, authenticated;
grant execute on function fn_reportes_analitica_clinica(date, date)
  to authenticated;
