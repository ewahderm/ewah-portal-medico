-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F1: cimientos.
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico aprobado: diseno-tecnico-habilitacion.md (lider-tecnico,
-- 2026-10-06), secciones 1.3, 1.4, 1.5, 1.7, 1.8 y fila F1 de §7.
-- Esta migración trae SOLO lo que no depende del esquema global de la
-- norma (hab_normas, hab_servicios_norma, ...), que llega en 0062:
--   - El FK clinica_servicios_habilitados.servicio_norma_id, el trigger
--     fn_servicio_habilitado_validar (legalidad de complejidad/modalidad/
--     numeral contra el servicio de la norma) y el unique que incluye el
--     numeral se agregan en 0062.
--   - hab_perfil_prestador.tipo_prestador queda con un check de los 4
--     códigos; 0062 lo convierte en FK a hab_tipos_prestador.
--
-- Contenido:
--   1. Módulo `habilitacion` en RBAC + plan (activo en Gratis y Pro) +
--      sub-feature `gestion` solo Pro + backfill a Administradores +
--      bootstrap_clinica() v8.
--   2. Ajuste D2 del catálogo practicas_medicas (con aserción previa).
--   3. clinica_servicios_habilitados por sede (D1) + RLS ampliada.
--   4. tipos_tratamiento apunta a la práctica (servicio general), no a la
--      fila por sede (decisión A del usuario).
--   5. sedes: columnas de edificación + RPC angosta + auditoría.
--   6. hab_perfil_prestador (1:1 con la clínica) + RPC del código de
--      prestador.
--   7. Bucket privado `habilitacion` (recomendación §7 para que F5/F7/F8
--      no dependan entre sí).

-- ============================================================
-- 1. RBAC, plan y entitlement (§1.8)
-- ============================================================
-- es_administrativo = true: el módulo está activo en TODOS los planes
-- (Gratis necesita clinica_modulos.activo para la vista limitada: Resumen,
-- Calendario y Obligaciones en lectura, Perfil editable). Lo que se cobra
-- es la sub-feature `gestion` (documentos, autoevaluación, evidencias,
-- detalle de sedes y servicios, alertas por correo).
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('habilitacion', 'Habilitación',
   'Inscripción REPS, autoevaluación Res. 3100, documentos, obligaciones y calendario regulatorio.',
   '/habilitacion', 12, true);

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p
cross join modulos m
where m.codigo = 'habilitacion';

-- has_entitlement('habilitacion') = true en ambos planes (módulo activo);
-- has_entitlement('habilitacion', 'gestion') = solo Pro (o override por
-- clínica en clinica_feature_overrides). No hace falta tocar
-- has_entitlement(): ya resuelve sub-features desde plan_features (0028).
insert into plan_features (plan_id, modulo_id, feature_codigo, incluido)
select p.id, m.id, 'gestion', (p.codigo = 'pro')
from planes p
join modulos m on m.codigo = 'habilitacion';

do $$
declare
  v_clinica record;
begin
  for v_clinica in select id from clinicas loop
    perform fn_sync_clinica_modulos(v_clinica.id);
  end loop;
end;
$$;

-- Backfill solo a Administrador (nivel=1) de clínicas existentes — mismo
-- criterio que RRHH (0048): el módulo contiene información financiera
-- (suficiencia patrimonial) y el admin decide luego a quién delegarlo en
-- la matriz de permisos. DELETE no se otorga: ninguna tabla del módulo lo
-- usa (nada se borra en habilitación).
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where r.nivel = 1
  and m.codigo = 'habilitacion'
  and p.codigo in ('VIEW', 'CREATE', 'EDIT', 'VOID', 'APPROVE', 'EXPORT')
on conflict do nothing;

-- bootstrap_clinica() v8: misma versión que dejó 0051 (la última que la
-- redefine; 0060 resolvió su catálogo con un trigger en clinicas), se
-- agrega 'habilitacion' a la lista. No sirve el patrón de trigger de 0060
-- aquí porque el rol Administrador se crea DESPUÉS del insert de la
-- clínica.
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

  insert into clinicas (nombre, nit, plan, plan_id, pais_operacion_id)
  values (p_nombre_clinica, p_nit, 'trial', v_plan_gratis_id, (select id from paises where codigo = 'CO'))
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
  where m.codigo in (
    'usuarios', 'parametros', 'pacientes', 'tratamientos', 'citas',
    'inventario', 'campanas', 'suscripcion', 'medio_ambiente', 'rrhh', 'nomina',
    'habilitacion'
  );

  insert into motivos_movimiento_inventario (clinica_id, categoria, codigo, nombre, orden) values
    (v_clinica_id, 'entrada', 'compra', 'Compra', 1),
    (v_clinica_id, 'entrada', 'obsequio_proveedor', 'Obsequio de proveedor', 2),
    (v_clinica_id, 'entrada', 'saldo_inicial', 'Saldo inicial', 3),
    (v_clinica_id, 'salida', 'desecho', 'Desecho', 1),
    (v_clinica_id, 'salida', 'obsequio_paciente', 'Obsequio a paciente', 2);

  return v_clinica_id;
end;
$$;

-- Lección de 0020: bootstrap_clinica no es invocable por usuarios finales.
revoke execute on function bootstrap_clinica(text, text, uuid, text, text) from public, anon, authenticated;

-- ============================================================
-- 2. Ajuste D2 de practicas_medicas (§1.2, decisión del usuario)
-- ============================================================
-- Afectadas (ids verificados en producción el 2026-10-06):
--   49e50cf6-… "Cuidado Intermedio (Adultos, Pediátrico, Neonatal)"  → se divide
--   cfcbd41c-… "Cuidado Intensivo (UCI Adultos, UCI Pediátrica, UCI Neonatal)" → se divide
--   ca345094-… Fisioterapia, b1a73f46-… Fonoaudiología y/o Terapia del
--   Lenguaje, 98b32dcc-… Terapia Ocupacional, 98fb0ad4-… Terapia
--   Respiratoria → pasan de Consulta Externa a Apoyo Diagnóstico (en la
--   norma son 11.3.1 Terapias, no consulta externa).
--
-- Aserción previa: si alguna clínica ya declaró una de estas prácticas, o
-- el catálogo no es el esperado, se aborta TODO (la migración corre en una
-- transacción) en vez de reinterpretar en silencio un dato real.
do $$
declare
  v_afectadas uuid[] := array[
    '49e50cf6-f3be-4c3c-9e95-2a53f2290b05',
    'cfcbd41c-2354-427c-913a-b40fd638c766',
    'ca345094-484f-4862-abfa-bee60fe80288',
    'b1a73f46-6a9a-4969-b9f8-b002cb8a3466',
    '98b32dcc-2710-450d-a680-90fd025fbce6',
    '98fb0ad4-fa98-40e8-8ed0-3b9a3f3aa75e'
  ]::uuid[];
  v_usadas int;
  v_encontradas int;
begin
  select count(*) into v_encontradas from practicas_medicas where id = any(v_afectadas);
  if v_encontradas <> 6 then
    raise exception 'D2: se esperaban 6 prácticas afectadas en practicas_medicas y hay %; revisar el catálogo antes de aplicar.', v_encontradas;
  end if;

  select count(*) into v_usadas
  from clinica_servicios_habilitados
  where practica_medica_id = any(v_afectadas);
  if v_usadas > 0 then
    raise exception 'D2: % fila(s) de clinica_servicios_habilitados usan prácticas que se dividen o mueven; resolver con el usuario antes de aplicar.', v_usadas;
  end if;

  select count(*) into v_usadas
  from tipos_tratamiento t
  join clinica_servicios_habilitados s on s.id = t.servicio_habilitado_id
  where s.practica_medica_id = any(v_afectadas);
  if v_usadas > 0 then
    raise exception 'D2: % tipo(s) de tratamiento apuntan a prácticas que se dividen o mueven.', v_usadas;
  end if;
end;
$$;

-- Internación se renumera completa (41..55) para abrir espacio a las 4
-- prácticas nuevas y a las 4 terapias que entran en Apoyo Diagnóstico
-- (37..40), conservando el orden relativo de la norma. Quirúrgico (60+) y
-- Atención Inmediata (70+) no cambian.
update practicas_medicas set codigo = 'Apoyo Diagnóstico', orden = 37 where id = 'ca345094-484f-4862-abfa-bee60fe80288';
update practicas_medicas set codigo = 'Apoyo Diagnóstico', orden = 38 where id = 'b1a73f46-6a9a-4969-b9f8-b002cb8a3466';
update practicas_medicas set codigo = 'Apoyo Diagnóstico', orden = 39 where id = '98b32dcc-2710-450d-a680-90fd025fbce6';
update practicas_medicas set codigo = 'Apoyo Diagnóstico', orden = 40 where id = '98fb0ad4-fa98-40e8-8ed0-3b9a3f3aa75e';

-- Primero el resto de Internación detrás de UCI (Quemados, Psiquiatría,
-- Cuidado agudo SM, Crónico, SPA, Internación parcial: 45..50 → 50..55),
-- antes de reubicar intermedio/intensivo para no volver a desplazarlos.
update practicas_medicas set orden = orden + 5
where codigo = 'Internación' and orden between 45 and 50;

update practicas_medicas set orden = orden + 1
where codigo = 'Internación' and orden between 40 and 42;  -- Hosp. adultos, pediátrica, Obstetricia → 41..43

-- Se renombran conservando su uuid (la población "adulto" hereda la fila).
update practicas_medicas
set nombre = 'Cuidado Intermedio Adulto', orden = 44,
    requisitos = 'Médico intensivista/especialista, Enfermeros. Monitoreo continuo, gases medicinales, bombas de infusión.'
where id = '49e50cf6-f3be-4c3c-9e95-2a53f2290b05';

update practicas_medicas
set nombre = 'Cuidado Intensivo Adultos', orden = 47,
    requisitos = 'Médico intensivista (24/7). Ventiladores mecánicos (1 por cama), monitorización invasiva, marcapasos, interdependencia total (Laboratorio, Rx, Banco de Sangre 24/7).'
where id = 'cfcbd41c-2354-427c-913a-b40fd638c766';

-- Uuids deterministas (v5) para que el mapeo práctica → servicio de la
-- norma (F0, scripts/habilitacion) sea reproducible entre entornos:
--   namespace del proyecto = uuidv5(NAMESPACE_URL, 'https://ewah.tech/habilitacion')
--                          = 05a6798d-3cc3-5f50-b6af-a9d34aa0ca60
--   id = uuidv5(namespace, 'practicas_medicas:' || nombre)
insert into practicas_medicas (id, codigo, nombre, complejidad, requisitos, orden) values
  ('3673c387-2801-50f0-8a00-927c8981a1a9', 'Internación', 'Cuidado Intermedio Pediátrico', 'Media/Alta',
   'Médico intensivista/especialista pediátrico, Enfermeros. Monitoreo continuo, gases medicinales, bombas de infusión.', 45),
  ('289d037a-58b5-5064-b9b2-edb4b3d87107', 'Internación', 'Cuidado Intermedio Neonatal', 'Media/Alta',
   'Médico especialista (neonatología/pediatría), Enfermeros. Monitoreo continuo, gases medicinales, bombas de infusión de microgoteo.', 46),
  ('9de2eef7-0330-5f70-b491-6e6e7b502a57', 'Internación', 'Cuidado Intensivo Pediátrico', 'Alta',
   'Médico intensivista pediátrico (24/7). Ventiladores mecánicos (1 por cama), monitorización invasiva, interdependencia total (Laboratorio, Rx, Banco de Sangre 24/7).', 48),
  ('9067fd2f-72ac-5e98-a8ac-1f93007a9581', 'Internación', 'Cuidado Intensivo Neonatal', 'Alta',
   'Médico neonatólogo/intensivista (24/7). Incubadoras, ventiladores neonatales, monitorización invasiva, interdependencia total (Laboratorio, Rx, Banco de Sangre 24/7).', 49)
on conflict (id) do nothing;

-- ============================================================
-- 3. clinica_servicios_habilitados por sede (D1, §1.3)
-- ============================================================
-- Semántica nueva: 1 fila = práctica × sede (× numeral de la norma desde
-- 0062). Datos básicos (todos los planes, admin) crea/edita práctica +
-- sede + código; Habilitación > Sedes y servicios (Pro) editará
-- complejidad, modalidades, telemedicina, estado y fechas. Misma fila,
-- columnas distintas: una sola fuente de verdad.
--
-- sede_id nullable a propósito: existe 1 fila real (IPS ACME, Medicina
-- General) creada sin sede porque esa clínica no tiene sedes; sin sede la
-- fila no entra al motor de aplicabilidad y la UI la marca "Asigna una
-- sede". on delete restrict: una sede con servicios declarados no se
-- borra por debajo (hoy sedes no tiene delete; se inactivan).
alter table clinica_servicios_habilitados
  add column sede_id uuid references sedes(id) on delete restrict,
  add column complejidad text
    check (complejidad in ('baja', 'mediana', 'alta', 'no_aplica')),
  add column modalidades text[] not null default '{}'
    check (modalidades <@ array['intramural', 'extramural', 'extramural_unidad_movil',
      'extramural_jornada_salud', 'extramural_domiciliaria', 'telemedicina']::text[]),
  add column telemedicina_categorias text[] not null default '{}'
    check (telemedicina_categorias <@ array['interactiva', 'no_interactiva', 'telexperticia', 'telemonitoreo']::text[]),
  add column telemedicina_roles text[] not null default '{}'
    check (telemedicina_roles <@ array['prestador_remisor', 'prestador_referencia']::text[]),
  add column estado text not null default 'por_habilitar'
    check (estado in ('por_habilitar', 'habilitado', 'cierre_temporal', 'cerrado')),
  add column fecha_habilitacion date,
  add column fecha_cierre_temporal date,
  add column updated_by uuid references usuarios(id);

-- Coherencia intra-fila que no depende del catálogo de la norma: categorías
-- o roles de telemedicina solo si la modalidad telemedicina está declarada.
-- (Que esas categorías sean las que admite el servicio de la norma lo
-- valida el trigger de 0062.)
alter table clinica_servicios_habilitados
  add constraint clinica_servicios_habilitados_telemedicina_coherente check (
    (cardinality(telemedicina_categorias) = 0 and cardinality(telemedicina_roles) = 0)
    or 'telemedicina' = any(modalidades)
  );

-- La misma práctica puede declararse en varias sedes. nulls not distinct:
-- dos filas "sin sede" de la misma práctica siguen siendo duplicado.
-- 0062 lo reemplaza por (clinica_id, sede_id, practica_medica_id,
-- servicio_norma_id) para permitir Obstetricia/SPA/Quemados con dos
-- numerales.
alter table clinica_servicios_habilitados
  drop constraint clinica_servicios_habilitados_clinica_id_practica_medica_id_key;
alter table clinica_servicios_habilitados
  add constraint clinica_servicios_habilitados_clinica_sede_practica_key
  unique nulls not distinct (clinica_id, sede_id, practica_medica_id);

create index idx_clinica_servicios_habilitados_sede on clinica_servicios_habilitados(sede_id);

-- Trigger genérico de misma clínica para FKs a filas de la clínica (§1.4,
-- §1.7): sin esto un sede_id de OTRA clínica pasaría la FK (misma clase de
-- IDOR ya corregida en 0056/0057). Parametrizado por TG_ARGV para que
-- todas las tablas hab_* lo reutilicen en vez de escribir uno por FK:
--   tg_argv[0] = columna FK en la tabla que dispara
--   tg_argv[1] = tabla referenciada (debe tener id y clinica_id)
--   tg_argv[2] = mensaje para el usuario
-- security definer: debe poder ver la fila referenciada aunque el RLS del
-- usuario no se la muestre, precisamente para detectar el id ajeno.
create or replace function fn_hab_misma_clinica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  v_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
  if v_id is null then
    return new;
  end if;
  execute format('select exists (select 1 from %I where id = $1 and clinica_id = $2)', tg_argv[1])
    into v_ok
    using v_id, new.clinica_id;
  if not v_ok then
    raise exception '%', coalesce(tg_argv[2], 'El registro referenciado no pertenece a esta clínica.');
  end if;
  return new;
end;
$$;

create trigger clinica_servicios_habilitados_sede_misma_clinica
  before insert or update of sede_id, clinica_id on clinica_servicios_habilitados
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

-- RLS de escritura (§1.3): el admin sigue escribiendo desde Datos básicos
-- en todos los planes; además quien tenga habilitacion/EDIT con la
-- sub-feature de gestión (Pro) podrá editar el detalle desde Habilitación.
-- has_permission solo no basta: deja pasar a cualquier admin sin mirar el
-- plan, por eso va combinado con has_entitlement.
drop policy "clinica_servicios_habilitados_insert" on clinica_servicios_habilitados;
drop policy "clinica_servicios_habilitados_update" on clinica_servicios_habilitados;

create policy "clinica_servicios_habilitados_insert" on clinica_servicios_habilitados
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and (es_admin() or (has_permission('habilitacion', 'EDIT') and has_entitlement('habilitacion', 'gestion')))
  );

create policy "clinica_servicios_habilitados_update" on clinica_servicios_habilitados
  for update to authenticated using (
    clinica_id = clinica_actual()
    and (es_admin() or (has_permission('habilitacion', 'EDIT') and has_entitlement('habilitacion', 'gestion')))
  )
  with check (clinica_id = clinica_actual());

-- Delete sigue siendo solo admin (política de 0055 sin cambios). El
-- bloqueo "tiene autoevaluación registrada" llega con las evaluaciones
-- (0066), que es cuando hay algo que proteger.

-- ============================================================
-- 4. tipos_tratamiento → práctica (decisión A del usuario)
-- ============================================================
-- Con filas de servicio por sede, apuntar a clinica_servicios_habilitados
-- ataba el tipo de tratamiento a una sede y duplicaba el servicio en el
-- desplegable. Ahora apunta al servicio general (practicas_medicas, global
-- → no necesita trigger de misma clínica); el código de habilitación para
-- RIPS se resuelve con la sede donde se presta el tratamiento.
-- servicio_habilitado_id (0057) queda sin uso, no se borra (0 filas lo
-- usaban al aplicar esto; el update de abajo es solo red de seguridad).
alter table tipos_tratamiento
  add column practica_medica_id uuid references practicas_medicas(id) on delete set null;

create index idx_tipos_tratamiento_practica_medica on tipos_tratamiento(practica_medica_id);

update tipos_tratamiento t
set practica_medica_id = s.practica_medica_id
from clinica_servicios_habilitados s
where s.id = t.servicio_habilitado_id and t.practica_medica_id is null;

comment on column tipos_tratamiento.servicio_habilitado_id is
  'Sin uso desde 0061: reemplazada por practica_medica_id (el servicio es por sede, el tipo de tratamiento no).';

-- ============================================================
-- 5. sedes: datos de edificación para habilitación (§1.3)
-- ============================================================
-- fecha y no año: las reglas de infraestructura cortan en 2-dic-1996 y
-- mayo-2005. Si el usuario solo sabe el año se guarda el 1-ene con
-- fecha_construccion_es_aproximada = true.
alter table sedes
  add column uso_edificacion text check (uso_edificacion in ('exclusivo_salud', 'mixto')),
  add column fecha_construccion_intervencion date,
  add column fecha_construccion_es_aproximada boolean not null default false,
  add column codigo_sede_reps text;

-- La sede ahora lleva datos regulatorios → auditada (no lo estaba).
create trigger sedes_auditoria
  after insert or update or delete on sedes
  for each row execute function fn_auditoria();

-- Única vía de escritura de esas 4 columnas. security definer: ELEVA para
-- escribir solo estas columnas de `sedes` sin abrir su política de UPDATE
-- general a `habilitacion/EDIT` (eso permitiría renombrar sedes, que es de
-- Parámetros). Valida clínica, permiso y plan por su cuenta.
create or replace function fn_hab_actualizar_edificacion_sede(
  p_sede_id uuid,
  p_uso text,
  p_fecha date,
  p_aproximada boolean,
  p_codigo_reps text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if not (has_permission('habilitacion', 'EDIT') and has_entitlement('habilitacion', 'gestion')) then
    raise exception 'No tienes permiso para editar los datos de habilitación de la sede.';
  end if;
  if p_uso is not null and p_uso not in ('exclusivo_salud', 'mixto') then
    raise exception 'Tipo de edificación inválido.';
  end if;

  update sedes
  set uso_edificacion = p_uso,
      fecha_construccion_intervencion = p_fecha,
      fecha_construccion_es_aproximada = coalesce(p_aproximada, false) and p_fecha is not null,
      codigo_sede_reps = nullif(trim(p_codigo_reps), '')
  where id = p_sede_id and clinica_id = v_clinica_id;

  if not found then
    raise exception 'La sede no existe o no pertenece a esta clínica.';
  end if;
end;
$$;

revoke all on function fn_hab_actualizar_edificacion_sede(uuid, text, date, boolean, text) from public, anon, authenticated;
grant execute on function fn_hab_actualizar_edificacion_sede(uuid, text, date, boolean, text) to authenticated;

-- ============================================================
-- 6. Perfil del prestador (§1.4) — 1:1 con la clínica
-- ============================================================
-- `id` propio (además de clinica_id unique) porque fn_auditoria() exige
-- columnas id y clinica_id (0007). Persona natural/jurídica, NIT, código
-- de prestador y departamento NO se duplican: se leen de `clinicas`.
-- Editable en TODOS los planes (decisión B): sin tipo de prestador, grupo
-- y fecha del REPS el calendario gratuito sale vacío.
create table hab_perfil_prestador (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null unique references clinicas(id) on delete cascade,
  -- 0062 lo convierte en FK a hab_tipos_prestador(codigo).
  tipo_prestador text
    check (tipo_prestador in ('ips', 'profesional_independiente', 'transporte_especial', 'objeto_social_diferente')),
  naturaleza text check (naturaleza in ('publica', 'privada', 'mixta')),
  es_esal boolean,
  es_cooperacion_internacional boolean,
  tiene_sedes_otros_departamentos boolean,
  es_ips_nueva boolean,
  estado_reps text not null default 'no_inscrito'
    check (estado_reps in ('no_inscrito', 'en_tramite', 'inscrito', 'inactivo')),
  fecha_inscripcion_inicial date,
  fecha_vencimiento_reps date,
  fecha_planeada_radicacion date,
  secretaria_departamento_id uuid references departamentos(id),
  secretaria_nombre text,
  ets_codigo text,
  ets_codigo_verificado boolean not null default false,
  grupo_supersalud text check (grupo_supersalud in ('B', 'C1', 'C2', 'D1', 'D2', 'D3')),
  grupo_fecha_clasificacion date,
  -- Snapshot de las respuestas del asistente + grupo sugerido: no se
  -- filtra ni se consulta por campo, por eso jsonb.
  grupo_asistente jsonb,
  tiene_revisor_fiscal boolean,
  es_upgd boolean,
  realiza_pedt boolean,
  factura_servicios_salud boolean,
  representante_legal_nombre text,
  representante_legal_documento text,
  exigir_evidencia_cumple boolean not null default true,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id),
  updated_at timestamptz not null default now(),
  constraint hab_perfil_inscrito_con_vencimiento
    check (estado_reps <> 'inscrito' or fecha_vencimiento_reps is not null),
  constraint hab_perfil_pi_sin_grupo
    check (tipo_prestador is distinct from 'profesional_independiente' or grupo_supersalud is null)
);

create trigger hab_perfil_prestador_set_updated_at
  before update on hab_perfil_prestador
  for each row execute function set_updated_at();

create trigger hab_perfil_prestador_auditoria
  after insert or update or delete on hab_perfil_prestador
  for each row execute function fn_auditoria();

alter table hab_perfil_prestador enable row level security;

create policy "hab_perfil_prestador_select" on hab_perfil_prestador
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

-- Sin has_entitlement a propósito (decisión B: Perfil editable en Gratis).
create policy "hab_perfil_prestador_insert" on hab_perfil_prestador
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'EDIT')
  );

create policy "hab_perfil_prestador_update" on hab_perfil_prestador
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Sin política de delete: el perfil no se borra.
-- El trigger que recalcula obligaciones al cambiar el perfil llega en F8
-- (0068), cuando existan las tablas de obligaciones.

-- Código del prestador (clinicas.codigo_habilitacion, 0052). Mismo patrón
-- que fn_actualizar_nit_clinica (0059). security definer: ELEVA para
-- escribir UNA columna de `clinicas` (cuyo UPDATE general es solo de
-- admin vía fn_actualizar_datos_basicos_clinica) a quien tenga
-- habilitacion/EDIT, en todos los planes (es dato del Perfil).
create or replace function fn_hab_actualizar_codigo_prestador(p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if not has_permission('habilitacion', 'EDIT') then
    raise exception 'No tienes permiso para cambiar el código del prestador.';
  end if;
  update clinicas set codigo_habilitacion = nullif(trim(p_codigo), '') where id = v_clinica_id;
end;
$$;

revoke all on function fn_hab_actualizar_codigo_prestador(text) from public, anon, authenticated;
grant execute on function fn_hab_actualizar_codigo_prestador(text) to authenticated;

-- ============================================================
-- 7. Storage: bucket privado `habilitacion` (§1.5)
-- ============================================================
-- Separado de documentos-rrhh: otra población de permisos y contiene
-- información financiera. Ruta: <clinica_id>/<area>/<id_entidad>/<uuid>.<ext>
-- (el primer segmento aísla por clínica). Se crea aquí y no en 0066 para
-- que F5/F7/F8 no dependan del orden en que se apliquen.
insert into storage.buckets (id, name, public)
values ('habilitacion', 'habilitacion', false)
on conflict (id) do nothing;

create policy "habilitacion_storage_select" on storage.objects
  for select using (
    bucket_id = 'habilitacion'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('habilitacion', 'VIEW')
  );

create policy "habilitacion_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'habilitacion'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
  );

-- Sin políticas de update ni delete (ni admin): los archivos de
-- habilitación nunca se borran ni se sobrescriben (retención del
-- requerimiento §3.3). Huérfanos por fallo entre upload e insert: job
-- manual de super admin (riesgo R7 del diseño).
