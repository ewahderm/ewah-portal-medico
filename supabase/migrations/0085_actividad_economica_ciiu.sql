-- EWAH Tech Platform — la actividad económica de la clínica es el código
-- CIIU del RUT (4 dígitos, p. ej. 8621), no el de 7 dígitos de la ARL.
-- Aplicar con: npx supabase db push --linked
--
-- 0080 exigía 7 dígitos con la clase de riesgo como primer dígito (Dec.
-- 768/2022), pero el dato que la clínica tiene a la mano es el del RUT. La
-- clase de riesgo para SG-SST ya sale del "Nivel de riesgo ARL por defecto"
-- de Datos básicos (clinicas.clase_riesgo_id) y de los cargos; el código de
-- 7 dígitos, si alguien lo tiene, sigue sirviendo y aporta su primer dígito
-- (lib/sst/grupo.ts claseDeActividad lo ignora si no tiene 7 dígitos).
--
-- Por eso se aceptan ambos formatos: 4 dígitos (CIIU) o 7 dígitos que
-- empiezan en 1–5 (los ya guardados con 0080 no se tocan).

alter table clinicas
  drop constraint clinicas_codigo_actividad_economica_check;

alter table clinicas
  add constraint clinicas_codigo_actividad_economica_check
    check (
      codigo_actividad_economica is null
      or codigo_actividad_economica ~ '^[0-9]{4}$'
      or codigo_actividad_economica ~ '^[1-5][0-9]{6}$'
    );

comment on column clinicas.codigo_actividad_economica is
  'Actividad económica de la clínica: código CIIU del RUT (4 dígitos) o, si se prefiere, el código de 7 dígitos de la ARL (el primero es la clase de riesgo).';

-- security definer: `clinicas` no tiene policy de UPDATE para
-- authenticated (igual que 0046/0052/0059); esta función es la única
-- puerta, valida es_admin() y se limita a clinica_actual(). Misma firma y
-- misma lógica que 0080; solo cambia la validación del código.
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
  if v_codigo_actividad is not null
     and v_codigo_actividad !~ '^[0-9]{4}$'
     and v_codigo_actividad !~ '^[1-5][0-9]{6}$' then
    raise exception 'La actividad económica es el código CIIU del RUT (4 dígitos, por ejemplo 8621).';
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
  'Actualiza nombre legal, nombre comercial y actividad económica (CIIU del RUT) de la clínica de sesión; solo administradores.';
