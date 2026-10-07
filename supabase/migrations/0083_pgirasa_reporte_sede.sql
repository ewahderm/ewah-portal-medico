-- ============================================================
-- 0083 · Medio Ambiente · PGIRASA: datos del reporte por sede
-- ============================================================
-- Diseño: docs/reportes/SPEC-pgirasa-pesos.md. Devuelve, para una sede y un
-- mes cerrado, los pesajes agregados por mes y tipo de los seis meses que
-- usa el promedio móvil (Resolución 0591 de 2024) más el historial de
-- declaraciones de cero (vigentes y revocadas). El cálculo del promedio y
-- la categoría del generador viven en lib/medio-ambiente/calculo-pgirasa.ts.

-- security definer: concentra en un solo lugar el filtro por
-- clinica_actual() + has_permission VIEW + sede propia y devuelve solo
-- agregados, sin depender de que las policies de registros_residuos y
-- pgirasa_ceros_mensuales sigan alineadas. stable: solo lee.
create or replace function fn_pgirasa_reporte_sede(p_sede_id uuid, p_mes date)
returns table (
  mes date,
  tipo_residuo text,
  peso_kg numeric,
  confirmacion_id uuid,
  confirmado_en timestamptz,
  revocada_en timestamptz,
  motivo_revocacion text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_inicio date;
  v_fin date;
begin
  if not has_permission('medio_ambiente', 'VIEW') then
    raise exception 'No tienes permiso para ver el consolidado PGIRASA.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if p_sede_id is null or not exists (
    select 1 from sedes s
    where s.id = p_sede_id and s.clinica_id = v_clinica_id
  ) then
    raise exception 'La sede no pertenece a tu clínica.';
  end if;
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'El mes debe ser el primer día del mes evaluado.';
  end if;
  if p_mes >= date_trunc('month', now() at time zone 'America/Bogota')::date then
    raise exception 'El promedio PGIRASA solo se calcula para meses cerrados.';
  end if;

  v_inicio := (p_mes - interval '5 months')::date;
  v_fin := (p_mes + interval '1 month')::date;

  return query
  select date_trunc('month', r.fecha)::date,
         r.tipo_residuo,
         sum(r.peso_kg)::numeric,
         null::uuid,
         null::timestamptz,
         null::timestamptz,
         null::text
  from registros_residuos r
  where r.clinica_id = v_clinica_id
    and r.sede_id = p_sede_id
    and r.fecha >= v_inicio
    and r.fecha < v_fin
  group by date_trunc('month', r.fecha)::date, r.tipo_residuo

  union all

  select z.mes,
         null::text,
         null::numeric,
         z.id,
         z.confirmado_en,
         z.revocada_en,
         z.motivo_revocacion
  from pgirasa_ceros_mensuales z
  where z.clinica_id = v_clinica_id
    and z.sede_id = p_sede_id
    and z.mes >= v_inicio
    and z.mes < v_fin;
end;
$$;

comment on function fn_pgirasa_reporte_sede(uuid, date) is
  'Devuelve pesajes agrupados por corriente y las declaraciones históricas de cero de seis meses para una sede propia; requiere medio_ambiente/VIEW.';

revoke all on function fn_pgirasa_reporte_sede(uuid, date)
  from public, anon, authenticated;
grant execute on function fn_pgirasa_reporte_sede(uuid, date)
  to authenticated;
