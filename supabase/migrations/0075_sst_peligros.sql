-- ============================================================
-- 0075 · SG-SST F5 · Matriz de peligros (GTC 45)
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F5.
-- Una fila por peligro (proceso, actividad, clasificación, controles
-- existentes) con la valoración de la GTC 45:
--   ND (deficiencia: 10, 6, 2, 0) × NE (exposición: 4, 3, 2, 1) = NP;
--   NP × NC (consecuencia: 100, 60, 25, 10) = NR;
--   NR 4000–600 = I (no aceptable), 500–150 = II, 120–40 = III, < 40 = IV.
-- Los niveles los calcula la BD (columnas generadas): la app no los manda.
-- La matriz es un documento vivo (se actualiza al menos una vez al año y
-- tras cada accidente grave): las filas se editan con auditoría y se
-- retiran con un motivo, no se borran.
-- Las medidas de intervención son acciones (sst_acciones, origen
-- 'matriz') con su lugar en la jerarquía de controles.

create table sst_peligros (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid references sedes(id),
  proceso text not null check (length(btrim(proceso)) between 2 and 200),
  actividad text not null check (length(btrim(actividad)) between 2 and 300),
  cargos text check (length(cargos) <= 300),
  rutinaria boolean not null default true,
  clasificacion text not null check (clasificacion in (
    'biologico', 'fisico', 'quimico', 'psicosocial', 'biomecanico', 'condiciones_seguridad', 'fenomenos_naturales'
  )),
  descripcion text not null check (length(btrim(descripcion)) between 3 and 500),
  efectos text check (length(efectos) <= 1000),
  expuestos int not null default 1 check (expuestos between 0 and 100000),
  control_fuente text check (length(control_fuente) <= 1000),
  control_medio text check (length(control_medio) <= 1000),
  control_individuo text check (length(control_individuo) <= 1000),
  nd int not null check (nd in (0, 2, 6, 10)),
  ne int not null check (ne in (1, 2, 3, 4)),
  nc int not null check (nc in (10, 25, 60, 100)),
  np int generated always as (nd * ne) stored,
  nr int generated always as (nd * ne * nc) stored,
  nivel_riesgo text generated always as (
    case
      when nd * ne * nc >= 600 then 'I'
      when nd * ne * nc >= 150 then 'II'
      when nd * ne * nc >= 40 then 'III'
      else 'IV'
    end
  ) stored,
  peor_consecuencia text check (length(peor_consecuencia) <= 500),
  requisito_legal text check (length(requisito_legal) <= 500),
  activo boolean not null default true,
  retiro_motivo text,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sst_peligro_retiro check (activo or length(btrim(coalesce(retiro_motivo, ''))) >= 10)
);

create index idx_sst_peligros_clinica on sst_peligros(clinica_id, activo, nivel_riesgo);

-- Retirado no vuelve (si reaparece, se registra de nuevo).
create or replace function fn_sst_peligro_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not old.activo then
    raise exception 'Este peligro está retirado: si vuelve a existir, regístralo de nuevo.';
  end if;
  if new.clinica_id <> old.clinica_id then
    raise exception 'El peligro no cambia de clínica.';
  end if;
  return new;
end;
$$;

create trigger sst_peligros_00_autor before insert or update on sst_peligros
  for each row execute function fn_hab_forzar_autor();
create trigger sst_peligros_proteger before update on sst_peligros
  for each row execute function fn_sst_peligro_proteger();
create trigger sst_peligros_sede_misma_clinica
  before insert or update of sede_id, clinica_id on sst_peligros
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');
create trigger sst_peligros_set_updated_at before update on sst_peligros
  for each row execute function set_updated_at();
create trigger sst_peligros_auditoria after insert or update on sst_peligros
  for each row execute function fn_auditoria();

alter table sst_peligros enable row level security;
create policy "sst_peligros_select" on sst_peligros
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_peligros_insert" on sst_peligros
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
  );
create policy "sst_peligros_update" on sst_peligros
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- Medidas de intervención: acciones con jerarquía de controles
-- ============================================================
alter table sst_acciones
  add column jerarquia text check (jerarquia in ('eliminacion', 'sustitucion', 'ingenieria', 'administrativo', 'epp'));

create or replace function fn_sst_accion_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.estado = 'cerrada' then
      raise exception 'La acción está cerrada: no se modifica (si hace falta, crea otra).';
    end if;
    if new.origen <> old.origen or new.origen_id is distinct from old.origen_id or new.clinica_id <> old.clinica_id then
      raise exception 'La acción no cambia de origen.';
    end if;
  end if;
  if new.origen = 'investigacion' and not exists (
    select 1 from sst_investigaciones i where i.id = new.origen_id and i.clinica_id = new.clinica_id
  ) then
    raise exception 'La investigación no pertenece a esta clínica.';
  end if;
  if new.origen = 'matriz' and not exists (
    select 1 from sst_peligros p where p.id = new.origen_id and p.clinica_id = new.clinica_id
  ) then
    raise exception 'El peligro no pertenece a esta clínica.';
  end if;
  if new.estado = 'cerrada' and new.fecha_cierre > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha de cierre no puede ser futura.';
  end if;
  return new;
end;
$$;

revoke execute on function fn_sst_peligro_proteger() from public, anon, authenticated;
