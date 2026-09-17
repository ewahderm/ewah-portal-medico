-- EWAH Tech Platform — Módulo Tratamientos (núcleo clínico)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Ver docs/spec-ewah-app.md para el diseño funcional original.
--
-- Decisiones acordadas con el usuario antes de construir este módulo:
--  - Append-only con correcciones: un tratamiento NUNCA se edita in-place
--    (trigger fn_tratamientos_solo_anular lo impide a nivel de base de
--    datos, no solo en la app). Si hay un error, se anula el registro
--    original (con motivo) y se crea uno nuevo que lo corrige
--    (columna corrige_a) — la historia real de lo que pasó queda intacta.
--  - Edad del paciente al momento del tratamiento: se calcula y guarda
--    automáticamente en el propio INSERT (trigger fn_calcular_edad_tratamiento
--    a partir de pacientes.fecha_nacimiento + tratamientos.fecha), nunca
--    depende de que alguien la escriba a mano. Si el paciente no tiene
--    fecha de nacimiento registrada, queda en null (no bloquea el guardado).
--  - "Tipo de tratamiento" es el primer catálogo POR CLÍNICA del módulo
--    Parámetros (cada clínica define su propio menú de tratamientos) —
--    mismo motor genérico de siempre, solo con clinica_id + RLS de escritura
--    para es_admin()/has_permission('parametros', ...) en vez de solo-lectura.
--  - Fotos antes/después: bucket privado de Storage con aislamiento por
--    clínica vía políticas sobre storage.objects (mismo patrón que RLS
--    normal, pero storage no usa clinica_actual() en el FROM sino en el
--    primer segmento de la ruta del archivo).
--  - Reutiliza fn_auditoria() (0007) para trazabilidad de INSERT/UPDATE
--    (anulaciones) — una sola línea de trigger, sin reescribir nada.

-- ============================================================
-- Catálogo por-clínica: Tipos de tratamiento (vía Parámetros)
-- ============================================================
create table tipos_tratamiento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

create trigger tipos_tratamiento_set_updated_at
  before update on tipos_tratamiento
  for each row execute function set_updated_at();

create index tipos_tratamiento_clinica_id_idx on tipos_tratamiento(clinica_id);

alter table tipos_tratamiento enable row level security;

create policy "tipos_tratamiento_select_propia_clinica" on tipos_tratamiento
  for select using (clinica_id = clinica_actual());

create policy "tipos_tratamiento_insert_con_permiso" on tipos_tratamiento
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "tipos_tratamiento_update_con_permiso" on tipos_tratamiento
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla solo para EWAH S.A.S. (primer tenant) — clínicas nuevas arrancan
-- su propio catálogo vacío y lo arman desde /parametros, como corresponde
-- a un catálogo por-clínica.
insert into tipos_tratamiento (clinica_id, codigo, nombre, orden)
select c.id, seed.codigo, seed.nombre, seed.orden
from clinicas c
cross join (values
  ('BOTOX', 'Toxina botulínica (Botox)', 1),
  ('ACIDO_HIALURONICO', 'Ácido hialurónico', 2),
  ('LIMPIEZA_FACIAL', 'Limpieza facial', 3),
  ('PEELING', 'Peeling químico', 4),
  ('OTRO', 'Otro', 99)
) as seed(codigo, nombre, orden)
where c.nit = '901759965';

-- ============================================================
-- Tratamientos: núcleo clínico, append-only
-- ============================================================
create table tratamientos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id),
  tipo_tratamiento_id uuid not null references tipos_tratamiento(id),
  profesional_id uuid not null references usuarios(id),
  fecha date not null default current_date,
  -- Calculada automáticamente por fn_calcular_edad_tratamiento(), no se
  -- recibe del formulario. Dato histórico inmutable para análisis por edad.
  edad_paciente int,
  costo numeric(12, 2),
  notas text,
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_por uuid references usuarios(id),
  anulado_en timestamptz,
  -- Si este registro corrige uno anterior (que quedó anulado), apunta a él.
  corrige_a uuid references tratamientos(id),
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index tratamientos_clinica_id_idx on tratamientos(clinica_id);
create index tratamientos_paciente_id_idx on tratamientos(paciente_id);
create index tratamientos_clinica_fecha_idx on tratamientos(clinica_id, fecha desc);

-- Calcula edad_paciente en el propio INSERT — security definer porque
-- necesita leer pacientes.fecha_nacimiento sin depender de qué RLS vea
-- el rol que ejecuta el INSERT (mismo patrón que has_permission()).
create or replace function fn_calcular_edad_tratamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha_nacimiento date;
begin
  select fecha_nacimiento into v_fecha_nacimiento
  from pacientes where id = new.paciente_id;

  if v_fecha_nacimiento is not null then
    new.edad_paciente := extract(year from age(new.fecha, v_fecha_nacimiento));
  end if;

  return new;
end;
$$;

create trigger tratamientos_calcular_edad
  before insert on tratamientos
  for each row execute function fn_calcular_edad_tratamiento();

-- Impide editar el contenido clínico de un tratamiento ya guardado. La
-- única actualización permitida es "anular" (anulado/anulado_motivo/
-- anulado_por/anulado_en) — todo lo demás debe quedarse igual o la
-- transacción falla. Para corregir un dato, se anula y se crea un
-- registro nuevo con corrige_a apuntando al original.
create or replace function fn_tratamientos_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if new.clinica_id is distinct from old.clinica_id
    or new.paciente_id is distinct from old.paciente_id
    or new.tipo_tratamiento_id is distinct from old.tipo_tratamiento_id
    or new.profesional_id is distinct from old.profesional_id
    or new.fecha is distinct from old.fecha
    or new.edad_paciente is distinct from old.edad_paciente
    or new.costo is distinct from old.costo
    or new.notas is distinct from old.notas
    or new.corrige_a is distinct from old.corrige_a
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;
  return new;
end;
$$;

create trigger tratamientos_solo_anular
  before update on tratamientos
  for each row execute function fn_tratamientos_solo_anular();

create trigger tratamientos_auditoria
  after insert or update or delete on tratamientos
  for each row execute function fn_auditoria();

alter table tratamientos enable row level security;

create policy "tratamientos_select_propia_clinica" on tratamientos
  for select using (clinica_id = clinica_actual());

create policy "tratamientos_insert_con_permiso" on tratamientos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );

-- Único UPDATE permitido: anular (con motivo). El trigger de arriba ya
-- garantiza que no se pueda colar un cambio a los datos clínicos.
create policy "tratamientos_anular_con_permiso" on tratamientos
  for update using (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'VOID')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- Fotos antes/después
-- ============================================================
insert into storage.buckets (id, name, public)
values ('tratamiento-fotos', 'tratamiento-fotos', false)
on conflict (id) do nothing;

-- Ruta de archivo: "<clinica_id>/<tratamiento_id>/<archivo>" — el primer
-- segmento de la ruta hace de límite de aislamiento entre clínicas.
create policy "tratamiento_fotos_storage_select" on storage.objects
  for select using (
    bucket_id = 'tratamiento-fotos'
    and (storage.foldername(name))[1] = clinica_actual()::text
  );

create policy "tratamiento_fotos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'tratamiento-fotos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('tratamientos', 'CREATE')
  );

create policy "tratamiento_fotos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'tratamiento-fotos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

create table tratamiento_fotos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tratamiento_id uuid not null references tratamientos(id) on delete cascade,
  storage_path text not null,
  etiqueta text not null check (etiqueta in ('antes', 'despues')),
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index tratamiento_fotos_tratamiento_id_idx on tratamiento_fotos(tratamiento_id);

alter table tratamiento_fotos enable row level security;

create policy "tratamiento_fotos_select_propia_clinica" on tratamiento_fotos
  for select using (clinica_id = clinica_actual());

create policy "tratamiento_fotos_insert_con_permiso" on tratamiento_fotos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );

create policy "tratamiento_fotos_delete_admin" on tratamiento_fotos
  for delete using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- Registrar el módulo en RBAC. Sin EDIT: el contenido clínico no se
-- edita (ver fn_tratamientos_solo_anular). VOID = anular.
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('tratamientos', 'Tratamientos', 'Historia clínica: tratamientos realizados a cada paciente', '/tratamientos', 3, false);

insert into clinica_modulos (clinica_id, modulo_id)
select c.id, m.id from clinicas c cross join modulos m where m.codigo = 'tratamientos'
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'tratamientos' and p.codigo in ('VIEW', 'CREATE', 'VOID')
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas que se registren
-- de ahora en adelante también reciban el módulo Tratamientos habilitado.
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
  select v_clinica_id, id from modulos where codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos');

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos');

  return v_clinica_id;
end;
$$;
