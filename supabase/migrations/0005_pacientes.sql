-- EWAH Tech Platform — Módulo Pacientes
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Ver docs/spec-ewah-app.md §2.1, §8.1 para el diseño funcional original.
--
-- Mejoras deliberadas sobre el sistema legado (acordadas con el usuario):
--  - Sin Edad/RangoEdad en el paciente: solo se guarda fecha_nacimiento.
--    La edad "al momento del tratamiento" se calculará y guardará en la
--    tabla tratamientos (próximo módulo) como dato histórico inmutable,
--    para análisis de comportamiento por edad — no aquí, donde quedaría
--    desactualizada como en el legado.
--  - Nunca se borra un paciente (retención de historia clínica): solo se
--    desactiva (activo=false). No existe permiso ni acción DELETE.
--  - Búsqueda indexada de verdad (pg_trgm + unaccent) en vez del
--    normalizar-y-escanear en memoria del sistema legado.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() es STABLE, no IMMUTABLE — envolver para poder usarla en una
-- columna generada / índice.
create or replace function f_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select unaccent('unaccent', $1);
$$;

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo_identificacion_id uuid not null references tipos_identificacion(id),
  numero_identificacion text not null,
  primer_nombre text not null,
  segundo_nombre text,
  primer_apellido text not null,
  segundo_apellido text,
  fecha_nacimiento date,
  genero_id uuid references generos(id),
  nacionalidad_id uuid references paises(id),
  pais_residencia_id uuid references paises(id),
  medio_contacto_id uuid references medios_contacto(id),
  eps_id uuid references eps(id),
  email text,
  telefono1 text,
  telefono2 text,
  activo boolean not null default true,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, tipo_identificacion_id, numero_identificacion),
  busqueda text generated always as (
    f_unaccent(lower(
      primer_nombre || ' ' || coalesce(segundo_nombre, '') || ' ' ||
      primer_apellido || ' ' || coalesce(segundo_apellido, '') || ' ' ||
      numero_identificacion
    ))
  ) stored
);

create trigger pacientes_set_updated_at before update on pacientes for each row execute function set_updated_at();

create index pacientes_clinica_id_idx on pacientes(clinica_id);
create index pacientes_busqueda_trgm_idx on pacientes using gin (busqueda gin_trgm_ops);

alter table pacientes enable row level security;

create policy "pacientes_select_propia_clinica" on pacientes
  for select using (clinica_id = clinica_actual());

create policy "pacientes_write_con_permiso" on pacientes
  for insert with check (
    clinica_id = clinica_actual() and has_permission('pacientes', 'CREATE')
  );

create policy "pacientes_update_con_permiso" on pacientes
  for update using (
    clinica_id = clinica_actual() and has_permission('pacientes', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- Registrar el módulo en RBAC y habilitarlo para todas las clínicas
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('pacientes', 'Pacientes', 'Registro de pacientes de la clínica', '/pacientes', 2, false);

insert into clinica_modulos (clinica_id, modulo_id)
select c.id, m.id from clinicas c cross join modulos m where m.codigo = 'pacientes'
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'pacientes' and p.codigo in ('VIEW', 'CREATE', 'EDIT')
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas nuevas también
-- reciban el módulo Pacientes habilitado desde el registro.
create or replace function bootstrap_clinica(
  p_nombre_clinica text,
  p_nit text,
  p_admin_id uuid,
  p_admin_nombre text,
  p_admin_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_rol_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_admin_id) then
    raise exception 'p_admin_id % no existe en auth.users', p_admin_id;
  end if;

  if exists (select 1 from usuarios where id = p_admin_id) then
    raise exception 'Ese usuario ya pertenece a una clínica';
  end if;

  insert into clinicas (nombre, nit, plan)
  values (p_nombre_clinica, p_nit, 'trial')
  returning id into v_clinica_id;

  insert into roles (clinica_id, nombre, descripcion, nivel)
  values (v_clinica_id, 'Administrador', 'Acceso total, bypass de RBAC (nivel=1)', 1)
  returning id into v_rol_id;

  insert into usuarios (id, clinica_id, rol_id, nombre, email)
  values (p_admin_id, v_clinica_id, v_rol_id, p_admin_nombre, p_admin_email);

  insert into clinica_modulos (clinica_id, modulo_id)
  select v_clinica_id, id from modulos where codigo in ('usuarios', 'parametros', 'pacientes');

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros', 'pacientes');

  return v_clinica_id;
end;
$$;
