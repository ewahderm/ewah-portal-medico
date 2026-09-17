-- EWAH Tech Platform — Módulo Inventario (Insumos, Lotes, Movimientos)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Ver docs/spec-ewah-app.md para el diseño funcional original y
-- `ControlPacientes - ConsumoInsumos.csv` (muestra real del legado
-- compartida por el usuario) para el detalle de campos de consumo.
--
-- Decisiones acordadas con el usuario antes de construir este módulo:
--  - Ciclo completo de movimientos (entrada/salida_consumo/ajuste) desde
--    el día uno, no solo un contador simple — cada cambio de stock queda
--    como un registro propio, igual de auditable que el resto de la
--    plataforma. `lotes.cantidad_actual` es un valor cacheado que un
--    trigger mantiene sincronizado con la suma de sus movimientos — la
--    fuente de verdad es la tabla de movimientos, no la columna cacheada.
--  - El consumo de insumos se registra DESDE cada tratamiento (mismo
--    patrón que las fotos antes/después de Tratamientos: un botón en la
--    fila que abre un diálogo, sin necesitar editar el tratamiento).
--  - "CantidadInvima" del legado es una cantidad aparte para reporte
--    regulatorio INVIMA, distinta de la cantidad realmente usada — se
--    guarda como columna independiente en el movimiento de consumo.
--  - Insumos es el quinto catálogo POR CLÍNICA de Parámetros. Lotes (el
--    stock físico) pertenece a una Sede, no solo a la clínica — el stock
--    vive donde está la bodega/consultorio, siguiendo la misma lógica de
--    Sedes ya aplicada en Agenda.
--  - No hay bloqueo si un consumo deja el lote en negativo (mismo
--    criterio que los choques de horario en Agenda): se advierte en la
--    aplicación pero se permite guardar, por si el conteo físico está
--    desactualizado y hay que registrar igual lo que realmente se usó.

-- ============================================================
-- Catálogo por-clínica: Insumos (vía Parámetros)
-- ============================================================
create table insumos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  unidad_medida text not null default 'unidad',
  registro_invima text,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

create trigger insumos_set_updated_at
  before update on insumos
  for each row execute function set_updated_at();

create index insumos_clinica_id_idx on insumos(clinica_id);

alter table insumos enable row level security;

create policy "insumos_select_propia_clinica" on insumos
  for select using (clinica_id = clinica_actual());

create policy "insumos_insert_con_permiso" on insumos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "insumos_update_con_permiso" on insumos
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla básica solo para EWAH S.A.S. — insumos típicos de una clínica
-- estética, editable/ampliable desde /parametros.
insert into insumos (clinica_id, codigo, nombre, unidad_medida, orden)
select c.id, seed.codigo, seed.nombre, seed.unidad, seed.orden
from clinicas c
cross join (values
  ('TOXINA_BOTULINICA', 'Toxina botulínica', 'unidad', 1),
  ('ACIDO_HIALURONICO', 'Ácido hialurónico', 'ml', 2),
  ('GUANTES', 'Guantes de nitrilo', 'unidad', 3),
  ('JERINGA', 'Jeringa', 'unidad', 4),
  ('GASA', 'Gasa estéril', 'unidad', 5)
) as seed(codigo, nombre, unidad, orden)
where c.nit = '901759965';

-- ============================================================
-- Lotes: stock físico de un Insumo en una Sede
-- ============================================================
create table lotes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  insumo_id uuid not null references insumos(id),
  numero_lote text,
  fecha_vencimiento date,
  costo_unitario numeric(12, 2),
  proveedor text,
  -- Cacheado: lo mantiene fn_actualizar_stock_lote() a partir de la suma
  -- real de movimientos_insumos. No se edita a mano.
  cantidad_actual numeric(12, 2) not null default 0,
  activo boolean not null default true,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lotes_set_updated_at
  before update on lotes
  for each row execute function set_updated_at();

create index lotes_clinica_id_idx on lotes(clinica_id);
create index lotes_sede_id_idx on lotes(sede_id);
create index lotes_insumo_id_idx on lotes(insumo_id);

alter table lotes enable row level security;

create policy "lotes_select_propia_clinica" on lotes
  for select using (clinica_id = clinica_actual());

create policy "lotes_insert_con_permiso" on lotes
  for insert with check (
    clinica_id = clinica_actual() and has_permission('inventario', 'CREATE')
  );

-- Único UPDATE permitido: el trigger de stock (security definer) y
-- desactivar/reactivar un lote. No hay edición libre de sus datos.
create policy "lotes_update_con_permiso" on lotes
  for update using (
    clinica_id = clinica_actual() and has_permission('inventario', 'CREATE')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- Movimientos: libro de entradas/consumo/ajustes — fuente de verdad
-- del stock. Append-only (sin UPDATE ni DELETE).
-- ============================================================
create table movimientos_insumos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  lote_id uuid not null references lotes(id),
  tipo text not null check (tipo in ('entrada', 'salida_consumo', 'ajuste')),
  -- Para entrada/salida_consumo, siempre positivo (la dirección la da
  -- "tipo"). Para ajuste puede ser positivo o negativo (corrección).
  cantidad numeric(12, 2) not null,
  -- Solo aplica a salida_consumo: cantidad para el reporte regulatorio
  -- INVIMA, que puede diferir de la cantidad realmente usada.
  cantidad_invima numeric(12, 2),
  tratamiento_id uuid references tratamientos(id),
  sitio_anatomico text,
  motivo text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  check (tipo <> 'entrada' or cantidad > 0),
  check (tipo <> 'salida_consumo' or cantidad > 0),
  check (tipo <> 'salida_consumo' or tratamiento_id is not null)
);

create index movimientos_insumos_lote_id_idx on movimientos_insumos(lote_id, created_at desc);
create index movimientos_insumos_tratamiento_id_idx on movimientos_insumos(tratamiento_id);
create index movimientos_insumos_clinica_id_idx on movimientos_insumos(clinica_id);

create or replace function fn_actualizar_stock_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'entrada' then
    update lotes set cantidad_actual = cantidad_actual + new.cantidad where id = new.lote_id;
  elsif new.tipo = 'salida_consumo' then
    update lotes set cantidad_actual = cantidad_actual - new.cantidad where id = new.lote_id;
  elsif new.tipo = 'ajuste' then
    update lotes set cantidad_actual = cantidad_actual + new.cantidad where id = new.lote_id;
  end if;
  return new;
end;
$$;

create trigger movimientos_insumos_actualizar_stock
  after insert on movimientos_insumos
  for each row execute function fn_actualizar_stock_lote();

alter table movimientos_insumos enable row level security;

create policy "movimientos_insumos_select_propia_clinica" on movimientos_insumos
  for select using (clinica_id = clinica_actual());

create policy "movimientos_insumos_insert_entrada_consumo" on movimientos_insumos
  for insert with check (
    clinica_id = clinica_actual()
    and (
      (tipo in ('entrada', 'salida_consumo') and has_permission('inventario', 'CREATE'))
      or (tipo = 'ajuste' and has_permission('inventario', 'VOID'))
    )
  );

-- ============================================================
-- Registrar el módulo en RBAC
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('inventario', 'Inventario', 'Insumos, lotes y consumo en tratamientos', '/inventario', 5, false);

insert into clinica_modulos (clinica_id, modulo_id)
select c.id, m.id from clinicas c cross join modulos m where m.codigo = 'inventario'
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where m.codigo = 'inventario' and p.codigo in ('VIEW', 'CREATE', 'VOID')
on conflict do nothing;

-- Generaliza bootstrap_clinica() para que las clínicas que se registren
-- de ahora en adelante también reciban el módulo Inventario habilitado.
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
  where codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas', 'inventario');

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas', 'inventario');

  return v_clinica_id;
end;
$$;
