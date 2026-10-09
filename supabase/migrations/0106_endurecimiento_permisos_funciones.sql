-- ============================================================
-- 0106 · Endurecimiento: quién puede ejecutar qué función
-- ============================================================
-- Hallazgos del revisor de seguridad de Supabase (2026-10-09), todos de
-- migraciones anteriores a Flujo de caja:
--   1. fn_cambiar_plan_propia_clinica: cualquier administrador de clínica
--      podía pasarse de plan llamándola directamente. El autoservicio de
--      planes se eliminó de la aplicación; el cambio de plan lo hace solo
--      EWAH Tech desde Plataforma. Nadie la ejecuta por API.
--   2. fn_sync_clinica_modulos(p_clinica_id): cualquiera (incluso sin
--      sesión) podía reescribir los módulos activos de OTRA clínica. Solo la
--      usan procesos internos (trigger de cambio de plan, alta de clínica),
--      que corren con los permisos del dueño.
--   3. Funciones que solo tienen sentido con sesión: sin acceso para
--      visitantes (anon).
--   4. Funciones de trigger: nadie las llama por API (los triggers se
--      disparan igual: PostgreSQL no revisa EXECUTE al dispararlos).
--   5. search_path fijo en las funciones que no lo tenían.
-- No se tocan clinica_actual, es_admin, es_super_admin, has_permission ni
-- has_entitlement: las políticas de las tablas y del almacenamiento las
-- llaman para cualquier rol (también anon) y sin sesión ya responden "sin
-- clínica / sin permiso". Quitarles EXECUTE convertiría ese "no" en errores.

-- 1 y 2. Solo procesos internos.
revoke execute on function fn_cambiar_plan_propia_clinica(text) from public, anon, authenticated;
revoke execute on function fn_sync_clinica_modulos(uuid) from public, anon, authenticated;

-- 3. Solo con sesión (cada una valida por dentro administrador, clínica o super admin).
revoke execute on function fn_actualizar_logo_propia_clinica(text) from public, anon;
revoke execute on function fn_actualizar_pais_y_exoneracion_clinica(uuid, boolean) from public, anon;
revoke execute on function fn_conteo_pacientes_por_clinica() from public, anon;
revoke execute on function fn_empleados_picker() from public, anon;
grant execute on function fn_actualizar_logo_propia_clinica(text) to authenticated;
grant execute on function fn_actualizar_pais_y_exoneracion_clinica(uuid, boolean) to authenticated;
grant execute on function fn_conteo_pacientes_por_clinica() to authenticated;
grant execute on function fn_empleados_picker() to authenticated;

-- 4. Funciones de trigger.
revoke execute on function fn_actualizar_stock_lote() from public, anon, authenticated;
revoke execute on function fn_anular_tratamiento_revierte_insumos() from public, anon, authenticated;
revoke execute on function fn_auditoria() from public, anon, authenticated;
revoke execute on function fn_calcular_edad_tratamiento() from public, anon, authenticated;
revoke execute on function fn_clinicas_plan_cambiado() from public, anon, authenticated;
revoke execute on function fn_clinicas_sembrar_tipos_extintor() from public, anon, authenticated;
revoke execute on function fn_comprobantes_honorarios_solo_anular() from public, anon, authenticated;
revoke execute on function fn_comprobantes_nomina_solo_anular() from public, anon, authenticated;
revoke execute on function fn_comprobantes_prestaciones_solo_anular() from public, anon, authenticated;
revoke execute on function fn_empleados_sync_categoria_contrato() from public, anon, authenticated;
revoke execute on function fn_hab_doc_version_inmutable() from public, anon, authenticated;
revoke execute on function fn_hab_tramite_solo_anular() from public, anon, authenticated;
revoke execute on function fn_tipo_tratamiento_servicio_misma_clinica() from public, anon, authenticated;
revoke execute on function fn_tratamientos_solo_anular() from public, anon, authenticated;
revoke execute on function fn_vacaciones_solo_laboral() from public, anon, authenticated;
revoke execute on function prevent_self_privilege_escalation() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;

-- 5. search_path fijo.
alter function f_unaccent(text) set search_path = public;
alter function prevent_self_privilege_escalation() set search_path = public;
alter function set_updated_at() set search_path = public;
alter function fn_tratamientos_solo_anular() set search_path = public;
alter function fn_hab_doc_version_inmutable() set search_path = public;
alter function fn_motivo_movimiento_valido(uuid, text, text) set search_path = public;
alter function fn_empleados_sync_categoria_contrato() set search_path = public;
alter function fn_vacaciones_solo_laboral() set search_path = public;
alter function fn_comprobantes_honorarios_solo_anular() set search_path = public;
alter function fn_tipo_tratamiento_servicio_misma_clinica() set search_path = public;
alter function fn_comprobantes_nomina_solo_anular() set search_path = public;
alter function fn_comprobantes_prestaciones_solo_anular() set search_path = public;
alter function fn_hab_bloque_coincide(text[], text[], text[], text[], text, text[], text[], text[], text[], text) set search_path = public;
alter function fn_hab_criterio_vigente(date, date, date) set search_path = public;
alter function fn_hab_tramite_solo_anular() set search_path = public;
alter function fn_residuo_es_peligroso(text) set search_path = public;
