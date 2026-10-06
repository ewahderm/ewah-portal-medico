-- Datos básicos de la clínica: amplía lo que hoy es solo "País de
-- operación" (0048) a un formulario completo con lo que exige el registro
-- de un prestador de salud en Colombia (REPS/RIPS/INVIMA) + generalidades
-- país-agnósticas (dirección, teléfono, email, tipo de persona). Pedido
-- explícito del usuario (2026-10-06), con 3 decisiones ya confirmadas:
--   1. Solo CUPS se precarga (no CIE-11) — tabla `cups` queda creada pero
--      vacía, a la espera del archivo oficial que el usuario va a compartir.
--   2. El "nivel de riesgo" de la clínica es un valor POR DEFECTO que se
--      sugiere al crear un cargo nuevo — nunca sobreescribe el riesgo ya
--      asignado a un cargo existente (ver fn mas abajo / cargo-dialog.tsx).
--   3. Vive en /parametros, mismo lugar que "País de operación" (ya
--      documentado en 0048 por qué no es /suscripcion).

-- ============================================================
-- 1. Catálogos generales nuevos (motor genérico: id/codigo/nombre/activo)
-- ============================================================
create table tipos_persona (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tipos_persona (codigo, nombre, orden) values
  ('NATURAL', 'Persona Natural', 1),
  ('JURIDICA', 'Persona Jurídica', 2);

-- Catálogo de tipo de documento del PRESTADOR (la clínica/profesional
-- como entidad registrada ante salud) — deliberadamente separado de
-- `tipos_identificacion` (paciente/proveedor/empleado): los códigos RIPS
-- no coinciden 1:1 (NI vs. NIT, PE vs. PEP) y mezclar los dos catálogos
-- arriesgaría que un cambio pensado para pacientes rompa el reporte RIPS
-- del prestador, o viceversa.
create table tipos_documento_prestador (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tipos_documento_prestador (codigo, nombre, orden) values
  ('CC', 'Cédula de Ciudadanía', 1),
  ('CE', 'Cédula de Extranjería', 2),
  ('NI', 'NIT', 3),
  ('PA', 'Pasaporte', 4),
  ('PE', 'Permiso Especial de Permanencia', 5);

-- Rol del actor en el Registro Especial de Prestadores de Salud (REPS).
create table roles_actor_reps (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into roles_actor_reps (codigo, nombre, orden) values
  ('3', 'IPS', 1),
  ('4', 'Profesional independiente de salud', 2),
  ('5', 'Otros actores', 3);

create table tipos_transaccion_invima (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tipos_transaccion_invima (codigo, nombre, orden) values
  ('1', 'Transacción Primaria', 1),
  ('2', 'Transacción Secundaria', 2),
  ('3', 'Transacción Final', 3);

-- ============================================================
-- 2. Geografía: departamento → ciudad, en cascada desde país.
--    Nunca existió en el proyecto — `paises` era el único catálogo geo.
--    Solo se siembra Colombia (pedido explícito); para cualquier otro país
--    el combobox de departamento/ciudad simplemente aparece vacío, mismo
--    criterio ya usado en RRHH para catálogos país-dependientes sin
--    sembrar (EPS/ARL/fondos de otros países).
-- ============================================================
create table departamentos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create index idx_departamentos_pais on departamentos(pais_id);

create table ciudades (
  id uuid primary key default gen_random_uuid(),
  departamento_id uuid not null references departamentos(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ciudades_departamento on ciudades(departamento_id);

-- 33 departamentos de Colombia (códigos DANE de 2 dígitos, DIVIPOLA) + su
-- capital como primera ciudad de cada uno. Las ciudades quedan sin
-- `codigo` (DANE de 5 dígitos) a propósito — no hay forma de verificar
-- ese dato sin la fuente oficial, y el nombre es lo único que consume la
-- UI; si se necesita el código DANE completo más adelante, pedir el
-- archivo oficial de DANE/MinSalud igual que se va a hacer con CUPS.
do $$
declare
  v_pais_id uuid;
  v_dep_id uuid;
  v_dep record;
begin
  select id into v_pais_id from paises where codigo = 'CO';
  if v_pais_id is null then
    raise exception 'No se encontró el país Colombia (codigo=CO) para sembrar departamentos.';
  end if;

  for v_dep in
    select * from (values
      ('05', 'Antioquia', 'Medellín'),
      ('08', 'Atlántico', 'Barranquilla'),
      ('11', 'Bogotá D.C.', 'Bogotá D.C.'),
      ('13', 'Bolívar', 'Cartagena de Indias'),
      ('15', 'Boyacá', 'Tunja'),
      ('17', 'Caldas', 'Manizales'),
      ('18', 'Caquetá', 'Florencia'),
      ('19', 'Cauca', 'Popayán'),
      ('20', 'Cesar', 'Valledupar'),
      ('23', 'Córdoba', 'Montería'),
      ('25', 'Cundinamarca', 'Bogotá D.C.'),
      ('27', 'Chocó', 'Quibdó'),
      ('41', 'Huila', 'Neiva'),
      ('44', 'La Guajira', 'Riohacha'),
      ('47', 'Magdalena', 'Santa Marta'),
      ('50', 'Meta', 'Villavicencio'),
      ('52', 'Nariño', 'Pasto'),
      ('54', 'Norte de Santander', 'Cúcuta'),
      ('63', 'Quindío', 'Armenia'),
      ('66', 'Risaralda', 'Pereira'),
      ('68', 'Santander', 'Bucaramanga'),
      ('70', 'Sucre', 'Sincelejo'),
      ('73', 'Tolima', 'Ibagué'),
      ('76', 'Valle del Cauca', 'Cali'),
      ('81', 'Arauca', 'Arauca'),
      ('85', 'Casanare', 'Yopal'),
      ('86', 'Putumayo', 'Mocoa'),
      ('88', 'San Andrés y Providencia', 'San Andrés'),
      ('91', 'Amazonas', 'Leticia'),
      ('94', 'Guainía', 'Inírida'),
      ('95', 'Guaviare', 'San José del Guaviare'),
      ('97', 'Vaupés', 'Mitú'),
      ('99', 'Vichada', 'Puerto Carreño')
    ) as d(codigo, nombre, capital)
    order by d.nombre
  loop
    insert into departamentos (pais_id, codigo, nombre, orden)
    values (v_pais_id, v_dep.codigo, v_dep.nombre, v_dep.codigo::int)
    returning id into v_dep_id;

    insert into ciudades (departamento_id, nombre, orden)
    values (v_dep_id, v_dep.capital, 1);
  end loop;
end $$;

-- ============================================================
-- 3. CUPS (Clasificación Única de Procedimientos en Salud) — tabla
--    creada ahora, sembrada después con el archivo oficial que el
--    usuario va a compartir (decisión confirmada: NO se precarga desde
--    memoria/entrenamiento, el volumen y la exactitud regulatoria lo
--    exigen). `tipos_tratamiento.cups_id` ya puede referenciarla desde
--    ya, simplemente no tendrá opciones para elegir hasta que se importe.
-- ============================================================
create table cups (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cups_codigo on cups(codigo);

-- ============================================================
-- 4. clinicas: columnas nuevas de "datos básicos"
-- ============================================================
alter table clinicas
  add column direccion text,
  add column telefono text,
  add column email text,
  add column tipo_persona_id uuid references tipos_persona(id),
  add column tipo_documento_id uuid references tipos_documento_prestador(id),
  add column rol_actor_id uuid references roles_actor_reps(id),
  add column tipo_transaccion_invima_id uuid references tipos_transaccion_invima(id),
  add column codigo_habilitacion text,
  add column clase_riesgo_id uuid references clases_riesgo(id),
  add column departamento_id uuid references departamentos(id),
  add column ciudad_id uuid references ciudades(id);

comment on column clinicas.telefono is 'Teléfono del prestador para registro legal/RIPS — distinto de telefono_contacto (0046), que es el teléfono mostrado al paciente en correos de marca. Pueden coincidir, se guardan aparte para no acoplar branding con datos regulatorios.';
comment on column clinicas.email is 'Correo del prestador para registro legal/RIPS — distinto de correo_notificaciones (0046), mismo motivo que telefono.';
comment on column clinicas.clase_riesgo_id is 'Nivel de riesgo ARL POR DEFECTO de la clínica — se sugiere al crear un cargo nuevo en RRHH (ver cargo-dialog.tsx), nunca sobreescribe el clase_riesgo_id ya asignado a un cargo existente. El cálculo real de nómina siempre usa el riesgo del cargo, no este campo.';

-- ============================================================
-- 5. proveedores: tipo de persona
-- ============================================================
alter table proveedores add column tipo_persona_id uuid references tipos_persona(id);

-- ============================================================
-- 6. tipos_tratamiento: código de habilitación propio + CUPS asociado.
--    Esto saca a tipos_tratamiento del motor genérico de Parámetros (solo
--    soporta nombre+código) — pasa al patrón "a medida" como
--    proveedores/cargos, con su propio diálogo/tabla.
-- ============================================================
alter table tipos_tratamiento
  add column codigo_habilitacion text,
  add column cups_id uuid references cups(id);

-- ============================================================
-- 7. RPC para guardar los datos básicos — mismo patrón que
--    fn_actualizar_marca_propia_clinica (0046) / fn_actualizar_pais_y_
--    exoneracion_clinica (0048): `clinicas` no tiene policy de UPDATE
--    para authenticated, esta función security definer es la única
--    puerta, limitada a la propia clínica y solo para admin. Reemplaza
--    en la práctica a fn_actualizar_pais_y_exoneracion_clinica (que queda
--    sin uso pero no se borra, nunca se eliminan funciones en este
--    proyecto una vez creadas).
-- ============================================================
create or replace function fn_actualizar_datos_basicos_clinica(
  p_pais_operacion_id uuid,
  p_exoneracion_aportes boolean,
  p_direccion text,
  p_telefono text,
  p_email text,
  p_tipo_persona_id uuid,
  p_tipo_documento_id uuid,
  p_rol_actor_id uuid,
  p_tipo_transaccion_invima_id uuid,
  p_codigo_habilitacion text,
  p_clase_riesgo_id uuid,
  p_departamento_id uuid,
  p_ciudad_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar esta configuración.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  if not exists (select 1 from paises where id = p_pais_operacion_id) then
    raise exception 'País inválido.';
  end if;

  update clinicas
  set pais_operacion_id = p_pais_operacion_id,
      exoneracion_aportes_salud_parafiscales = p_exoneracion_aportes,
      direccion = nullif(trim(p_direccion), ''),
      telefono = nullif(trim(p_telefono), ''),
      email = nullif(trim(p_email), ''),
      tipo_persona_id = p_tipo_persona_id,
      tipo_documento_id = p_tipo_documento_id,
      rol_actor_id = p_rol_actor_id,
      tipo_transaccion_invima_id = p_tipo_transaccion_invima_id,
      codigo_habilitacion = nullif(trim(p_codigo_habilitacion), ''),
      clase_riesgo_id = p_clase_riesgo_id,
      departamento_id = p_departamento_id,
      ciudad_id = p_ciudad_id
  where id = v_clinica_id;
end;
$$;

revoke all on function fn_actualizar_datos_basicos_clinica from public, anon, authenticated;
grant execute on function fn_actualizar_datos_basicos_clinica to authenticated;

-- ============================================================
-- 8. Registrar los catálogos nuevos en RBAC de Parámetros no hace falta
--    (ya existe el módulo "parametros" desde 0001) — solo falta que RLS
--    permita leer las tablas nuevas a cualquier usuario autenticado
--    (son catálogos globales de solo lectura para la clínica, igual que
--    paises/tipos_identificacion).
-- ============================================================
alter table tipos_persona enable row level security;
alter table tipos_documento_prestador enable row level security;
alter table roles_actor_reps enable row level security;
alter table tipos_transaccion_invima enable row level security;
alter table departamentos enable row level security;
alter table ciudades enable row level security;
alter table cups enable row level security;

create policy "tipos_persona_select_all" on tipos_persona for select to authenticated using (true);
create policy "tipos_documento_prestador_select_all" on tipos_documento_prestador for select to authenticated using (true);
create policy "roles_actor_reps_select_all" on roles_actor_reps for select to authenticated using (true);
create policy "tipos_transaccion_invima_select_all" on tipos_transaccion_invima for select to authenticated using (true);
create policy "departamentos_select_all" on departamentos for select to authenticated using (true);
create policy "ciudades_select_all" on ciudades for select to authenticated using (true);
create policy "cups_select_all" on cups for select to authenticated using (true);
