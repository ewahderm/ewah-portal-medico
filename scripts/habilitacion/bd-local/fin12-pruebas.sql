-- Pruebas de 0106: quién ejecuta qué función, y que los triggers siguen
-- funcionando para un usuario normal.
\set ON_ERROR_STOP 1
select t.ok(not has_function_privilege('authenticated', 'fn_cambiar_plan_propia_clinica(text)', 'execute')
  and not has_function_privilege('anon', 'fn_cambiar_plan_propia_clinica(text)', 'execute'),
  'nadie se cambia el plan por API');
select t.ok(not has_function_privilege('authenticated', 'fn_sync_clinica_modulos(uuid)', 'execute')
  and not has_function_privilege('anon', 'fn_sync_clinica_modulos(uuid)', 'execute'),
  'nadie reescribe los módulos de otra clínica por API');
select t.ok(bool_and(not has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')),
  'las funciones de la sesión no las ejecuta un visitante, sí un usuario')
  from unnest(array['fn_actualizar_logo_propia_clinica(text)', 'fn_actualizar_pais_y_exoneracion_clinica(uuid, boolean)',
    'fn_conteo_pacientes_por_clinica()', 'fn_empleados_picker()']) f;
select t.ok(bool_and(has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')),
  'las funciones que usan las políticas siguen disponibles para todos los roles')
  from unnest(array['clinica_actual()', 'es_admin()', 'es_super_admin()', 'has_permission(text, text)', 'has_entitlement(text, text)']) f;
select t.ok(bool_and(not has_function_privilege('authenticated', f, 'execute')), 'las funciones de trigger no se llaman por API')
  from unnest(array['fn_auditoria()', 'set_updated_at()', 'fn_actualizar_stock_lote()', 'fn_tratamientos_solo_anular()', 'prevent_self_privilege_escalation()']) f;
select t.ok(bool_and(coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'), 'las funciones señaladas tienen search_path fijo')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('f_unaccent', 'set_updated_at', 'fn_residuo_es_peligroso', 'fn_hab_bloque_coincide', 'fn_motivo_movimiento_valido');

-- Los triggers se siguen disparando para un usuario normal.
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select id as banco, updated_at as antes from fin_cuentas where nombre = 'Bancolombia' \gset
select pg_sleep(0.01);
update fin_cuentas set orden = orden + 1 where id = :'banco';
select t.ok(updated_at > :'antes'::timestamptz, 'set_updated_at sigue corriendo') from fin_cuentas where id = :'banco';
reset role;
select t.ok(count(*) > 0, 'la auditoría sigue registrando') from auditoria where tabla = 'fin_cuentas' and registro_id = (select id from fin_cuentas where nombre = 'Bancolombia');
