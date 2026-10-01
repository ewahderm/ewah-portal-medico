-- EWAH Tech Platform — Módulo Medio Ambiente (cumplimiento normativo)
-- Aplicar con: npx supabase db push --linked
--
-- 5 registros exigidos por la normativa colombiana de salud, agrupados en
-- un solo módulo porque comparten el mismo propósito (evidencia de
-- cumplimiento verificable en una visita de habilitación/auditoría), no
-- porque compartan estructura de datos:
--  1. Temperatura/humedad de consultorios (registro ambiental, ~diario).
--  2. Temperatura de neveras (cadena de frío). La práctica real (manual de
--     cadena de frío del PAI) es 2 veces al día, pero el esquema NO fuerza
--     esa cardinalidad — se registra cuantas veces haga falta, solo con
--     fecha+hora, para no bloquear a una clínica que mida distinto.
--  3. Peso de residuos por categoría — Resolución 1164/2002 (roja:
--     biosanitario/cortopunzante/anatomopatológico/químico, sigue vigente
--     para peligrosos) + Resolución 2184/2019 + 1344/2020 (código de
--     colores nacional: blanca=aprovechable, negra=no aprovechable, en
--     salud desde jul-2022). El usuario pidió separar explícitamente
--     "guardianes de cortopunzantes" y "residuos químicos" del resto de lo
--     rojo — se modelan como valores propios de tipo_residuo, no como un
--     solo "rojo" genérico.
--  4. Extintores — NTC 2885. fecha_vencimiento es un campo que LLENA la
--     clínica directamente (lo que diga el sticker físico del extintor,
--     según tipo/norma) — no se calcula aquí con una fórmula, la
--     normativa varía demasiado para codificar una regla confiable.
--  5. Limpieza de consultorios y baños — Resolución 3100/2019. Un baño no
--    es un consultorio (no cuelga de consultorio_id), así que el área se
--    modela con un tipo (consultorio|bano) + referencia condicional.
--    El responsable es SIEMPRE el usuario de la sesión que registra
--    (created_by), nunca un campo de texto libre editable.
--
-- Decisión de permisos (ver conversación con el usuario): estos 5
-- registros son evidencia legal igual que Tratamientos/Inventario, así
-- que los 4 registros de "bitácora" (temperatura consultorio, temperatura
-- nevera, residuos, limpieza) son estrictamente append-only — ni siquiera
-- existe policy de UPDATE/DELETE para esas 4 tablas, por lo que ni un
-- Administrador puede alterarlas desde el cliente (equivalente a no tener
-- mecanismo de "corregir/anular" en absoluto, a propósito: son lecturas de
-- un instrumento o un hecho ocurrido, no algo que se "corrija"). Extintores
-- es la excepción: es un catálogo de ACTIVOS FÍSICOS (como Proveedores/
-- Consultorios), no una bitácora — necesita EDIT real para actualizar
-- fecha de recarga/vencimiento/ubicación a medida que se les da
-- mantenimiento. fn_auditoria() ya dentro cubre la trazabilidad de esos
-- cambios, así que no hace falta un VOID/anulación aparte; "dar de baja"
-- es simplemente activo=false bajo el mismo permiso EDIT (mismo patrón
-- que consultorios/proveedores, no el patrón anular-con-motivo de
-- Tratamientos). Por eso los permisos del módulo son solo VIEW/CREATE/EDIT
-- (no VOID).
--
-- Es administrativo = true: es un requisito legal de la clínica como
-- entidad, no una feature premium — va incluido en TODOS los planes desde
-- el día uno (igual criterio que Usuarios/Parámetros/Suscripción), nunca
-- gateado por has_entitlement().

-- ============================================================
-- 0. Tipos de extintor — catálogo por-clínica vía el motor genérico de
--    Parámetros (solo nombre+código, no necesita campos propios, a
--    diferencia de Consultorios/Insumos/Proveedores).
-- ============================================================
create table tipos_extintor (
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

create trigger tipos_extintor_set_updated_at
  before update on tipos_extintor
  for each row execute function set_updated_at();

create index tipos_extintor_clinica_id_idx on tipos_extintor(clinica_id);

alter table tipos_extintor enable row level security;

create policy "tipos_extintor_select_propia_clinica" on tipos_extintor
  for select using (clinica_id = clinica_actual());

create policy "tipos_extintor_insert_con_permiso" on tipos_extintor
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "tipos_extintor_update_con_permiso" on tipos_extintor
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla con los tipos estándar NTC 2885 — editable/ampliable desde
-- /parametros si una clínica usa otro (ej. Solkaflam/HCFC-123).
insert into tipos_extintor (clinica_id, codigo, nombre, orden)
select c.id, seed.codigo, seed.nombre, seed.orden
from clinicas c
cross join (values
  ('PQS', 'Polvo químico seco (PQS)', 1),
  ('CO2', 'Dióxido de carbono (CO2)', 2),
  ('AGUA', 'Agua a presión', 3),
  ('ESPUMA', 'Espuma (AFFF)', 4),
  ('MULTIPROPOSITO', 'Multipropósito ABC', 5)
) as seed(codigo, nombre, orden)
where c.nit = '901759965';

-- ============================================================
-- 1. Temperatura y humedad de consultorios
-- ============================================================
create table registros_temperatura_consultorio (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  consultorio_id uuid not null references consultorios(id),
  registrado_en timestamptz not null default now(),
  temperatura_celsius numeric(5, 2) not null,
  humedad_porcentaje numeric(5, 2),
  observaciones text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  check (humedad_porcentaje is null or (humedad_porcentaje between 0 and 100))
);

create index registros_temp_consultorio_clinica_idx
  on registros_temperatura_consultorio(clinica_id, registrado_en desc);
create index registros_temp_consultorio_consultorio_idx
  on registros_temperatura_consultorio(consultorio_id, registrado_en desc);

create trigger registros_temp_consultorio_auditoria
  after insert or update or delete on registros_temperatura_consultorio
  for each row execute function fn_auditoria();

alter table registros_temperatura_consultorio enable row level security;

create policy "registros_temp_consultorio_select_propia_clinica" on registros_temperatura_consultorio
  for select using (clinica_id = clinica_actual());

create policy "registros_temp_consultorio_insert_con_permiso" on registros_temperatura_consultorio
  for insert with check (
    clinica_id = clinica_actual() and has_permission('medio_ambiente', 'CREATE')
  );

-- ============================================================
-- 2. Temperatura de neveras (cadena de frío)
-- ============================================================
create table registros_temperatura_nevera (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  -- Identificador libre de la nevera (ej. "Nevera 1", "Nevera farmacia") —
  -- la mayoría de clínicas tiene 1-2 por sede, no amerita otro catálogo.
  nevera text not null default 'Principal',
  registrado_en timestamptz not null default now(),
  temperatura_celsius numeric(5, 2) not null,
  observaciones text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index registros_temp_nevera_clinica_idx
  on registros_temperatura_nevera(clinica_id, registrado_en desc);
create index registros_temp_nevera_sede_idx
  on registros_temperatura_nevera(sede_id, registrado_en desc);

create trigger registros_temp_nevera_auditoria
  after insert or update or delete on registros_temperatura_nevera
  for each row execute function fn_auditoria();

alter table registros_temperatura_nevera enable row level security;

create policy "registros_temp_nevera_select_propia_clinica" on registros_temperatura_nevera
  for select using (clinica_id = clinica_actual());

create policy "registros_temp_nevera_insert_con_permiso" on registros_temperatura_nevera
  for insert with check (
    clinica_id = clinica_actual() and has_permission('medio_ambiente', 'CREATE')
  );

-- ============================================================
-- 3. Peso de residuos por categoría (Res. 1164/2002 + 2184/2019 + 1344/2020)
-- ============================================================
create table registros_residuos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  -- roja: biosanitario/cortopunzante/anatomopatologico/quimico (Res. 1164/2002)
  -- blanca: aprovechable · negra: no_aprovechable (Res. 2184/2019 + 1344/2020)
  tipo_residuo text not null check (
    tipo_residuo in (
      'biosanitario', 'cortopunzante', 'anatomopatologico', 'quimico',
      'aprovechable', 'no_aprovechable'
    )
  ),
  peso_kg numeric(8, 3) not null check (peso_kg > 0),
  registrado_en timestamptz not null default now(),
  observaciones text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index registros_residuos_clinica_idx
  on registros_residuos(clinica_id, registrado_en desc);
create index registros_residuos_sede_idx
  on registros_residuos(sede_id, registrado_en desc);
create index registros_residuos_tipo_idx
  on registros_residuos(clinica_id, tipo_residuo);

create trigger registros_residuos_auditoria
  after insert or update or delete on registros_residuos
  for each row execute function fn_auditoria();

alter table registros_residuos enable row level security;

create policy "registros_residuos_select_propia_clinica" on registros_residuos
  for select using (clinica_id = clinica_actual());

create policy "registros_residuos_insert_con_permiso" on registros_residuos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('medio_ambiente', 'CREATE')
  );

-- ============================================================
-- 4. Extintores (NTC 2885) — catálogo de activos físicos, SÍ editable
-- ============================================================
create table extintores (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  tipo_extintor_id uuid not null references tipos_extintor(id),
  ubicacion text not null,
  numero_serie text,
  capacidad text,
  fecha_adquisicion date,
  fecha_ultima_recarga date,
  -- Próxima fecha a la que hay que estar atento (recarga o prueba
  -- hidrostática) — la determina la clínica leyendo el sticker físico del
  -- extintor, NUNCA calculada aquí: la norma varía según tipo de extintor
  -- y no hay una fórmula única confiable.
  fecha_vencimiento date not null,
  observaciones text,
  activo boolean not null default true,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger extintores_set_updated_at
  before update on extintores
  for each row execute function set_updated_at();

create trigger extintores_auditoria
  after insert or update or delete on extintores
  for each row execute function fn_auditoria();

create index extintores_clinica_idx on extintores(clinica_id);
create index extintores_sede_idx on extintores(sede_id);
create index extintores_vencimiento_idx on extintores(clinica_id, fecha_vencimiento);

alter table extintores enable row level security;

create policy "extintores_select_propia_clinica" on extintores
  for select using (clinica_id = clinica_actual());

create policy "extintores_insert_con_permiso" on extintores
  for insert with check (
    clinica_id = clinica_actual() and has_permission('medio_ambiente', 'CREATE')
  );

-- Única vía de UPDATE: edición de datos de mantenimiento y dar de
-- baja/reactivar (activo=false/true) — ambos bajo el mismo permiso EDIT,
-- igual que Consultorios/Proveedores. fn_auditoria() ya registra cada
-- cambio con su antes/después, así que no hace falta un VOID separado.
create policy "extintores_update_con_permiso" on extintores
  for update using (
    clinica_id = clinica_actual() and has_permission('medio_ambiente', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 5. Limpieza de consultorios y baños (Resolución 3100/2019)
-- ============================================================
create table registros_limpieza (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  area_tipo text not null check (area_tipo in ('consultorio', 'bano')),
  consultorio_id uuid references consultorios(id),
  -- Solo se usa cuando area_tipo='bano' (un baño no es un consultorio,
  -- no tiene fila propia en esa tabla) — ej. "Baño de pacientes".
  area_nombre text,
  registrado_en timestamptz not null default now(),
  observaciones text,
  -- El responsable SIEMPRE es quien hizo el registro (sesión actual) — no
  -- un campo de texto libre editable, por eso es not null y no hay forma
  -- de pasarlo distinto desde el formulario.
  created_by uuid not null references usuarios(id),
  created_at timestamptz not null default now(),
  check (
    (area_tipo = 'consultorio' and consultorio_id is not null and area_nombre is null)
    or (area_tipo = 'bano' and consultorio_id is null and area_nombre is not null)
  )
);

create index registros_limpieza_clinica_idx
  on registros_limpieza(clinica_id, registrado_en desc);
create index registros_limpieza_sede_idx
  on registros_limpieza(sede_id, registrado_en desc);

create trigger registros_limpieza_auditoria
  after insert or update or delete on registros_limpieza
  for each row execute function fn_auditoria();

alter table registros_limpieza enable row level security;

create policy "registros_limpieza_select_propia_clinica" on registros_limpieza
  for select using (clinica_id = clinica_actual());

create policy "registros_limpieza_insert_con_permiso" on registros_limpieza
  for insert with check (
    clinica_id = clinica_actual() and has_permission('medio_ambiente', 'CREATE')
  );

-- ============================================================
-- 6. Registrar el módulo en RBAC — incluido en TODOS los planes
--    (es_administrativo=true, mismo criterio que Usuarios/Parámetros/
--    Suscripción: es un requisito legal de la clínica, no una feature de
--    plan — jamás pasa por has_entitlement()).
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  (
    'medio_ambiente',
    'Medio Ambiente',
    'Temperatura/humedad, cadena de frío, residuos, extintores y limpieza — registros de cumplimiento normativo.',
    '/medio-ambiente',
    8,
    true
  );

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p
cross join modulos m
where m.codigo = 'medio_ambiente';

-- Sincroniza clinicas ya existentes (fn_sync_clinica_modulos ya lo hace
-- solo para clínicas nuevas vía bootstrap_clinica).
do $$
declare
  v_clinica record;
begin
  for v_clinica in select id from clinicas loop
    perform fn_sync_clinica_modulos(v_clinica.id);
  end loop;
end;
$$;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'medio_ambiente' and p.codigo in ('VIEW', 'CREATE', 'EDIT')
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas nuevas también
-- reciban permiso de rol sobre Medio Ambiente (clinica_modulos ya queda
-- cubierto por fn_sync_clinica_modulos, que bootstrap_clinica ya llama).
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

  perform fn_sync_clinica_modulos(v_clinica_id);

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in (
    'usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas',
    'inventario', 'campanas', 'suscripcion', 'medio_ambiente'
  );

  return v_clinica_id;
end;
$$;
