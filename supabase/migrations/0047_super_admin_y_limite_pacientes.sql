-- EWAH Tech Platform — Administración de plataforma (cross-tenant) + límite
-- de pacientes del plan Gratis.
-- Aplicar con: npx supabase db push --linked
--
-- Hasta ahora no existía ningún concepto de "staff de EWAH Tech": cada
-- usuario solo puede ver/tocar su propia clínica (clinica_actual()), ni
-- siquiera un Administrador cruza ese límite. El usuario pidió poder
-- activar/desactivar el PLAN y el estado ACTIVO de cualquier clínica desde
-- la plataforma — para eso hace falta una bandera cross-tenant nueva.
--
-- clinicas.activo ya existía desde el primer día (0001) pero nunca se
-- aplicaba en ningún lado: clinica_actual() solo validaba
-- usuarios.activo. Se corrige acá mismo, en el único punto de donde
-- cuelga toda la RLS del proyecto — una clínica desactivada pierde acceso
-- a sus propios datos de inmediato (defensa en profundidad, no solo un
-- mensaje en el login).

-- ============================================================
-- 1. Bandera de super admin (solo asignable a mano, nunca desde la UI)
-- ============================================================
alter table usuarios add column es_super_admin boolean not null default false;

create or replace function es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.es_super_admin from usuarios u where u.id = auth.uid() and u.activo = true),
    false
  );
$$;

-- clinica_actual() ahora también exige que la propia clínica esté activa —
-- se repite la firma completa porque `create or replace` de una función
-- SQL exige el cuerpo entero, no solo el cambio.
create or replace function clinica_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.clinica_id
  from usuarios u
  join clinicas c on c.id = u.clinica_id
  where u.id = auth.uid() and u.activo = true and c.activo = true;
$$;

-- ============================================================
-- 2. Acceso cross-tenant a `clinicas` para el super admin
-- ============================================================
-- Políticas PERMISSIVE: se combinan con OR junto a clinicas_select_propia
-- (0001) — un usuario normal sigue viendo solo la suya, el super admin ve
-- todas además. `clinicas` sigue sin ninguna policy de UPDATE para
-- cualquier otro caso (a propósito, ver 0001/0034) — esta es la única
-- puerta de escritura cross-tenant, y solo abre si es_super_admin().
create policy "clinicas_select_super_admin" on clinicas
  for select using (es_super_admin());

create policy "clinicas_update_super_admin" on clinicas
  for update using (es_super_admin())
  with check (es_super_admin());

-- Conteo de pacientes activos por clínica, sin exponer ningún dato clínico
-- — el panel de plataforma necesita el número para mostrarlo junto al
-- límite del plan, nunca los registros de pacientes en sí.
create or replace function fn_conteo_pacientes_por_clinica()
returns table(clinica_id uuid, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_super_admin() then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
    select p.clinica_id, count(*)::bigint
    from pacientes p
    where p.activo = true
    group by p.clinica_id;
end;
$$;

-- ============================================================
-- 3. Límite de pacientes del plan Gratis
-- ============================================================
alter table planes add column limite_pacientes integer; -- null = sin límite
update planes set limite_pacientes = 30 where codigo = 'gratis';

-- ============================================================
-- 4. Semilla: cuenta real del equipo de EWAH Tech
-- ============================================================
update usuarios set es_super_admin = true where email = 'jorgepena.ewah@gmail.com';
