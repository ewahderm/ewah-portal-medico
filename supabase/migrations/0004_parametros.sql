-- EWAH Tech Platform — Módulo Parámetros (datos maestros / tablas de referencia)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Ver docs/spec-ewah-app.md §2.11, §8.9 para el diseño funcional original.
--
-- Los 5 catálogos de esta migración son GLOBALES (mismos para todas las
-- clínicas — estándares nacionales colombianos): solo lectura para
-- clínicas, administrados por EWAH Tech vía service_role. Catálogos
-- futuros que cada clínica deba personalizar (Sede, Consultorio, etc.)
-- llevarán clinica_id + políticas de escritura para es_admin(), siguiendo
-- el mismo patrón de columnas para que la UI/acciones sigan siendo
-- genéricas.

create table tipos_identificacion (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table generos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table paises (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table eps (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table medios_contacto (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tipos_identificacion_set_updated_at before update on tipos_identificacion for each row execute function set_updated_at();
create trigger generos_set_updated_at before update on generos for each row execute function set_updated_at();
create trigger paises_set_updated_at before update on paises for each row execute function set_updated_at();
create trigger eps_set_updated_at before update on eps for each row execute function set_updated_at();
create trigger medios_contacto_set_updated_at before update on medios_contacto for each row execute function set_updated_at();

-- RLS: lectura para cualquier autenticado, escritura solo service_role
alter table tipos_identificacion enable row level security;
alter table generos enable row level security;
alter table paises enable row level security;
alter table eps enable row level security;
alter table medios_contacto enable row level security;

create policy "tipos_identificacion_select_all" on tipos_identificacion for select to authenticated using (true);
create policy "generos_select_all" on generos for select to authenticated using (true);
create policy "paises_select_all" on paises for select to authenticated using (true);
create policy "eps_select_all" on eps for select to authenticated using (true);
create policy "medios_contacto_select_all" on medios_contacto for select to authenticated using (true);

-- ============================================================
-- Seed: valores iniciales (catálogo base — EWAH Tech lo mantiene)
-- ============================================================
insert into tipos_identificacion (codigo, nombre, orden) values
  ('CC', 'Cédula de Ciudadanía', 1),
  ('TI', 'Tarjeta de Identidad', 2),
  ('CE', 'Cédula de Extranjería', 3),
  ('PA', 'Pasaporte', 4),
  ('RC', 'Registro Civil', 5),
  ('PEP', 'Permiso Especial de Permanencia', 6),
  ('NIT', 'NIT', 7);

insert into generos (codigo, nombre, orden) values
  ('M', 'Masculino', 1),
  ('F', 'Femenino', 2),
  ('O', 'Otro', 3);

insert into paises (codigo, nombre, orden) values
  ('CO', 'Colombia', 1),
  ('VE', 'Venezuela', 2),
  ('EC', 'Ecuador', 3),
  ('PE', 'Perú', 4),
  ('MX', 'México', 5),
  ('AR', 'Argentina', 6),
  ('CL', 'Chile', 7),
  ('BR', 'Brasil', 8),
  ('BO', 'Bolivia', 9),
  ('PA', 'Panamá', 10),
  ('CR', 'Costa Rica', 11),
  ('ES', 'España', 12),
  ('US', 'Estados Unidos', 13),
  ('CA', 'Canadá', 14),
  ('DO', 'República Dominicana', 15),
  ('CU', 'Cuba', 16),
  ('HN', 'Honduras', 17),
  ('GT', 'Guatemala', 18),
  ('SV', 'El Salvador', 19),
  ('NI', 'Nicaragua', 20),
  ('UY', 'Uruguay', 21),
  ('PY', 'Paraguay', 22),
  ('IT', 'Italia', 23),
  ('FR', 'Francia', 24),
  ('DE', 'Alemania', 25),
  ('OTRO', 'Otro', 99);

-- Lista base de EPS colombianas activas — revisar/actualizar periódicamente,
-- el sector tiene liquidaciones e intervenciones con cierta frecuencia.
insert into eps (codigo, nombre, orden) values
  ('NUEVA_EPS', 'Nueva EPS', 1),
  ('SURA', 'EPS Sura', 2),
  ('SANITAS', 'EPS Sanitas', 3),
  ('COMPENSAR', 'Compensar EPS', 4),
  ('FAMISANAR', 'Famisanar', 5),
  ('SALUD_TOTAL', 'Salud Total EPS', 6),
  ('COOSALUD', 'Coosalud EPS', 7),
  ('MUTUAL_SER', 'Mutual Ser', 8),
  ('ALIANSALUD', 'Aliansalud EPS', 9),
  ('COMFENALCO_VALLE', 'Comfenalco Valle EPS', 10),
  ('CAPITAL_SALUD', 'Capital Salud EPS', 11),
  ('SOS', 'Servicio Occidental de Salud (SOS)', 12),
  ('EPM_FAMILIAR', 'EPS Familiar de Colombia', 13),
  ('PARTICULAR', 'Particular (sin EPS)', 98),
  ('OTRA', 'Otra', 99);

insert into medios_contacto (codigo, nombre, orden) values
  ('CELULAR', 'Celular / WhatsApp', 1),
  ('TELEFONO', 'Teléfono fijo', 2),
  ('EMAIL', 'Correo electrónico', 3),
  ('PRESENCIAL', 'Presencial', 4),
  ('SMS', 'SMS', 5);

-- ============================================================
-- Registrar el módulo "parametros" en RBAC y habilitarlo para
-- todas las clínicas existentes (catálogos globales, VIEW para todos)
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('parametros', 'Parámetros', 'Catálogos de referencia usados en toda la plataforma (tipos de identificación, géneros, países, EPS, medios de contacto)', '/parametros', 1, true);

insert into clinica_modulos (clinica_id, modulo_id)
select c.id, m.id from clinicas c cross join modulos m where m.codigo = 'parametros'
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'parametros' and p.codigo = 'VIEW'
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas que se registren
-- de ahora en adelante también reciban el módulo Parámetros habilitado.
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
  select v_clinica_id, id from modulos where codigo in ('usuarios', 'parametros');

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros');

  return v_clinica_id;
end;
$$;
