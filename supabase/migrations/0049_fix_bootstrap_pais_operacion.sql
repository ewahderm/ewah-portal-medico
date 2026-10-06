-- EWAH Tech Platform — Corrección: bootstrap_clinica() insertaba la
-- clínica sin pais_operacion_id (NOT NULL) y recién después intentaba un
-- UPDATE separado — el INSERT ya fallaba antes de llegar ahí. Se mueve la
-- asignación de país (Colombia por defecto) al propio INSERT.
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
