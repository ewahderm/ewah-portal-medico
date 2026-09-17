-- EWAH Tech Platform — Onboarding de nuevas clínicas (self-service SaaS)
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Requiere 0001_sistema_rbac.sql corrido antes.

-- Crea, en una sola transacción, una clínica nueva + su rol Administrador +
-- el usuario administrador (ya autenticado vía Supabase Auth) + habilita el
-- módulo "usuarios" para esa clínica. Evita el bug del sistema legado de
-- operaciones multi-tabla sin rollback (ver docs/spec-ewah-app.md §5, §11.11).
--
-- Se invoca SIEMPRE desde el servidor con el cliente service_role, después
-- de crear el usuario en auth.users vía supabase.auth.signUp(). No expone
-- nada explotable si se llama con otro rol porque igual exige un
-- p_admin_id que debe existir en auth.users.
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
  select v_clinica_id, id from modulos where codigo = 'usuarios';

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo = 'usuarios';

  return v_clinica_id;
end;
$$;
