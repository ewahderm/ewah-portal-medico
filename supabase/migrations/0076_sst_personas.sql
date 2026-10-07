-- ============================================================
-- 0076 · SG-SST F6 · Capacitación, EPP y evaluaciones médicas
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F6.
--   1. sst_capacitaciones + asistentes: programa anual (programadas) y lo
--      realizado (inducción, reinducción, capacitaciones, simulacros), con
--      la lista de asistencia como soporte. Registros de capacitación: se
--      conservan (no se borran; se cancelan con motivo).
--   2. sst_epp_entregas: qué se entregó a quién y si se capacitó en su
--      uso. Solo se anulan con motivo.
--   3. sst_examenes_cargo: el profesiograma mínimo, cada cuántos meses se
--      repite la evaluación periódica por cargo (Res. 1843 de 2025: como
--      máximo cada 3 años).
--   4. fn_sst_estado_personas(): por persona activa, su último examen (de
--      los soportes que RRHH ya guarda en documentos_empleado), el próximo
--      según el profesiograma, vacunas vencidas, última entrega de EPP y
--      capacitaciones del año. Solo fechas y conteos (nunca el contenido
--      médico): quien gestiona SST puede no tener permiso de RRHH.

-- ============================================================
-- 1. Capacitaciones
-- ============================================================
create table sst_capacitaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tema text not null check (length(btrim(tema)) between 3 and 300),
  tipo text not null default 'capacitacion'
    check (tipo in ('induccion', 'reinduccion', 'capacitacion', 'simulacro', 'charla')),
  fecha date not null,
  duracion_horas numeric(5, 1) check (duracion_horas > 0 and duracion_horas <= 200),
  facilitador text check (length(facilitador) <= 200),
  modalidad text not null default 'presencial' check (modalidad in ('presencial', 'virtual')),
  descripcion text check (length(descripcion) <= 2000),
  estado text not null default 'programada' check (estado in ('programada', 'realizada', 'cancelada')),
  motivo_cancelacion text,
  soporte_storage_path text,
  soporte_nombre_archivo text check (length(soporte_nombre_archivo) <= 255),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sst_capacitacion_cancelada check (estado <> 'cancelada' or length(btrim(coalesce(motivo_cancelacion, ''))) >= 10),
  constraint sst_capacitacion_soporte_propio check (soporte_storage_path is null or split_part(soporte_storage_path, '/', 1) = clinica_id::text)
);

create index idx_sst_capacitaciones_clinica on sst_capacitaciones(clinica_id, fecha desc);

create table sst_capacitacion_asistentes (
  capacitacion_id uuid not null references sst_capacitaciones(id) on delete cascade,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (capacitacion_id, empleado_id)
);

create or replace function fn_sst_capacitacion_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if tg_op = 'UPDATE' and old.estado in ('realizada', 'cancelada') then
    -- Lo realizado solo admite agregar el soporte si aún no lo tenía.
    if old.estado = 'realizada' and new.estado = 'realizada'
       and old.soporte_storage_path is null and new.soporte_storage_path is not null
       and (to_jsonb(new) - array['soporte_storage_path', 'soporte_nombre_archivo', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['soporte_storage_path', 'soporte_nombre_archivo', 'updated_at', 'updated_by']) then
      return new;
    end if;
    raise exception 'Una capacitación realizada o cancelada no se modifica.';
  end if;
  if new.estado = 'realizada' and new.fecha > v_hoy then
    raise exception 'Una capacitación futura no puede estar realizada.';
  end if;
  return new;
end;
$$;

create trigger sst_capacitaciones_00_autor before insert or update on sst_capacitaciones
  for each row execute function fn_hab_forzar_autor();
create trigger sst_capacitaciones_proteger before insert or update on sst_capacitaciones
  for each row execute function fn_sst_capacitacion_proteger();
create trigger sst_capacitaciones_set_updated_at before update on sst_capacitaciones
  for each row execute function set_updated_at();
create trigger sst_capacitaciones_auditoria after insert or update on sst_capacitaciones
  for each row execute function fn_auditoria();

create trigger sst_asistentes_empleado_misma_clinica
  before insert or update on sst_capacitacion_asistentes
  for each row execute function fn_hab_misma_clinica('empleado_id', 'empleados', 'La persona no pertenece a esta clínica.');
create trigger sst_asistentes_capacitacion_misma_clinica
  before insert or update on sst_capacitacion_asistentes
  for each row execute function fn_hab_misma_clinica('capacitacion_id', 'sst_capacitaciones', 'La capacitación no pertenece a esta clínica.');

alter table sst_capacitaciones enable row level security;
alter table sst_capacitacion_asistentes enable row level security;

create policy "sst_capacitaciones_select" on sst_capacitaciones
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_capacitaciones_insert" on sst_capacitaciones
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );
create policy "sst_capacitaciones_update" on sst_capacitaciones
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
  ) with check (clinica_id = clinica_actual());

create policy "sst_asistentes_select" on sst_capacitacion_asistentes
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
-- La asistencia se registra mientras la capacitación no esté cerrada como
-- cancelada (se puede completar la lista al marcarla realizada).
create policy "sst_asistentes_insert" on sst_capacitacion_asistentes
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );

-- ============================================================
-- 2. Entregas de EPP
-- ============================================================
create table sst_epp_entregas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  fecha date not null,
  -- [{ "elemento": "Guantes de nitrilo", "cantidad": 100 }]
  elementos jsonb not null check (jsonb_typeof(elementos) = 'array' and jsonb_array_length(elementos) between 1 and 30),
  capacitado_uso boolean not null default false,
  observacion text check (length(observacion) <= 1000),
  soporte_storage_path text,
  soporte_nombre_archivo text check (length(soporte_nombre_archivo) <= 255),
  anulado boolean not null default false,
  anulado_motivo text,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  constraint sst_epp_anulacion check (not anulado or length(btrim(coalesce(anulado_motivo, ''))) >= 10),
  constraint sst_epp_soporte_propio check (soporte_storage_path is null or split_part(soporte_storage_path, '/', 1) = clinica_id::text)
);

create index idx_sst_epp_clinica on sst_epp_entregas(clinica_id, empleado_id, fecha desc);

create or replace function fn_sst_epp_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.fecha > (now() at time zone 'America/Bogota')::date then
      raise exception 'La fecha de entrega no puede ser futura.';
    end if;
    new.anulado := false;
    new.anulado_motivo := null;
    return new;
  end if;
  if old.anulado then
    raise exception 'La entrega ya está anulada.';
  end if;
  if (to_jsonb(new) - array['anulado', 'anulado_motivo', 'updated_by']) <> (to_jsonb(old) - array['anulado', 'anulado_motivo', 'updated_by']) then
    raise exception 'Una entrega de EPP no se modifica: anúlala y regístrala de nuevo.';
  end if;
  return new;
end;
$$;

create trigger sst_epp_00_autor before insert or update on sst_epp_entregas
  for each row execute function fn_hab_forzar_autor();
create trigger sst_epp_proteger before insert or update on sst_epp_entregas
  for each row execute function fn_sst_epp_proteger();
create trigger sst_epp_empleado_misma_clinica
  before insert or update of empleado_id, clinica_id on sst_epp_entregas
  for each row execute function fn_hab_misma_clinica('empleado_id', 'empleados', 'La persona no pertenece a esta clínica.');
create trigger sst_epp_auditoria after insert or update on sst_epp_entregas
  for each row execute function fn_auditoria();

alter table sst_epp_entregas enable row level security;
create policy "sst_epp_select" on sst_epp_entregas
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_epp_insert" on sst_epp_entregas
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );
create policy "sst_epp_update" on sst_epp_entregas
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'VOID') and has_entitlement('sst', 'gestion')
  ) with check (clinica_id = clinica_actual());

-- ============================================================
-- 3. Profesiograma mínimo: periodicidad por cargo
-- ============================================================
create table sst_examenes_cargo (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  cargo_id uuid not null unique references cargos(id) on delete cascade,
  periodicidad_meses int not null check (periodicidad_meses between 1 and 36),
  enfasis text check (length(enfasis) <= 500),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger sst_examenes_cargo_00_autor before insert or update on sst_examenes_cargo
  for each row execute function fn_hab_forzar_autor();
create trigger sst_examenes_cargo_misma_clinica
  before insert or update of cargo_id, clinica_id on sst_examenes_cargo
  for each row execute function fn_hab_misma_clinica('cargo_id', 'cargos', 'El cargo no pertenece a esta clínica.');
create trigger sst_examenes_cargo_set_updated_at before update on sst_examenes_cargo
  for each row execute function set_updated_at();
create trigger sst_examenes_cargo_auditoria after insert or update on sst_examenes_cargo
  for each row execute function fn_auditoria();

alter table sst_examenes_cargo enable row level security;
create policy "sst_examenes_cargo_select" on sst_examenes_cargo
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_examenes_cargo_insert" on sst_examenes_cargo
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
  );
create policy "sst_examenes_cargo_update" on sst_examenes_cargo
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
  ) with check (clinica_id = clinica_actual());

-- ============================================================
-- 4. Estado por persona (solo fechas y conteos)
-- ============================================================
create or replace function fn_sst_estado_personas()
returns table (
  empleado_id uuid,
  nombre text,
  cargo_id uuid,
  cargo_nombre text,
  periodicidad_meses int,
  ultimo_examen date,
  ultimo_examen_tipo text,
  proximo_examen date,
  vacunas_vencidas int,
  vacunas_por_vencer int,
  ultima_entrega_epp date,
  capacitaciones_anio int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if v_clinica is null or not has_permission('sst', 'VIEW') then
    raise exception 'No tienes permiso para ver el estado del personal en SG-SST.';
  end if;
  return query
  with activos as (
    select e.id, e.nombre, e.orden,
      (select h.cargo_id from historial_cargos_empleado h
        where h.empleado_id = e.id order by h.fecha_inicio desc, h.created_at desc limit 1) as cargo_id
    from empleados e
    where e.clinica_id = v_clinica and e.activo
  ),
  examenes as (
    select distinct on (d.empleado_id) d.empleado_id, d.fecha_evento, t.codigo
    from documentos_empleado d
    join tipos_examen_ocupacional t on t.id = d.tipo_examen_id
    where d.clinica_id = v_clinica and d.tipo = 'examen_ocupacional'
      and d.fecha_evento is not null and t.codigo in ('INGRESO', 'PERIODICO')
    order by d.empleado_id, d.fecha_evento desc
  )
  select a.id, a.nombre, a.cargo_id, cg.nombre, ec.periodicidad_meses,
    ex.fecha_evento, ex.codigo,
    case when ex.fecha_evento is not null and ec.periodicidad_meses is not null
      then (ex.fecha_evento + make_interval(months => ec.periodicidad_meses))::date end,
    (select count(*)::int from documentos_empleado v
      where v.empleado_id = a.id and v.tipo = 'vacuna' and v.fecha_vencimiento < v_hoy),
    (select count(*)::int from documentos_empleado v
      where v.empleado_id = a.id and v.tipo = 'vacuna' and v.fecha_vencimiento between v_hoy and v_hoy + 30),
    (select max(p.fecha) from sst_epp_entregas p where p.empleado_id = a.id and not p.anulado),
    (select count(*)::int from sst_capacitacion_asistentes s
      join sst_capacitaciones c on c.id = s.capacitacion_id
      where s.empleado_id = a.id and c.estado = 'realizada' and extract(year from c.fecha) = extract(year from v_hoy))
  from activos a
  left join cargos cg on cg.id = a.cargo_id
  left join sst_examenes_cargo ec on ec.cargo_id = a.cargo_id
  left join examenes ex on ex.empleado_id = a.id
  order by a.orden, a.nombre;
end;
$$;

comment on function fn_sst_estado_personas() is
  'SG-SST F6: por persona activa, último examen ocupacional y próximo según el profesiograma, vacunas vencidas, última entrega de EPP y capacitaciones del año. Solo fechas y conteos; exige sst/VIEW.';

revoke execute on function fn_sst_estado_personas() from public, anon;
grant execute on function fn_sst_estado_personas() to authenticated;
revoke execute on function fn_sst_capacitacion_proteger() from public, anon, authenticated;
revoke execute on function fn_sst_epp_proteger() from public, anon, authenticated;
