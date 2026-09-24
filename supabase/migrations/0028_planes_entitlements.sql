-- EWAH Tech Platform — Planes de suscripción (entitlements)
-- Aplicar con: npx supabase db push --linked
--
-- Fase 1 de la conversión a freemium (acordada con el usuario tras consenso
-- de director-proyecto/arquitectura-backend/arquitectura-frontend/UX/diseño
-- gráfico): capa de "entitlements" separada de RBAC. RBAC (has_permission)
-- responde "¿este ROL puede hacer esto?"; entitlements (has_entitlement)
-- responde "¿el PLAN de esta clínica incluye esto siquiera?" — son
-- ortogonales a propósito, un admin de una clínica en plan Gratis sigue
-- siendo admin, pero no por eso desbloquea Inventario.
--
-- Split acordado (ver [[memoria]] del proyecto): Gratis = Pacientes,
-- Tratamientos completo (incluye Fotos e Insumos — trazabilidad clínica y
-- evidencia legal, no se cobran), Agenda. Pago = Anexos (sub-feature
-- dentro de Tratamientos), Inventario completo (control de stock/costeo —
-- el registro de qué se aplicó ya es gratis y no depende de esto),
-- Campañas. Usuarios/Parámetros (es_administrativo=true) van en todos los
-- planes: una clínica siempre puede administrar su propia cuenta.
--
-- Sin cobro real todavía (un solo tenant real hoy) — el plan de una
-- clínica se asigna a mano vía plan_id, no hay integración con pasarela.

-- ============================================================
-- 1. Catálogo de planes + relación con clinicas
-- ============================================================
create table planes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  precio_mensual numeric(12,2),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into planes (codigo, nombre, precio_mensual) values
  ('gratis', 'Gratis', 0),
  ('pro', 'Pro', null);

alter table clinicas add column plan_id uuid references planes(id);

-- Clínicas existentes hoy (EWAH S.A.S. y datos de prueba de este mismo
-- entorno) quedan en Pro para no perder de golpe funcionalidad que ya
-- están usando activamente. Clínicas nuevas entran en Gratis por defecto
-- desde bootstrap_clinica() (más abajo) — ese es el funnel real de
-- adquisición freemium.
update clinicas set plan_id = (select id from planes where codigo = 'pro');

alter table clinicas alter column plan_id set not null;

-- ============================================================
-- 2. Qué incluye cada plan — a nivel de módulo completo y de sub-feature
-- ============================================================
create table plan_modulos (
  plan_id uuid not null references planes(id) on delete cascade,
  modulo_id uuid not null references modulos(id) on delete cascade,
  incluido boolean not null default true,
  primary key (plan_id, modulo_id)
);

-- feature_codigo es texto libre validado en la app (ej. 'anexos' dentro de
-- 'tratamientos') — no hay catálogo de features todavía, un solo tenant
-- real no lo justifica; se formaliza si la lista crece.
create table plan_features (
  plan_id uuid not null references planes(id) on delete cascade,
  modulo_id uuid not null references modulos(id) on delete cascade,
  feature_codigo text not null,
  incluido boolean not null default true,
  primary key (plan_id, modulo_id, feature_codigo)
);

-- Excepciones manuales por clínica (comps, pilotos) que ganan sobre el
-- plan — nunca se leen si no hay una fila aquí (coalesce a "sigue el
-- plan" en has_entitlement).
create table clinica_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  modulo_id uuid not null references modulos(id) on delete cascade,
  feature_codigo text,
  incluido boolean not null,
  motivo text,
  expira_at timestamptz,
  created_at timestamptz not null default now()
);

alter table plan_modulos enable row level security;
alter table plan_features enable row level security;
alter table clinica_feature_overrides enable row level security;
alter table planes enable row level security;

-- Catálogo/config de la plataforma: lectura para cualquier autenticado
-- (igual criterio que "modulos"/"permisos"), escritura solo service_role.
create policy "planes_select_all" on planes for select to authenticated using (true);
create policy "plan_modulos_select_all" on plan_modulos for select to authenticated using (true);
create policy "plan_features_select_all" on plan_features for select to authenticated using (true);

-- clinica_feature_overrides sí es dato propio de la clínica.
create policy "overrides_select_propia_clinica" on clinica_feature_overrides
  for select using (clinica_id = clinica_actual());

-- Seed del split acordado.
insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p
cross join modulos m
where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas');

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p
join modulos m on m.codigo in ('inventario', 'campanas')
where p.codigo = 'pro';

insert into plan_features (plan_id, modulo_id, feature_codigo, incluido)
select p.id, m.id, 'anexos', (p.codigo = 'pro')
from planes p
join modulos m on m.codigo = 'tratamientos';

-- ============================================================
-- 3. has_entitlement() — deliberadamente NO reusa has_permission()
-- ============================================================
-- has_permission() deja pasar a cualquier administrador (nivel=1) sin
-- mirar clinica_modulos.activo — correcto para permisos de ROL (un admin
-- puede hacer cualquier cosa que su clínica tenga contratada), pero
-- rompería el gating por PLAN si un admin de la propia clínica pudiera
-- saltárselo: el punto de cobrar por Inventario es que ni el dueño de la
-- clínica lo desbloquea gratis por ser administrador de su cuenta.
create or replace function has_entitlement(modulo_code text, feature_code text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_modulo_id uuid;
  v_modulo_activo boolean;
  v_override boolean;
  v_feature_incluido boolean;
begin
  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    return false;
  end if;

  select id into v_modulo_id from modulos where codigo = modulo_code;
  if v_modulo_id is null then
    return false;
  end if;

  select activo into v_modulo_activo
  from clinica_modulos
  where clinica_id = v_clinica_id and modulo_id = v_modulo_id;

  if coalesce(v_modulo_activo, false) is not true then
    return false;
  end if;

  if feature_code is null then
    return true;
  end if;

  select incluido into v_override
  from clinica_feature_overrides
  where clinica_id = v_clinica_id
    and modulo_id = v_modulo_id
    and feature_codigo = feature_code
    and (expira_at is null or expira_at > now())
  order by created_at desc
  limit 1;

  if v_override is not null then
    return v_override;
  end if;

  select pf.incluido into v_feature_incluido
  from clinicas c
  join plan_features pf on pf.plan_id = c.plan_id
    and pf.modulo_id = v_modulo_id
    and pf.feature_codigo = feature_code
  where c.id = v_clinica_id;

  return coalesce(v_feature_incluido, false);
end;
$$;

-- ============================================================
-- 4. Sincronizar clinica_modulos desde el plan de la clínica
-- ============================================================
-- clinica_modulos ya existía (0001) y ya está referenciada en RLS por
-- todos lados vía has_permission() — se sigue poblando igual, solo que
-- ahora la fuente de verdad es el plan en vez de un insert manual por
-- migración de módulo.
create or replace function fn_sync_clinica_modulos(p_clinica_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into clinica_modulos (clinica_id, modulo_id, activo)
  select
    p_clinica_id,
    m.id,
    coalesce(
      (
        select pm.incluido
        from plan_modulos pm
        join clinicas c on c.id = p_clinica_id
        where pm.plan_id = c.plan_id and pm.modulo_id = m.id
      ),
      false
    )
  from modulos m
  on conflict (clinica_id, modulo_id) do update set activo = excluded.activo;
end;
$$;

create or replace function fn_clinicas_plan_cambiado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_id is distinct from old.plan_id then
    perform fn_sync_clinica_modulos(new.id);
  end if;
  return new;
end;
$$;

create trigger clinicas_sync_modulos_al_cambiar_plan
  after update on clinicas
  for each row execute function fn_clinicas_plan_cambiado();

-- Sincroniza ahora mismo las clínicas existentes (ya en Pro desde el
-- paso 1) para que clinica_modulos quede consistente con el seed de
-- plan_modulos de arriba.
do $$
declare
  v_clinica record;
begin
  for v_clinica in select id from clinicas loop
    perform fn_sync_clinica_modulos(v_clinica.id);
  end loop;
end;
$$;

-- bootstrap_clinica(): clínicas nuevas entran en plan Gratis y quedan
-- sincronizadas desde el primer momento — se repite la firma completa de
-- la función porque `create or replace` de Postgres exige el cuerpo
-- entero, no solo el cambio.
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
  v_plan_gratis_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_admin_id) then
    raise exception 'p_admin_id % no existe en auth.users', p_admin_id;
  end if;

  if exists (select 1 from usuarios where id = p_admin_id) then
    raise exception 'Ese usuario ya pertenece a una clínica';
  end if;

  select id into v_plan_gratis_id from planes where codigo = 'gratis';

  insert into clinicas (nombre, nit, plan, plan_id)
  values (p_nombre_clinica, p_nit, 'trial', v_plan_gratis_id)
  returning id into v_clinica_id;

  insert into roles (clinica_id, nombre, descripcion, nivel)
  values (v_clinica_id, 'Administrador', 'Acceso total, bypass de RBAC (nivel=1)', 1)
  returning id into v_rol_id;

  insert into usuarios (id, clinica_id, rol_id, nombre, email)
  values (p_admin_id, v_clinica_id, v_rol_id, p_admin_nombre, p_admin_email);

  -- clinica_modulos ya no se llena a mano con una lista fija de códigos —
  -- fn_sync_clinica_modulos() la deriva del plan recién asignado (Gratis).
  perform fn_sync_clinica_modulos(v_clinica_id);

  -- Los permisos de ROL siguen siendo independientes del plan a propósito
  -- (ver has_entitlement más arriba): el rol Administrador de una clínica
  -- nueva recibe permiso RBAC completo sobre todos los módulos, aunque el
  -- plan Gratis bloquee Inventario/Campañas a nivel de entitlement — el
  -- día que la clínica pague, se desbloquea sin tener que tocar roles.
  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas', 'inventario', 'campanas');

  return v_clinica_id;
end;
$$;
