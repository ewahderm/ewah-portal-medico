-- Bootstrap: primer usuario Administrador de EWAH S.A.S.
-- Requiere haber corrido 0001_sistema_rbac.sql antes.
--
-- Paso previo (una sola vez, en el dashboard, NO por SQL):
--   Supabase → Authentication → Users → Add user
--   Crea tu usuario con email + contraseña (o "Send invite").
--
-- Luego reemplaza los dos marcadores de abajo y corre este script:
--   'ADMIN_EMAIL'  → el email exacto que usaste al crear el usuario
--   'ADMIN_NOMBRE' → tu nombre completo

do $$
declare
  v_user_id uuid;
  v_clinica_id uuid;
  v_rol_id uuid;
  v_admin_email text := 'ADMIN_EMAIL';
  v_admin_nombre text := 'ADMIN_NOMBRE';
begin
  select id into v_user_id from auth.users where email = v_admin_email;
  if v_user_id is null then
    raise exception 'No existe un usuario en auth.users con email %. Créalo primero en Authentication → Users.', v_admin_email;
  end if;

  select id into v_clinica_id from clinicas where nombre = 'EWAH S.A.S.';
  if v_clinica_id is null then
    raise exception 'No existe la clínica EWAH S.A.S. ¿Corriste 0001_sistema_rbac.sql?';
  end if;

  insert into roles (clinica_id, nombre, descripcion, nivel)
  values (v_clinica_id, 'Administrador', 'Acceso total, bypass de RBAC (nivel=1)', 1)
  returning id into v_rol_id;

  insert into usuarios (id, clinica_id, rol_id, nombre, email)
  values (v_user_id, v_clinica_id, v_rol_id, v_admin_nombre, v_admin_email);

  -- Habilita el módulo Usuarios para EWAH S.A.S. y se lo concede
  -- explícitamente al rol Administrador (nivel=1 ya bypasea RBAC, pero
  -- esto deja la matriz consistente para cuando la UI la consulte).
  insert into clinica_modulos (clinica_id, modulo_id)
  select v_clinica_id, id from modulos where codigo = 'usuarios';

  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
  select v_rol_id, m.id, p.id
  from modulos m
  cross join permisos p
  where m.codigo = 'usuarios';
end $$;
