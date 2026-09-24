-- EWAH Tech Platform — Proveedores + campos INVIMA de Insumos
-- Aplicar con: npx supabase db push --linked
--
-- Motivado por 2 falencias reales encontradas por el usuario:
-- 1) Consultorios/Insumos vivían solo en el motor genérico de Parámetros
--    (add-valor-dialog.tsx), que únicamente soporta nombre+código — nunca
--    hubo forma real de asignar sede_id a un Consultorio (columna not null
--    desde 0011) ni de llenar unidad_medida/registro_invima de un Insumo
--    (columnas ya existían desde 0015, pero sin UI para setearlas). Ambos
--    se sacan del motor genérico hacia diálogos propios en esta ronda.
-- 2) La hoja de referencia del legado (Insumos) tiene columnas que no
--    existían aquí: unidad de medida reportada a INVIMA (no siempre
--    coincide con la que se usa para inventario), fecha de vencimiento del
--    registro INVIMA, referencia/presentación comercial reportada, y un
--    flag de si el insumo aplica para reporte INVIMA (la mayoría de
--    insumos de consumo — agujas, batas — no aplican).
--
-- Proveedor pasa a vivir en el INSUMO (no en el lote) — así está en la
-- hoja de referencia del legado (columna IdProveedor de Insumos), y es
-- donde tiene sentido operativo: el proveedor de un producto no cambia
-- lote a lote.

-- ============================================================
-- 1. Proveedores — catálogo por-clínica, mismo patrón que Sedes/Consultorios
-- ============================================================
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo_identificacion_id uuid references tipos_identificacion(id),
  numero_identificacion text,
  nombre text not null,
  observaciones text,
  activo boolean not null default true,
  orden int not null default 0,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger proveedores_set_updated_at
  before update on proveedores
  for each row execute function set_updated_at();

create index proveedores_clinica_id_idx on proveedores(clinica_id);

alter table proveedores enable row level security;

create policy "proveedores_select_propia_clinica" on proveedores
  for select using (clinica_id = clinica_actual());

create policy "proveedores_insert_con_permiso" on proveedores
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "proveedores_update_con_permiso" on proveedores
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 2. Insumos — campos del reporte INVIMA + referencia al proveedor
-- ============================================================
alter table insumos
  add column proveedor_id uuid references proveedores(id),
  add column unidad_medida_invima text,
  add column fecha_vencimiento_registro_invima date,
  add column referencia_reportada text,
  add column presentacion_comercial_reportada text,
  add column reporte_invima boolean not null default false;
