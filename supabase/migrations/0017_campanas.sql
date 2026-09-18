-- EWAH Tech Platform — Módulo Campañas (funnel ligero de marketing)
-- Aplicar con: npx supabase db push --linked
--
-- Decisión acordada con el usuario: un funnel ligero sobre lo que ya
-- existe, no un CRM de leads paralelo. Una Campaña es un contenedor
-- (nombre, canal, fechas, presupuesto) que se asocia a Pacientes ya
-- reales del sistema (campana_id opcional en pacientes, más específico
-- que canal_captacion_id — "Instagram" es el canal, "Promo Botox marzo"
-- sería la campaña). El embudo (Leads → Contactados → Agendaron cita →
-- Se convirtieron en tratamiento → Ingresos) se calcula en la aplicación
-- a partir de tablas que ya existen (pacientes/contactos_paciente/citas/
-- tratamientos) — no hay una tabla de "etapas" que mantener a mano.

create table campanas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  nombre text not null,
  canal_captacion_id uuid references canales_captacion(id),
  fecha_inicio date,
  fecha_fin date,
  presupuesto numeric(12, 2),
  objetivo text,
  activo boolean not null default true,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campanas_set_updated_at
  before update on campanas
  for each row execute function set_updated_at();

create index campanas_clinica_id_idx on campanas(clinica_id);

alter table campanas enable row level security;

create policy "campanas_select_propia_clinica" on campanas
  for select using (clinica_id = clinica_actual());

create policy "campanas_insert_con_permiso" on campanas
  for insert with check (
    clinica_id = clinica_actual() and has_permission('campanas', 'CREATE')
  );

create policy "campanas_update_con_permiso" on campanas
  for update using (
    clinica_id = clinica_actual() and has_permission('campanas', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- Vincular pacientes a una campaña (opcional, más específico que
-- canal_captacion_id)
-- ============================================================
alter table pacientes add column campana_id uuid references campanas(id);
create index pacientes_campana_id_idx on pacientes(campana_id);

-- ============================================================
-- Registrar el módulo en RBAC
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('campanas', 'Campañas', 'Funnel de campañas de marketing', '/campanas', 6, false);

insert into clinica_modulos (clinica_id, modulo_id)
select c.id, m.id from clinicas c cross join modulos m where m.codigo = 'campanas'
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'campanas' and p.codigo in ('VIEW', 'CREATE', 'EDIT')
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas nuevas también
-- reciban el módulo Campañas habilitado desde el registro.
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
  select v_clinica_id, id from modulos
  where codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas', 'inventario', 'campanas');

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas', 'inventario', 'campanas');

  return v_clinica_id;
end;
$$;
