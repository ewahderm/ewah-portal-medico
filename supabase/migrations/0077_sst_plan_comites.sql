-- ============================================================
-- 0077 · SG-SST F7 · Plan anual, comités e indicadores
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F7.
--   1. sst_plan_actividades: plan anual de trabajo (actividad, ciclo PHVA,
--      mes, responsable, meta) con su ejecución.
--   2. sst_comites: cada periodo de un comité (vigía, COPASST, Comité de
--      Convivencia) con sus integrantes. Un periodo no se modifica: se
--      conforma uno nuevo (el anterior queda en el historial).
--   3. sst_comite_reuniones: reuniones con temas, compromisos y acta.
--   4. fn_sst_indicadores(año): insumos mensuales de los indicadores del
--      Art. 30 de la Res. 0312 (trabajadores, AT, días, mortales, EL
--      nuevas, ausentismo). Solo números; las fórmulas están en
--      lib/sst/indicadores.ts (con pruebas).

-- ============================================================
-- 1. Plan anual de trabajo
-- ============================================================
create table sst_plan_actividades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  anio int not null check (anio between 2019 and 2100),
  mes int not null check (mes between 1 and 12),
  ciclo text not null check (ciclo in ('planear', 'hacer', 'verificar', 'actuar')),
  actividad text not null check (length(btrim(actividad)) between 3 and 500),
  meta text check (length(meta) <= 300),
  recursos text check (length(recursos) <= 300),
  responsable_id uuid references usuarios(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'ejecutada', 'cancelada')),
  fecha_ejecucion date,
  observacion text check (length(observacion) <= 2000),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sst_plan_ejecutada check (estado <> 'ejecutada' or fecha_ejecucion is not null),
  constraint sst_plan_cancelada check (estado <> 'cancelada' or length(btrim(coalesce(observacion, ''))) >= 10)
);

create index idx_sst_plan_clinica on sst_plan_actividades(clinica_id, anio, mes);

create or replace function fn_sst_plan_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.estado <> 'pendiente' then
    raise exception 'Una actividad ejecutada o cancelada no se modifica.';
  end if;
  if new.fecha_ejecucion > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha de ejecución no puede ser futura.';
  end if;
  return new;
end;
$$;

create trigger sst_plan_00_autor before insert or update on sst_plan_actividades
  for each row execute function fn_hab_forzar_autor();
create trigger sst_plan_proteger before insert or update on sst_plan_actividades
  for each row execute function fn_sst_plan_proteger();
create trigger sst_plan_responsable_misma_clinica
  before insert or update of responsable_id, clinica_id on sst_plan_actividades
  for each row execute function fn_hab_misma_clinica('responsable_id', 'usuarios', 'El responsable no pertenece a esta clínica.');
create trigger sst_plan_set_updated_at before update on sst_plan_actividades
  for each row execute function set_updated_at();
create trigger sst_plan_auditoria after insert or update on sst_plan_actividades
  for each row execute function fn_auditoria();

alter table sst_plan_actividades enable row level security;
create policy "sst_plan_select" on sst_plan_actividades
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_plan_insert" on sst_plan_actividades
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );
create policy "sst_plan_update" on sst_plan_actividades
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
  ) with check (clinica_id = clinica_actual());

-- ============================================================
-- 2. Comités (periodos) y 3. reuniones
-- ============================================================
create table sst_comites (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo text not null check (tipo in ('vigia', 'copasst', 'convivencia')),
  fecha_inicio date not null,
  fecha_fin date not null,
  -- [{ "nombre": "...", "representa": "empleador|trabajadores", "rol": "principal|suplente|presidente|secretario|vigia" }]
  integrantes jsonb not null check (jsonb_typeof(integrantes) = 'array' and jsonb_array_length(integrantes) between 1 and 30),
  acta_storage_path text,
  acta_nombre_archivo text check (length(acta_nombre_archivo) <= 255),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sst_comite_periodo check (fecha_fin > fecha_inicio and fecha_fin <= fecha_inicio + interval '3 years'),
  constraint sst_comite_acta_propia check (acta_storage_path is null or split_part(acta_storage_path, '/', 1) = clinica_id::text)
);

create index idx_sst_comites_clinica on sst_comites(clinica_id, tipo, fecha_inicio desc);

create table sst_comite_reuniones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  comite_id uuid not null references sst_comites(id) on delete cascade,
  fecha date not null,
  temas text not null check (length(btrim(temas)) between 3 and 4000),
  compromisos text check (length(compromisos) <= 4000),
  acta_storage_path text,
  acta_nombre_archivo text check (length(acta_nombre_archivo) <= 255),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sst_reunion_acta_propia check (acta_storage_path is null or split_part(acta_storage_path, '/', 1) = clinica_id::text)
);

create index idx_sst_reuniones_comite on sst_comite_reuniones(comite_id, fecha desc);

create or replace function fn_sst_fecha_no_futura()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fecha date := (to_jsonb(new) ->> tg_argv[0])::date;
begin
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha no puede ser futura.';
  end if;
  return new;
end;
$$;

create trigger sst_comites_00_autor before insert on sst_comites
  for each row execute function fn_hab_forzar_autor();
create trigger sst_comites_fecha before insert on sst_comites
  for each row execute function fn_sst_fecha_no_futura('fecha_inicio');
create trigger sst_comites_inmutable before update or delete on sst_comites
  for each row execute function fn_hab_inmutable('Un periodo del comité no se modifica: conforma uno nuevo (el anterior queda en el historial).');
create trigger sst_comites_auditoria after insert on sst_comites
  for each row execute function fn_auditoria();

create trigger sst_reuniones_00_autor before insert on sst_comite_reuniones
  for each row execute function fn_hab_forzar_autor();
create trigger sst_reuniones_fecha before insert on sst_comite_reuniones
  for each row execute function fn_sst_fecha_no_futura('fecha');
create trigger sst_reuniones_comite_misma_clinica before insert on sst_comite_reuniones
  for each row execute function fn_hab_misma_clinica('comite_id', 'sst_comites', 'El comité no pertenece a esta clínica.');
create trigger sst_reuniones_inmutable before update or delete on sst_comite_reuniones
  for each row execute function fn_hab_inmutable('El acta de una reunión no se modifica ni se borra.');

alter table sst_comites enable row level security;
alter table sst_comite_reuniones enable row level security;
create policy "sst_comites_select" on sst_comites
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_comites_insert" on sst_comites
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );
create policy "sst_reuniones_select" on sst_comite_reuniones
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_reuniones_insert" on sst_comite_reuniones
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );

-- ============================================================
-- 4. Insumos de los indicadores (Res. 0312, Art. 30)
-- ============================================================
-- Trabajadores del mes: personal de RRHH vigente ese mes según su contrato
-- (inicio ≤ fin del mes; activo hoy o con fin de contrato ≥ inicio del
-- mes), contratistas según el perfil, más los que RRHH no registra.
-- Días programados: trabajadores × días hábiles del mes (lunes a viernes
-- sin festivos). Es una aproximación declarada en la pantalla.
create or replace function fn_sst_indicadores(p_anio int)
returns table (
  mes int,
  trabajadores int,
  accidentes int,
  dias_incapacidad_at int,
  dias_cargados int,
  at_mortales int,
  el_nuevas int,
  el_total int,
  dias_ausencia int,
  dias_programados int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_pais uuid;
  v_perfil sst_perfil%rowtype;
begin
  if v_clinica is null or not has_permission('sst', 'VIEW') then
    raise exception 'No tienes permiso para ver los indicadores del SG-SST.';
  end if;
  if p_anio is null or p_anio not between 2019 and 2100 then
    raise exception 'Año inválido.';
  end if;
  select * into v_perfil from sst_perfil where clinica_id = v_clinica;
  v_pais := fn_hab_pais_clinica(v_clinica);
  return query
  with meses as (
    select m, make_date(p_anio, m, 1) as ini, (make_date(p_anio, m, 1) + interval '1 month - 1 day')::date as fin
    from generate_series(1, 12) m
  ),
  personal as (
    select ms.m,
      (select count(*) from empleados e
        where e.clinica_id = v_clinica
          and (e.categoria_contrato = 'laboral' or (e.categoria_contrato = 'servicios' and not coalesce(v_perfil.excluye_contratistas, false)) or e.categoria_contrato is null)
          and (e.fecha_inicio_contrato is null or e.fecha_inicio_contrato <= ms.fin)
          and (e.activo or e.fecha_fin_contrato >= ms.ini))::int + coalesce(v_perfil.otros_trabajadores, 0) as n,
      (select count(*) from generate_series(ms.ini, ms.fin, interval '1 day') d
        where not fn_es_dia_no_habil(d::date, v_pais))::int as habiles
    from meses ms
  )
  select ms.m, p.n,
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.fecha between ms.ini and ms.fin),
    (select coalesce(sum(a.dias_incapacidad), 0)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.fecha between ms.ini and ms.fin),
    (select coalesce(sum(a.dias_cargados), 0)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.fecha between ms.ini and ms.fin),
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.gravedad = 'mortal' and a.fecha between ms.ini and ms.fin),
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'enfermedad_laboral' and a.fecha between ms.ini and ms.fin),
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'enfermedad_laboral' and a.fecha <= ms.fin
        and (not a.cerrado or a.fecha_cierre >= ms.ini)),
    (select coalesce(sum(greatest(0, least(i.fecha_inicio + i.dias - 1, ms.fin) - greatest(i.fecha_inicio, ms.ini) + 1)), 0)::int
      from incapacidades_empleado i
      where i.clinica_id = v_clinica and i.fecha_inicio <= ms.fin and i.fecha_inicio + i.dias - 1 >= ms.ini),
    p.n * p.habiles
  from meses ms
  join personal p on p.m = ms.m
  order by ms.m;
end;
$$;

comment on function fn_sst_indicadores(int) is
  'SG-SST F7: insumos mensuales de los indicadores del Art. 30 de la Res. 0312 (solo números). Exige sst/VIEW.';

revoke execute on function fn_sst_indicadores(int) from public, anon;
grant execute on function fn_sst_indicadores(int) to authenticated;
revoke execute on function fn_sst_plan_proteger() from public, anon, authenticated;
revoke execute on function fn_sst_fecha_no_futura() from public, anon, authenticated;
