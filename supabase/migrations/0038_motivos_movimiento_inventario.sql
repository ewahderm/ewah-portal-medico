-- EWAH Tech Platform — Catálogo real para motivos de movimiento de inventario
-- Aplicar con: npx supabase db push --linked
--
-- El usuario pidió que "el tipo de movimiento de inventario sea un
-- parámetro" al ver que la tabla legada TipoMovimientoInventario era un
-- catálogo real (8 filas administrables) en vez de un enum fijo en código.
-- Alcance acordado con el usuario: SOLO los motivos que hoy se eligen de un
-- dropdown al registrar un movimiento (compra, obsequio de proveedor, saldo
-- inicial, desecho, obsequio a paciente) pasan a ser un catálogo editable
-- desde Parámetros. "tipo" (entrada/salida/ajuste) y los 3 motivos que
-- dispara el propio sistema (consumo_tratamiento, traslado, reverso_consumo)
-- NO se tocan — la migración 0016 ya dejó "tipo" deliberadamente congelado
-- porque lo usa el trigger de stock y las políticas RLS.
--
-- "motivos_insumos.motivo_movimiento" sigue siendo texto plano, guardando
-- el "codigo" estable del catálogo (igual que todos los demás catálogos de
-- Parámetros: nombre editable, código estable) — así ningún dato histórico
-- necesita reescribirse.

create table motivos_movimiento_inventario (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  categoria text not null check (categoria in ('entrada', 'salida')),
  codigo text not null,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

create trigger motivos_movimiento_inventario_set_updated_at
  before update on motivos_movimiento_inventario
  for each row execute function set_updated_at();

create index motivos_movimiento_inventario_clinica_id_idx on motivos_movimiento_inventario(clinica_id);

alter table motivos_movimiento_inventario enable row level security;

create policy "motivos_movimiento_inventario_select_propia_clinica" on motivos_movimiento_inventario
  for select using (clinica_id = clinica_actual());

create policy "motivos_movimiento_inventario_insert_con_permiso" on motivos_movimiento_inventario
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "motivos_movimiento_inventario_update_con_permiso" on motivos_movimiento_inventario
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla: los 5 motivos que ya existían hardcodeados, para cada clínica
-- existente — para que el catálogo no nazca vacío y el dropdown actual siga
-- funcionando igual el día que se despliegue esto.
insert into motivos_movimiento_inventario (clinica_id, categoria, codigo, nombre, orden)
select c.id, v.categoria, v.codigo, v.nombre, v.orden
from clinicas c
cross join (values
  ('entrada', 'compra', 'Compra', 1),
  ('entrada', 'obsequio_proveedor', 'Obsequio de proveedor', 2),
  ('entrada', 'saldo_inicial', 'Saldo inicial', 3),
  ('salida', 'desecho', 'Desecho', 1),
  ('salida', 'obsequio_paciente', 'Obsequio a paciente', 2)
) as v(categoria, codigo, nombre, orden);

-- El CHECK anterior (movimientos_insumos_motivo_check) validaba una lista
-- cerrada en código — ahora esa lista vive en la tabla de arriba y puede
-- crecer por clínica, así que el constraint se reescribe como una función
-- que consulta el catálogo (un CHECK normal no admite subconsultas). Los 3
-- motivos internos (consumo_tratamiento, traslado, reverso_consumo) los
-- sigue controlando la aplicación, no el catálogo — se permiten directo.
alter table movimientos_insumos drop constraint movimientos_insumos_motivo_check;

create or replace function fn_motivo_movimiento_valido(p_clinica_id uuid, p_tipo text, p_motivo text)
returns boolean
language sql
stable
as $$
  select p_tipo = 'ajuste'
    or p_motivo in ('consumo_tratamiento', 'traslado', 'reverso_consumo')
    or exists (
      select 1 from motivos_movimiento_inventario m
      where m.clinica_id = p_clinica_id and m.codigo = p_motivo and m.activo
    );
$$;

alter table movimientos_insumos add constraint movimientos_insumos_motivo_check
  check (fn_motivo_movimiento_valido(clinica_id, tipo, motivo_movimiento));

-- Generaliza bootstrap_clinica() (misma versión que dejó la migración 0035,
-- solo se agrega la semilla de motivos) para que las clínicas nuevas también
-- nazcan con este catálogo poblado.
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

  insert into motivos_movimiento_inventario (clinica_id, categoria, codigo, nombre, orden) values
    (v_clinica_id, 'entrada', 'compra', 'Compra', 1),
    (v_clinica_id, 'entrada', 'obsequio_proveedor', 'Obsequio de proveedor', 2),
    (v_clinica_id, 'entrada', 'saldo_inicial', 'Saldo inicial', 3),
    (v_clinica_id, 'salida', 'desecho', 'Desecho', 1),
    (v_clinica_id, 'salida', 'obsequio_paciente', 'Obsequio a paciente', 2);

  return v_clinica_id;
end;
$$;
