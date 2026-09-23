-- EWAH Tech Platform — Ciclo de QA y mejoras de seguridad/backend
-- Aplicar con: npx supabase db push --linked
--
-- Resultado de la primera auditoría formal de seguridad + arquitectura de
-- backend sobre todo lo construido hasta ahora. Cada cambio corresponde a
-- un hallazgo real, verificado leyendo el código (no teórico):
--
--  1. clinica_actual()/es_admin()/has_permission() nunca revisaban
--     usuarios.activo — un usuario desactivado con una sesión (JWT) todavía
--     vigente seguía pasando todos los chequeos de permiso hasta que su
--     token expirara. Se agrega el chequeo en las 3 funciones; el resto
--     del sistema (RLS, has_permission) ya maneja "clinica_actual() es
--     null" como "sin acceso", así que no hace falta tocar nada más.
--  2. bootstrap_clinica() es security definer y nunca tuvo su EXECUTE
--     revocado de public/anon/authenticated — cualquier cliente con la
--     anon key podía invocarla directamente por RPC (los GRANT de función
--     son independientes de RLS). El único llamador legítimo
--     (signUpClinica en lib/auth/actions.ts) usa el cliente admin
--     (service_role), que conserva el privilegio de ejecutarla sin verse
--     afectado por este revoke.
--  3. revertirConsumo() (Inventario) insertaba su movimiento de reversa
--     exigiendo el mismo permiso que un consumo normal (CREATE) en vez del
--     nivel exigido para cualquier otra corrección del sistema (VOID,
--     igual que anular un tratamiento o ajustar stock) — cualquier usuario
--     con el permiso operativo básico de Inventario podía borrar de facto
--     el rastro de consumo de un insumo. Se endurece la policy de INSERT
--     para exigir VOID específicamente cuando motivo_movimiento='reverso_consumo'.
--  4. Índice nuevo para el caso más común de listarMovimientos() (sin
--     filtro de insumo/sede): antes solo podía usar el índice de
--     clinica_id sin orden y ordenar en memoria.

-- ============================================================
-- 1. Respetar usuarios.activo en las funciones de autorización
-- ============================================================
create or replace function clinica_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinica_id from usuarios where id = auth.uid() and activo = true;
$$;

create or replace function es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios u
    join roles r on r.id = u.rol_id
    where u.id = auth.uid() and u.activo = true and r.nivel = 1
  );
$$;

create or replace function has_permission(modulo_code text, permiso_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_rol_id uuid;
  v_nivel int;
  v_modulo_activo boolean;
begin
  select u.clinica_id, u.rol_id, r.nivel
    into v_clinica_id, v_rol_id, v_nivel
  from usuarios u
  join roles r on r.id = u.rol_id
  where u.id = auth.uid() and u.activo = true;

  if v_clinica_id is null then
    return false;
  end if;

  if v_nivel = 1 then
    return true;
  end if;

  select cm.activo into v_modulo_activo
  from clinica_modulos cm
  join modulos m on m.id = cm.modulo_id
  where cm.clinica_id = v_clinica_id and m.codigo = modulo_code;

  if coalesce(v_modulo_activo, false) is not true then
    return false;
  end if;

  return exists (
    select 1
    from rol_modulo_permiso rmp
    join modulos m on m.id = rmp.modulo_id
    join permisos p on p.id = rmp.permiso_id
    where rmp.rol_id = v_rol_id
      and m.codigo = modulo_code
      and p.codigo = permiso_code
      and rmp.concedido = true
  );
end;
$$;

-- ============================================================
-- 2. bootstrap_clinica(): cerrar el acceso directo por RPC
-- ============================================================
revoke execute on function bootstrap_clinica(text, text, uuid, text, text) from public;
revoke execute on function bootstrap_clinica(text, text, uuid, text, text) from anon;
revoke execute on function bootstrap_clinica(text, text, uuid, text, text) from authenticated;

-- ============================================================
-- 3. Reversa de consumo de insumos exige VOID, no CREATE
-- ============================================================
drop policy "movimientos_insumos_insert_entrada_salida" on movimientos_insumos;
create policy "movimientos_insumos_insert_entrada_salida" on movimientos_insumos
  for insert with check (
    clinica_id = clinica_actual()
    and (
      (motivo_movimiento = 'reverso_consumo' and has_permission('inventario', 'VOID'))
      or (tipo in ('entrada', 'salida') and motivo_movimiento is distinct from 'reverso_consumo' and has_permission('inventario', 'CREATE'))
      or (tipo = 'ajuste' and has_permission('inventario', 'VOID'))
    )
  );

-- ============================================================
-- 4. Índice para el listado general de Movimientos (sin filtro)
-- ============================================================
create index movimientos_insumos_clinica_created_idx on movimientos_insumos(clinica_id, created_at desc);

-- ============================================================
-- Nota de diseño (no funcional): lotes_update_con_permiso exige
-- has_permission('inventario','CREATE') en vez de 'EDIT' — es intencional,
-- el módulo Inventario nunca definió un permiso EDIT (solo VIEW/CREATE/VOID)
-- y esa política solo cubre el trigger de stock + activar/desactivar un
-- lote. Se deja documentado aquí para que no se "corrija" por error.
-- ============================================================
