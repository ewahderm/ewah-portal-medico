-- ============================================================
-- 0071 · Habilitación F11 (endurecimiento)
-- ============================================================
-- Hallazgos de la revisión de seguridad de F11 (informe en
-- docs/habilitacion/seguridad-f11.md):
--
--   H1  Autoría falsificable: en 7 tablas created_by / updated_by los
--       escribía quien insertaba. Por PostgREST, alguien con permiso de
--       crear podía registrar una versión de documento, un hito del trámite
--       o una novedad "a nombre de" otra persona (incluso un uuid de otra
--       clínica). En un rastro que se muestra a la secretaría de salud eso
--       importa. → trigger que fija la autoría desde la sesión.
--   H2  fn_hab_pais_clinica (definer, ejecutable por usuarios) devolvía el
--       país de CUALQUIER clínica por id. → solo la propia para usuarios.
--   H3  Funciones de trigger con EXECUTE para anon/authenticated: no se
--       pueden invocar fuera de un trigger, pero se revoca por higiene.
--   H4  Anular una autoevaluación dejaba "presentada" la ocurrencia del REPS
--       que tenía esa autoevaluación como única prueba. → se reabre el
--       periodo (anular + nueva pendiente), igual que fn_hab_anular_ocurrencia.

-- ============================================================
-- H1. Autoría desde la sesión
-- ============================================================
-- Genérico (jsonb_populate_record) para no escribir uno por tabla. Solo
-- actúa cuando quien escribe es un usuario (rol authenticated/anon): las
-- funciones definer y el service role conservan lo que ponen. En UPDATE,
-- created_by no cambia y updated_by pasa a ser quien edita.
create or replace function fn_hab_forzar_autor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cols jsonb := '{}'::jsonb;
  v_tiene_creado boolean := to_jsonb(new) ? 'created_by';
  v_tiene_editado boolean := to_jsonb(new) ? 'updated_by';
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if v_tiene_creado then v_cols := v_cols || jsonb_build_object('created_by', auth.uid()); end if;
    if v_tiene_editado then v_cols := v_cols || jsonb_build_object('updated_by', auth.uid()); end if;
  else
    if v_tiene_creado then v_cols := v_cols || jsonb_build_object('created_by', to_jsonb(old) -> 'created_by'); end if;
    if v_tiene_editado then v_cols := v_cols || jsonb_build_object('updated_by', auth.uid()); end if;
  end if;
  return jsonb_populate_record(new, v_cols);
end;
$$;

-- "hab_00_" para que corra antes que los demás triggers BEFORE de la tabla
-- (Postgres los dispara en orden alfabético).
create trigger hab_00_autor before insert or update on hab_criterio_asignaciones
  for each row execute function fn_hab_forzar_autor();
create trigger hab_00_autor before insert on hab_documento_versiones
  for each row execute function fn_hab_forzar_autor();
create trigger hab_00_autor before insert or update on hab_documentos_clinica
  for each row execute function fn_hab_forzar_autor();
create trigger hab_00_autor before insert on hab_novedades_reportadas
  for each row execute function fn_hab_forzar_autor();
create trigger hab_00_autor before insert or update on hab_perfil_prestador
  for each row execute function fn_hab_forzar_autor();
create trigger hab_00_autor before insert on hab_suficiencia_patrimonial
  for each row execute function fn_hab_forzar_autor();
create trigger hab_00_autor before insert on hab_tramite_hitos
  for each row execute function fn_hab_forzar_autor();

-- ============================================================
-- H2. País solo de la propia clínica para usuarios
-- ============================================================
-- La usan triggers invoker (ocurrencias, festivos) con el clinica_id de la
-- fila, que la política obliga a ser la propia; el cron y los definer
-- siguen viendo cualquiera.
create or replace function fn_hab_pais_clinica(p_clinica_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pais_operacion_id from clinicas
      where id = p_clinica_id
        -- Dentro de un definer current_user es el dueño; el rol con el que
        -- entró la petición (PostgREST hace SET ROLE) queda en 'role'.
        and (coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') or id = clinica_actual())),
    (select id from paises where codigo = 'CO')
  );
$$;

-- ============================================================
-- H3. Funciones de trigger sin EXECUTE para usuarios
-- ============================================================
revoke execute on function fn_hab_doc_version_siguiente() from public, anon, authenticated;
revoke execute on function fn_hab_documento_clinica_validar() from public, anon, authenticated;
revoke execute on function fn_hab_inmutable() from public, anon, authenticated;
revoke execute on function fn_hab_misma_clinica() from public, anon, authenticated;
revoke execute on function fn_hab_plan_mejora_validar_insert() from public, anon, authenticated;
revoke execute on function fn_servicio_habilitado_no_borrar_con_documentos() from public, anon, authenticated;
revoke execute on function fn_servicio_habilitado_no_borrar_evaluado() from public, anon, authenticated;
revoke execute on function fn_servicio_habilitado_validar() from public, anon, authenticated;
revoke execute on function fn_hab_forzar_autor() from public, anon, authenticated;
revoke execute on function fn_tipo_normativo_es_habilitacion(uuid) from public, anon;
grant execute on function fn_tipo_normativo_es_habilitacion(uuid) to authenticated;

-- ============================================================
-- H4. Anular la autoevaluación reabre la ocurrencia del REPS
-- ============================================================
-- AFTER UPDATE de la anulación: si la ocurrencia sigue presentada con esta
-- autoevaluación como prueba, se anula y nace una pendiente del mismo
-- periodo (security definer: quien anula con VOID puede no tener EDIT de
-- obligaciones, y el usuario no anula ocurrencias por UPDATE suelto).
create or replace function fn_hab_tg_autoevaluacion_anulada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o hab_obligacion_ocurrencias%rowtype;
begin
  if not (new.anulado and not old.anulado) or new.ocurrencia_id is null then
    return new;
  end if;
  select * into v_o from hab_obligacion_ocurrencias
  where id = new.ocurrencia_id and clinica_id = new.clinica_id and estado = 'presentado'
    and autoevaluacion_id = new.id and radicado is null and storage_path is null
  for update;
  if not found then
    return new;
  end if;
  update hab_obligacion_ocurrencias
  set estado = 'anulado',
      motivo_anulacion = 'Se anuló la autoevaluación que servía de prueba: ' || new.anulado_motivo,
      anulado_por = new.anulado_por
  where id = v_o.id;
  insert into hab_obligacion_ocurrencias
    (clinica_id, obligacion_id, origen, clave_periodo, periodo_corte, etiqueta_periodo, fecha_limite,
     generada_por, reemplaza_id, created_by)
  values
    (v_o.clinica_id, v_o.obligacion_id, v_o.origen, v_o.clave_periodo, v_o.periodo_corte, v_o.etiqueta_periodo,
     v_o.fecha_limite, v_o.generada_por, v_o.id, new.anulado_por);
  return new;
end;
$$;

create trigger hab_autoevaluaciones_anulada_reabre_reps
  after update of anulado on hab_autoevaluaciones
  for each row execute function fn_hab_tg_autoevaluacion_anulada();

revoke execute on function fn_hab_tg_autoevaluacion_anulada() from public, anon, authenticated;

-- ============================================================
-- H5. Límites del bucket (revisión de TS de F11)
-- ============================================================
-- La política de insert deja subir a cualquier carpeta de la propia
-- clínica con el cliente del navegador, saltándose prepararSubida (tope de
-- 10 MB y lista de formatos). El registro vuelve a verificar todo, pero el
-- archivo basura quedaría en Storage: el bucket mismo pone el tope.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'habilitacion';
