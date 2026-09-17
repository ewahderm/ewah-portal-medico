-- EWAH Tech Platform — Módulo 00: Sistema (tenants, usuarios, RBAC)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Ver docs/spec-ewah-app.md §2.10, §3, §4 para el diseño funcional original.

-- ============================================================
-- Helper: updated_at automático (se reutiliza en todos los módulos futuros)
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Tenants: clinicas
-- ============================================================
create table clinicas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text not null unique,
  plan text not null default 'trial' check (plan in ('trial', 'basico', 'profesional', 'empresarial')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinicas_set_updated_at
  before update on clinicas
  for each row execute function set_updated_at();

-- ============================================================
-- Catálogo global de la plataforma: módulos y permisos
-- (los define EWAH Tech como proveedor, no cada clínica)
-- ============================================================
create table modulos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  ruta text,
  icono text,
  orden int not null default 0,
  es_administrativo boolean not null default false,
  activo boolean not null default true
);

create table permisos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo in ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'IMPORT', 'APPROVE', 'VOID')),
  nombre text not null,
  descripcion text,
  activo boolean not null default true
);

-- ============================================================
-- Roles por clínica (cada clínica arma sus propios roles
-- sobre el catálogo global de módulos/permisos)
-- ============================================================
create table roles (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  -- nivel = 1 es Administrador: bypass total de RBAC (ver has_permission())
  nivel int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, nombre)
);

create trigger roles_set_updated_at
  before update on roles
  for each row execute function set_updated_at();

-- ============================================================
-- Usuarios: perfil que extiende auth.users, 1:1
-- ============================================================
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  clinica_id uuid not null references clinicas(id),
  rol_id uuid not null references roles(id),
  nombre text not null,
  email text not null unique,
  ultimo_acceso timestamptz,
  intentos_login int not null default 0,
  bloqueado boolean not null default false,
  fecha_bloqueo timestamptz,
  requiere_cambio_pass boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger usuarios_set_updated_at
  before update on usuarios
  for each row execute function set_updated_at();

-- Evita que un usuario se auto-escale de clínica o de rol desde el cliente.
-- Solo una conexión con service_role (bypassa RLS y este trigger no aplica
-- porque current_setting devuelve 'service_role') puede tocar estos campos.
create or replace function prevent_self_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.clinica_id is distinct from old.clinica_id then
      raise exception 'No autorizado: no puedes cambiar tu propia clinica_id';
    end if;
    if new.rol_id is distinct from old.rol_id then
      raise exception 'No autorizado: no puedes cambiar tu propio rol_id';
    end if;
  end if;
  return new;
end;
$$;

create trigger usuarios_prevent_self_privilege_escalation
  before update on usuarios
  for each row execute function prevent_self_privilege_escalation();

-- ============================================================
-- Matriz RBAC: rol × módulo × permiso
-- ============================================================
create table rol_modulo_permiso (
  id uuid primary key default gen_random_uuid(),
  rol_id uuid not null references roles(id) on delete cascade,
  modulo_id uuid not null references modulos(id) on delete cascade,
  permiso_id uuid not null references permisos(id) on delete cascade,
  concedido boolean not null default true,
  unique (rol_id, modulo_id, permiso_id)
);

-- ============================================================
-- Qué módulos tiene contratados cada clínica (plan/suscripción)
-- ============================================================
create table clinica_modulos (
  clinica_id uuid not null references clinicas(id) on delete cascade,
  modulo_id uuid not null references modulos(id) on delete cascade,
  activo boolean not null default true,
  primary key (clinica_id, modulo_id)
);

-- ============================================================
-- Auditoría (no es el mecanismo de auth — eso lo maneja Supabase Auth)
-- ============================================================
create table sesion_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  ip inet,
  navegador text,
  dispositivo_tipo text,
  activa boolean not null default true
);

create table log_acceso (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id) on delete set null,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  modulo_id uuid references modulos(id),
  accion text not null,
  recurso text,
  exitoso boolean not null default true,
  mensaje_error text,
  fecha_hora timestamptz not null default now(),
  ip inet
);

create index log_acceso_clinica_fecha_idx on log_acceso(clinica_id, fecha_hora desc);

-- ============================================================
-- Funciones de autorización (usadas en RLS y en el código de la app)
-- ============================================================

-- Clínica del usuario autenticado actual. STABLE: se puede cachear
-- dentro de una misma consulta/policy.
create or replace function clinica_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinica_id from usuarios where id = auth.uid();
$$;

-- ¿El usuario actual es Administrador (nivel=1) de su clínica?
create or replace function es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios u
    join roles r on r.id = u.rol_id
    where u.id = auth.uid() and r.nivel = 1
  );
$$;

-- ¿Tiene el usuario actual permiso `permiso_code` sobre `modulo_code`?
-- Nivel=1 (Administrador) bypassa la matriz. Además exige que el módulo
-- esté contratado/activo para la clínica (clinica_modulos).
create or replace function has_permission(modulo_code text, permiso_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_rol_id uuid;
  v_nivel int;
  v_modulo_activo boolean;
begin
  select u.clinica_id, u.rol_id, r.nivel
    into v_clinica_id, v_rol_id, v_nivel
  from usuarios u
  join roles r on r.id = u.rol_id
  where u.id = auth.uid();

  if v_clinica_id is null then
    return false;
  end if;

  if v_nivel = 1 then
    return true;
  end if;

  select cm.activo into v_modulo_activo
  from clinica_modulos cm
  join modulos m on m.id = cm.modulo_id
  where cm.clinica_id = v_clinica_id and m.codigo = modulo_code;

  if coalesce(v_modulo_activo, false) is not true then
    return false;
  end if;

  return exists (
    select 1
    from rol_modulo_permiso rmp
    join modulos m on m.id = rmp.modulo_id
    join permisos p on p.id = rmp.permiso_id
    where rmp.rol_id = v_rol_id
      and m.codigo = modulo_code
      and p.codigo = permiso_code
      and rmp.concedido = true
  );
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table clinicas enable row level security;
alter table modulos enable row level security;
alter table permisos enable row level security;
alter table roles enable row level security;
alter table usuarios enable row level security;
alter table rol_modulo_permiso enable row level security;
alter table clinica_modulos enable row level security;
alter table sesion_usuario enable row level security;
alter table log_acceso enable row level security;

-- clinicas: cada usuario ve solo su propia clínica. Crear clínicas nuevas
-- (alta de un tenant) se hace con service_role desde un flujo de onboarding.
create policy "clinicas_select_propia" on clinicas
  for select using (id = clinica_actual());

-- modulos / permisos: catálogo global, lectura para cualquier autenticado.
create policy "modulos_select_all" on modulos
  for select to authenticated using (true);

create policy "permisos_select_all" on permisos
  for select to authenticated using (true);

-- roles: visibles dentro de la propia clínica; solo un admin de esa
-- clínica puede crearlos/editarlos/borrarlos.
create policy "roles_select_propia_clinica" on roles
  for select using (clinica_id = clinica_actual());

create policy "roles_write_admin" on roles
  for all using (clinica_id = clinica_actual() and es_admin())
  with check (clinica_id = clinica_actual() and es_admin());

-- usuarios: uno mismo, o cualquiera de la misma clínica (directorio de
-- personal). Solo puede editar su propio perfil (columnas sensibles
-- protegidas por el trigger de arriba). Alta/baja de usuarios = service_role.
create policy "usuarios_select_propio_o_clinica" on usuarios
  for select using (id = auth.uid() or clinica_id = clinica_actual());

create policy "usuarios_update_propio" on usuarios
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- rol_modulo_permiso: visible dentro de la clínica; solo admin escribe.
create policy "rmp_select_propia_clinica" on rol_modulo_permiso
  for select using (
    exists (select 1 from roles r where r.id = rol_id and r.clinica_id = clinica_actual())
  );

create policy "rmp_write_admin" on rol_modulo_permiso
  for all using (
    es_admin() and exists (select 1 from roles r where r.id = rol_id and r.clinica_id = clinica_actual())
  )
  with check (
    es_admin() and exists (select 1 from roles r where r.id = rol_id and r.clinica_id = clinica_actual())
  );

-- clinica_modulos: visible para la propia clínica; la activación de
-- módulos por plan la controla la plataforma (service_role), no el cliente.
create policy "clinica_modulos_select_propia" on clinica_modulos
  for select using (clinica_id = clinica_actual());

-- sesion_usuario / log_acceso: auditoría, solo lectura para admins de la
-- propia clínica. Las escrituras las hace el backend con service_role.
create policy "sesion_usuario_select_admin" on sesion_usuario
  for select using (clinica_id = clinica_actual() and es_admin());

create policy "log_acceso_select_admin" on log_acceso
  for select using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- Seed: catálogo de permisos (fijo) y EWAH SAS como primera clínica
-- ============================================================
insert into permisos (codigo, nombre) values
  ('VIEW', 'Ver'),
  ('CREATE', 'Crear'),
  ('EDIT', 'Editar'),
  ('DELETE', 'Eliminar'),
  ('EXPORT', 'Exportar'),
  ('IMPORT', 'Importar'),
  ('APPROVE', 'Aprobar'),
  ('VOID', 'Anular');

insert into clinicas (nombre, nit, plan) values
  ('EWAH S.A.S.', '901759965', 'empresarial');

insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('usuarios', 'Usuarios y Roles', 'Gestión de usuarios, roles y permisos de la clínica', '/usuarios', 0, true);
