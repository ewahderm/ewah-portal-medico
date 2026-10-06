-- EWAH Tech Platform — Flujo de borrador/aprobación para comprobantes de
-- nómina y honorarios.
-- Aplicar con: npx supabase db push --linked
--
-- El diseño inicial (0048) hacía todo comprobante inmutable desde el
-- momento de crearlo (solo anular). El usuario pidió un flujo real de
-- borrador: mientras no se aprueba, el comprobante se puede editar
-- (incluido recalcular) o eliminar por completo; una vez aprobado, queda
-- inalterable y la única acción posible es anular (igual que ya
-- funcionaba). Esto es el mismo principio de Tratamientos (append-only con
-- una transición explícita) aplicado a un documento financiero con un
-- paso de "firma" adicional.

alter table comprobantes_nomina
  add column aprobado boolean not null default false,
  add column aprobado_en timestamptz,
  add column aprobado_por uuid references usuarios(id);

alter table comprobantes_honorarios
  add column aprobado boolean not null default false,
  add column aprobado_en timestamptz,
  add column aprobado_por uuid references usuarios(id);

-- ============================================================
-- Triggers: todo editable mientras es borrador (salvo identidad/auditoría),
-- inmutable salvo anular una vez aprobado.
-- ============================================================
create or replace function fn_comprobantes_nomina_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if old.aprobado = true then
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.tipo_periodo is distinct from old.tipo_periodo
      or new.fecha_inicio is distinct from old.fecha_inicio
      or new.fecha_fin is distinct from old.fecha_fin
      or new.salario_base is distinct from old.salario_base
      or new.auxilio_transporte is distinct from old.auxilio_transporte
      or new.comisiones is distinct from old.comisiones
      or new.comisiones_incluidas_ibc is distinct from old.comisiones_incluidas_ibc
      or new.deduccion_salud is distinct from old.deduccion_salud
      or new.deduccion_pension is distinct from old.deduccion_pension
      or new.aporte_patronal_salud is distinct from old.aporte_patronal_salud
      or new.aporte_patronal_pension is distinct from old.aporte_patronal_pension
      or new.aporte_arl is distinct from old.aporte_arl
      or new.aporte_parafiscales is distinct from old.aporte_parafiscales
      or new.exonerado_aportes is distinct from old.exonerado_aportes
      or new.retencion_fuente is distinct from old.retencion_fuente
      or new.otras_deducciones is distinct from old.otras_deducciones
      or new.neto_pagar is distinct from old.neto_pagar
      or new.aprobado is distinct from old.aprobado
      or new.aprobado_en is distinct from old.aprobado_en
      or new.aprobado_por is distinct from old.aprobado_por
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Un comprobante de nómina aprobado no se puede editar, solo anular.';
    end if;
  else
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'No se puede cambiar la identidad de un comprobante de nómina.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function fn_comprobantes_honorarios_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if old.aprobado = true then
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.fecha_inicio is distinct from old.fecha_inicio
      or new.fecha_fin is distinct from old.fecha_fin
      or new.valor_bruto is distinct from old.valor_bruto
      or new.declarante_renta is distinct from old.declarante_renta
      or new.tarifa_retencion is distinct from old.tarifa_retencion
      or new.retencion_fuente is distinct from old.retencion_fuente
      or new.neto_pagar is distinct from old.neto_pagar
      or new.requiere_factura_electronica is distinct from old.requiere_factura_electronica
      or new.soporte_seguridad_social_storage_path is distinct from old.soporte_seguridad_social_storage_path
      or new.aprobado is distinct from old.aprobado
      or new.aprobado_en is distinct from old.aprobado_en
      or new.aprobado_por is distinct from old.aprobado_por
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Un comprobante de honorarios aprobado no se puede editar, solo anular.';
    end if;
  else
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'No se puede cambiar la identidad de un comprobante de honorarios.';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- RLS: separar "editar/eliminar un borrador" (EDIT, aprobado=false) de
-- "anular un comprobante ya aprobado" (VOID, aprobado=true) — mismo
-- criterio que el resto del proyecto usa VOID para "anular" (Tratamientos,
-- Inventario).
-- ============================================================
drop policy if exists "comprobantes_nomina_anular_con_permiso" on comprobantes_nomina;
drop policy if exists "comprobantes_honorarios_anular_con_permiso" on comprobantes_honorarios;

-- Un comprobante nuevo siempre nace como borrador — "aprobado" solo se
-- pone en true a través de la transición de UPDATE (editar_borrador), nunca
-- directo en el INSERT.
drop policy if exists "comprobantes_nomina_insert_con_permiso" on comprobantes_nomina;
create policy "comprobantes_nomina_insert_con_permiso" on comprobantes_nomina
  for insert with check (clinica_id = clinica_actual() and has_permission('nomina', 'CREATE') and aprobado = false);

drop policy if exists "comprobantes_honorarios_insert_con_permiso" on comprobantes_honorarios;
create policy "comprobantes_honorarios_insert_con_permiso" on comprobantes_honorarios
  for insert with check (clinica_id = clinica_actual() and has_permission('nomina', 'CREATE') and aprobado = false);

create policy "comprobantes_nomina_editar_borrador" on comprobantes_nomina
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'EDIT') and aprobado = false)
  with check (clinica_id = clinica_actual());

create policy "comprobantes_nomina_anular_aprobado" on comprobantes_nomina
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'VOID') and aprobado = true)
  with check (clinica_id = clinica_actual());

create policy "comprobantes_nomina_eliminar_borrador" on comprobantes_nomina
  for delete using (clinica_id = clinica_actual() and has_permission('nomina', 'EDIT') and aprobado = false);

create policy "comprobantes_honorarios_editar_borrador" on comprobantes_honorarios
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'EDIT') and aprobado = false)
  with check (clinica_id = clinica_actual());

create policy "comprobantes_honorarios_anular_aprobado" on comprobantes_honorarios
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'VOID') and aprobado = true)
  with check (clinica_id = clinica_actual());

create policy "comprobantes_honorarios_eliminar_borrador" on comprobantes_honorarios
  for delete using (clinica_id = clinica_actual() and has_permission('nomina', 'EDIT') and aprobado = false);

-- ============================================================
-- El módulo `nomina` necesita ahora el permiso EDIT (editar/eliminar un
-- borrador, aprobar) además de VIEW/CREATE/VOID ya otorgados en 0048.
-- ============================================================
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where r.nivel = 1 and m.codigo = 'nomina' and p.codigo = 'EDIT'
on conflict do nothing;

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

  insert into clinicas (nombre, nit, plan, plan_id, pais_operacion_id)
  values (p_nombre_clinica, p_nit, 'trial', v_plan_gratis_id, (select id from paises where codigo = 'CO'))
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
    'inventario', 'campanas', 'suscripcion', 'medio_ambiente', 'rrhh', 'nomina'
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
