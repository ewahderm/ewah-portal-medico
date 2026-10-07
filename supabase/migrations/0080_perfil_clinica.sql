-- ============================================================
-- 0080 · Perfil de la clínica · Nombre legal, comercial y actividad
-- ============================================================
-- La actividad económica (Dec. 768 de 2022) es un atributo general de la
-- clínica, no del perfil SG-SST: la usan SG-SST, RRHH y los reportes.
--   1. clinicas.codigo_actividad_economica + backfill desde
--      sst_perfil.codigo_actividad. La columna vieja NO se borra aquí: el
--      código en producción aún la usa. Su drop (con un segundo backfill)
--      está en scripts/habilitacion/pendientes/0085_* y se aplica tras el
--      despliegue.
--   2. fn_actualizar_perfil_propia_clinica: nombre legal, comercial y
--      actividad económica.
--   3. fn_guardar_datos_basicos_clinica: guarda TODO el diálogo de Datos
--      básicos (perfil + NIT de 0059 + datos de 0052) en una sola
--      transacción; antes eran tres RPC y un fallo a mitad dejaba la
--      clínica a medio guardar.
--   4. fn_actualizar_marca_propia_clinica deja de tocar el nombre
--      comercial (ahora vive solo en Datos básicos).

-- ============================================================
-- 1. Columna y backfill
-- ============================================================
alter table clinicas
  add column codigo_actividad_economica text,
  add constraint clinicas_codigo_actividad_economica_check
    check (
      codigo_actividad_economica is null
      or codigo_actividad_economica ~ '^[1-5][0-9]{6}$'
    );

update clinicas c
set codigo_actividad_economica = nullif(trim(sp.codigo_actividad), '')
from sst_perfil sp
where sp.clinica_id = c.id
  and sp.codigo_actividad is not null;

comment on column clinicas.codigo_actividad_economica is
  'Código de actividad económica de 7 dígitos, incluida la clase de riesgo, usado en el perfil de la clínica.';

-- ============================================================
-- 2. Perfil de la clínica
-- ============================================================
-- security definer: `clinicas` no tiene policy de UPDATE para
-- authenticated (igual que 0046/0052/0059); esta función es la única
-- puerta, valida es_admin() y se limita a clinica_actual().
create or replace function fn_actualizar_perfil_propia_clinica(
  p_nombre_legal text,
  p_nombre_comercial text,
  p_codigo_actividad_economica text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_nombre_legal text := nullif(trim(p_nombre_legal), '');
  v_nombre_comercial text := nullif(trim(p_nombre_comercial), '');
  v_codigo_actividad text := nullif(trim(p_codigo_actividad_economica), '');
  v_actualizadas integer;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar el perfil de la clínica.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  if v_nombre_legal is null or length(v_nombre_legal) > 200 then
    raise exception 'El nombre legal es obligatorio y no puede superar 200 caracteres.';
  end if;
  if v_nombre_comercial is not null and length(v_nombre_comercial) > 200 then
    raise exception 'El nombre comercial no puede superar 200 caracteres.';
  end if;
  if v_codigo_actividad is not null and v_codigo_actividad !~ '^[1-5][0-9]{6}$' then
    raise exception 'La actividad económica debe tener 7 dígitos y comenzar con una clase de riesgo entre 1 y 5.';
  end if;

  update clinicas
  set nombre = v_nombre_legal,
      nombre_comercial = v_nombre_comercial,
      codigo_actividad_economica = v_codigo_actividad
  where id = v_clinica_id;

  get diagnostics v_actualizadas = row_count;
  if v_actualizadas <> 1 then
    raise exception 'No se encontró la clínica de la sesión.';
  end if;
end;
$$;

revoke all on function fn_actualizar_perfil_propia_clinica(text, text, text)
  from public, anon, authenticated;
grant execute on function fn_actualizar_perfil_propia_clinica(text, text, text)
  to authenticated;

comment on function fn_actualizar_perfil_propia_clinica(text, text, text) is
  'Actualiza nombre legal, nombre comercial y actividad económica de la clínica de sesión; solo administradores.';

-- ============================================================
-- 3. Guardado atómico de Datos básicos
-- ============================================================
-- security invoker a propósito: no eleva nada por sí misma, solo encadena
-- las tres funciones definer existentes (cada una valida es_admin() y la
-- clínica de sesión). Al ser una sola llamada, un error en cualquiera
-- (p. ej. NIT duplicado) revierte también las anteriores.
create or replace function fn_guardar_datos_basicos_clinica(
  p_nombre_legal text,
  p_nombre_comercial text,
  p_codigo_actividad_economica text,
  p_nit text,
  p_pais_operacion_id uuid,
  p_exoneracion_aportes boolean,
  p_direccion text,
  p_telefono text,
  p_email text,
  p_tipo_persona_id uuid,
  p_tipo_documento_id uuid,
  p_rol_actor_id uuid,
  p_tipo_transaccion_invima_id uuid,
  p_codigo_habilitacion text,
  p_clase_riesgo_id uuid,
  p_departamento_id uuid,
  p_ciudad_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform fn_actualizar_perfil_propia_clinica(
    p_nombre_legal, p_nombre_comercial, p_codigo_actividad_economica
  );
  perform fn_actualizar_nit_clinica(p_nit);
  perform fn_actualizar_datos_basicos_clinica(
    p_pais_operacion_id,
    p_exoneracion_aportes,
    p_direccion,
    p_telefono,
    p_email,
    p_tipo_persona_id,
    p_tipo_documento_id,
    p_rol_actor_id,
    p_tipo_transaccion_invima_id,
    p_codigo_habilitacion,
    p_clase_riesgo_id,
    p_departamento_id,
    p_ciudad_id
  );
end;
$$;

revoke all on function fn_guardar_datos_basicos_clinica from public, anon, authenticated;
grant execute on function fn_guardar_datos_basicos_clinica to authenticated;

comment on function fn_guardar_datos_basicos_clinica is
  'Guarda en una sola transacción el perfil, el NIT y los datos básicos de la clínica de sesión.';

-- ============================================================
-- 4. Marca sin nombre comercial
-- ============================================================
-- Se conserva la firma de 0046 para que el código aún desplegado siga
-- funcionando entre esta migración y el despliegue; p_nombre_comercial se
-- IGNORA: el nombre comercial solo se cambia en Datos básicos.
-- security definer: misma razón que en 0046 (sin policy UPDATE en
-- clinicas para authenticated; es_admin() + clinica_actual() limitan).
create or replace function fn_actualizar_marca_propia_clinica(
  p_nombre_comercial text,
  p_correo_notificaciones text,
  p_telefono_contacto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_actualizadas integer;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede editar la marca de la clínica.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  update clinicas
  set correo_notificaciones = nullif(trim(p_correo_notificaciones), ''),
      telefono_contacto = nullif(trim(p_telefono_contacto), '')
  where id = v_clinica_id;

  get diagnostics v_actualizadas = row_count;
  if v_actualizadas <> 1 then
    raise exception 'No se encontró la clínica de la sesión.';
  end if;
end;
$$;

revoke all on function fn_actualizar_marca_propia_clinica(text, text, text)
  from public, anon, authenticated;
grant execute on function fn_actualizar_marca_propia_clinica(text, text, text)
  to authenticated;
