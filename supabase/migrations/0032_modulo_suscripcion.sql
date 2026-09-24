-- EWAH Tech Platform — Módulo Suscripción (visibilidad de plan, sin cobro)
-- Aplicar con: npx supabase db push --linked
--
-- El usuario pidió el flujo de suscripción (ver tu plan actual, comparar
-- planes, solicitar una actualización), pero Stripe no opera en Colombia —
-- se deja pendiente el cobro real (Wompi/PayU/ePayco/Mercado Pago son las
-- alternativas locales a evaluar después) y por ahora "actualizar de plan"
-- envía una solicitud por correo a EWAH en vez de cobrar. Cuando se elija
-- una pasarela, este módulo es el punto de entrada natural para conectarla
-- — no hace falta rediseñar el flujo, solo reemplazar el botón de
-- "solicitar" por un checkout real.
--
-- Administrativo (es_administrativo=true) e incluido en TODOS los planes,
-- igual que Usuarios/Parámetros — una clínica siempre puede ver y
-- gestionar su propia suscripción, sin importar en qué plan esté.

insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('suscripcion', 'Suscripción', 'Plan actual de tu clínica y solicitudes de actualización.', '/suscripcion', 7, true);

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p
cross join modulos m
where m.codigo = 'suscripcion';

-- Sincroniza clinica_modulos de las clínicas ya existentes (bootstrap_clinica
-- ya lo hace para las nuevas, pero estas ya se crearon antes de este módulo).
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
where m.codigo = 'suscripcion' and p.codigo in ('VIEW', 'CREATE')
on conflict do nothing;

-- bootstrap_clinica(): agregar 'suscripcion' a la lista de módulos con
-- permiso de rol para clínicas nuevas (clinica_modulos ya lo cubre solo con
-- el paso de arriba, porque ahora es derivado del plan vía
-- fn_sync_clinica_modulos — el que hay que tocar a mano es rol_modulo_permiso).
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
  where m.codigo in ('usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas', 'inventario', 'campanas', 'suscripcion');

  return v_clinica_id;
end;
$$;
