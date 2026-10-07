-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F7: documentos
-- de inscripción, trámite ante la secretaría y suficiencia patrimonial.
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico aprobado: diseno-tecnico-habilitacion.md §1.2
-- (hab_documentos_catalogo), §1.4 (hab_documentos_clinica,
-- hab_documento_versiones, hab_tramite_hitos, hab_suficiencia_patrimonial),
-- §1.5 (Storage), §3 y fila F7 de §7. Requerimiento: HU-3.1 a HU-3.5.
--
-- Contenido:
--   1. Catálogo global: explicación en lenguaje sencillo de los 35
--      documentos verificados (HU-3.1 AC2) + marca es_financiero.
--   2. hab_documentos_clinica — el renglón del checklist.
--   3. hab_documento_versiones — append-only, versión asignada por trigger.
--   4. hab_tramite_hitos — append-only con anulación + RPC
--      fn_hab_registrar_hito + días hábiles con `festivos`.
--   5. hab_suficiencia_patrimonial — append-only con anulación, solo IPS y
--      transporte especial, lectura solo con EDIT (información financiera).
--   6. Storage: los documentos financieros van en la carpeta `financiero`
--      del bucket `habilitacion` (creado en 0061) y solo se leen con EDIT.
--
-- Decisiones respecto al diseño (por escrito):
--   - Las funciones de inmutabilidad y de "solo anular" llevan nombre
--     propio de F7 (fn_hab_doc_version_inmutable, fn_hab_tramite_solo_anular)
--     y se crean SIN "or replace": F5 (0066) y F8 (0069) se construyeron en
--     paralelo y podrían definir las genéricas fn_hab_inmutable /
--     fn_hab_solo_anular con otro cuerpo; así ninguna fase pisa en silencio
--     la función de otra. Consolidarlas es tarea de F11.
--   - Los renglones del checklist se crean bajo demanda (al subir el primer
--     archivo o marcar "No aplica"), no en bloque al abrir la pantalla: el
--     checklist se CALCULA con reglas en lib/habilitacion/reglas-documentos.ts
--     y un renglón solo existe cuando hay algo que guardar. Un GET nunca
--     escribe.
--   - Subsanación tras la visita (HU-3.4 AC2): la tabla de obligaciones es
--     de F8 (0069). Aquí el hito guarda `subsanar_hasta` = fecha del acta +
--     8 días hábiles (calculado en BD con `festivos`) y F8 crea la
--     ocurrencia `subsanacion-visita` a partir de esa columna (trigger after
--     insert sobre hab_tramite_hitos, ver comentario en §4).
--   - es_financiero en el catálogo (el diseño decía "documento financiero ⇒
--     EDIT para leerlo" sin columna que lo marque).

-- ============================================================
-- 1. Catálogo global de documentos
-- ============================================================
alter table hab_documentos_catalogo
  add column es_financiero boolean not null default false;

comment on column hab_documentos_catalogo.es_financiero is
  'Información financiera de la clínica: sus archivos van en <clinica>/financiero/ y solo los lee quien tenga habilitacion/EDIT con plan Pro.';

update hab_documentos_catalogo set es_financiero = true
where codigo in (
  'certificacion_suficiencia_patrimonial', 'estados_financieros', 'certificado_cuenta_bancaria_ips',
  'libros_oficiales', 'reporte_obligaciones_mercantiles_vencidas', 'reporte_obligaciones_laborales_vencidas'
);

-- Explicación sencilla (HU-3.1 AC2). Parafrasea la descripción literal, que
-- sigue siendo la fuente y se muestra al lado; no agrega requisitos.
update hab_documentos_catalogo c
set explicacion_sencilla = v.texto
from (values
  ('formulario_inscripcion_reps', 'Es el formulario que llenas en línea en el REPS (sedes, servicios, capacidad instalada). Lo imprimes y lo radicas en la secretaría de salud junto con los demás soportes.'),
  ('declaracion_autoevaluacion', 'Al terminar la autoevaluación, el REPS genera una declaración por cada servicio que vas a ofrecer. Se imprime y se radica con el formulario.'),
  ('licencia_practica_medica_radiaciones', 'Si en el servicio usas equipos que emiten radiaciones ionizantes (por ejemplo rayos X), necesitas la licencia vigente de esos equipos. El radicado de la solicitud no sirve: tiene que ser la licencia.'),
  ('telemedicina_contrato_prestador_referencia', 'Si atiendes por telemedicina como prestador remisor (tienes al paciente y otro prestador te apoya a distancia), aporta el contrato o convenio con ese prestador de referencia y la lista de servicios que te garantiza.'),
  ('telemedicina_certificacion_conexion_internet', 'Certificado de tu conexión a internet que demuestre que sirve para el tipo de telemedicina que vas a prestar (en tiempo real o diferida).'),
  ('telemedicina_certificado_ingeniero_sistemas', 'Documento firmado por un ingeniero de sistemas con tarjeta profesional vigente que certifica que tu plataforma de telemedicina cumple lo exigido.'),
  ('documento_identificacion_persona_natural', 'Copia de tu documento de identidad.'),
  ('certificado_existencia_representacion_legal', 'Lo expide la Cámara de Comercio (o la autoridad que corresponda a tu naturaleza). No puede tener más de 30 días el día que radicas: pídelo cerca de esa fecha.'),
  ('certificado_matricula_sedes_sucursales', 'Si tienes sedes, sucursales o agencias en otros departamentos o distritos, aporta además el certificado de matrícula de cada una, con la misma razón social del certificado principal.'),
  ('acto_personeria_juridica_esal', 'Si eres una fundación, asociación, corporación u otra entidad sin ánimo de lucro, aporta el acto que te reconoce personería jurídica y representación legal, con la ubicación de tus sedes.'),
  ('acto_creacion_entidad_publica', 'Si eres una entidad pública (por ejemplo una ESE), aporta el acto administrativo que la creó.'),
  ('documento_domicilio_organismo_cooperacion', 'Si eres un organismo de cooperación internacional u ONG, aporta el documento que indica tu domicilio en Colombia; ese domicilio cuenta como tu sede.'),
  ('documento_identidad_representante_legal', 'Copia de la cédula de quien figura como representante legal (o del suplente, cuando aplique).'),
  ('nit', 'Copia del documento donde consta el NIT de la entidad.'),
  ('rut', 'Copia del Registro Único Tributario (RUT) de la DIAN.'),
  ('titulos_educacion_superior', 'Copia de tus títulos de pregrado y posgrado. Si estudiaste en el exterior, también la resolución de convalidación del Ministerio de Educación.'),
  ('tarjeta_profesional_o_rethus', 'Tu tarjeta profesional, la resolución que te autoriza a ejercer o tu inscripción en el ReTHUS.'),
  ('certificado_instalaciones_electricas', 'Certificado RETIE de las instalaciones eléctricas de la sede. Si la edificación es anterior a mayo de 2005 lo expide un profesional competente; si es posterior, un organismo de inspección acreditado por la ONAC.'),
  ('plan_ajustes_instalaciones_electricas', 'Si la edificación es anterior a mayo de 2005, además de la certificación eléctrica aporta un plan de ajustes de esas instalaciones.'),
  ('licencia_construccion', 'Licencia de construcción de la edificación donde funciona la sede, en la que conste que se destina a servicios de salud. Si la edificación es muy antigua, la norma admite el documento de reconocimiento.'),
  ('permiso_propiedad_horizontal', 'Si la sede está en un edificio de uso mixto construido, ampliado o remodelado después del 2 de diciembre de 1996, aporta el permiso de la propiedad horizontal para adecuar allí servicios de salud.'),
  ('certificado_seguridad_edificacion', 'Copia del certificado de seguridad de la edificación. La norma no dice qué autoridad lo expide: confírmalo con tu secretaría.'),
  ('estudio_vulnerabilidad_estructural', 'Si tienes urgencias, cirugía o cuidado intensivo en una edificación construida antes de 2010, aporta el estudio de vulnerabilidad estructural (NSR-10).'),
  ('plan_reforzamiento_estructural', 'En el mismo caso del estudio de vulnerabilidad (urgencias, cirugía o UCI en edificación anterior a 2010), aporta también el plan para reforzar la estructura.'),
  ('plan_hospitalario_emergencias', 'Copia del plan hospitalario para emergencias de la institución.'),
  ('plan_mantenimiento_planta_fisica', 'Copia del plan de mantenimiento de la planta física, que debe incluir el equipamiento fijo. Una entidad con objeto social diferente puede usar el de la edificación.'),
  ('certificacion_suficiencia_patrimonial', 'Certificación firmada por tu revisor fiscal o contador de que cumples los indicadores de suficiencia patrimonial y financiera. La calculadora de esta página te ayuda a revisarlos antes.'),
  ('tarjeta_profesional_contador_revisor', 'Copia de la tarjeta profesional del contador o revisor fiscal que firma la certificación de suficiencia patrimonial.'),
  ('estados_financieros', 'Si eres una IPS nueva: estados financieros de constitución, de periodos intermedios o de cierre, certificados o dictaminados. No se radican: te los pueden pedir en la visita.'),
  ('certificado_cuenta_bancaria_ips', 'Si eres una IPS nueva: certificado de una cuenta bancaria a nombre de la IPS. No se radica: te lo pueden pedir en la visita.'),
  ('libros_oficiales', 'Si eres una IPS nueva y te aplica: libros oficiales registrados. No se radican: te los pueden pedir en la visita.'),
  ('reporte_obligaciones_mercantiles_vencidas', 'Reporte certificado por el revisor fiscal o contador de las deudas con proveedores vencidas hace más de 360 días. Con él se calcula el segundo indicador de suficiencia.'),
  ('reporte_obligaciones_laborales_vencidas', 'Reporte certificado por el revisor fiscal o contador de las deudas laborales (nómina y otras) vencidas hace más de 360 días. Con él se calcula el tercer indicador de suficiencia.'),
  ('tarjeta_propiedad_vehiculos', 'Tarjeta de propiedad de los vehículos (ambulancias o vehículos de transporte). Si están a nombre de otra persona, también la autorización del propietario.'),
  ('revision_tecnico_mecanica', 'Certificado vigente de revisión técnico-mecánica de los vehículos, cuando la norma de tránsito lo exige.')
) as v(codigo, texto)
where c.codigo = v.codigo;

do $$
declare
  v_sin int;
begin
  select count(*) into v_sin from hab_documentos_catalogo
  where verificado and explicacion_sencilla is null;
  if v_sin > 0 then
    raise exception 'F7: % documento(s) verificados quedaron sin explicación sencilla.', v_sin;
  end if;
  select count(*) into v_sin from hab_documentos_catalogo where es_financiero;
  if v_sin <> 6 then
    raise exception 'F7: se esperaban 6 documentos financieros y hay %.', v_sin;
  end if;
end;
$$;

-- ============================================================
-- 2. hab_documentos_clinica — el renglón del checklist
-- ============================================================
-- El ESTADO (pendiente / cargado / vencido / no aplica / ya no aplica) no se
-- guarda: se calcula al leer (lib/habilitacion/estado-documento.ts). Guardarlo
-- crearía una segunda verdad que se desincroniza con el paso del tiempo.
create table hab_documentos_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  -- null = documento adicional (nombre libre).
  documento_catalogo_id uuid references hab_documentos_catalogo(id),
  nombre_adicional text,
  -- Obligatorio en documentos por sede (RETIE, licencia de construcción...).
  -- Sin acción en delete (= no action, se verifica al final de la
  -- sentencia): una sede o un servicio con documentos no se borran por
  -- debajo, pero la cascada de borrar la clínica entera sí pasa (con
  -- RESTRICT fallaría según el orden en que la cascada visita las tablas).
  sede_id uuid references sedes(id),
  -- Declaración de autoevaluación: una por servicio (Art. 7.1.4). Mensaje
  -- claro al intentar borrar el servicio: trigger de §2.1.
  servicio_habilitado_id uuid references clinica_servicios_habilitados(id),
  no_aplica boolean not null default false,
  no_aplica_justificacion text,
  observaciones text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id),
  updated_at timestamptz not null default now(),
  constraint hab_documentos_clinica_adicional_con_nombre check (
    documento_catalogo_id is not null
    or (nombre_adicional is not null and length(trim(nombre_adicional)) between 3 and 200)
  ),
  constraint hab_documentos_clinica_no_aplica_justificado check (
    not no_aplica or length(trim(coalesce(no_aplica_justificacion, ''))) between 10 and 2000
  ),
  constraint hab_documentos_clinica_no_aplica_solo_catalogo check (
    not no_aplica or documento_catalogo_id is not null
  ),
  constraint hab_documentos_clinica_observaciones_largo check (length(coalesce(observaciones, '')) <= 4000)
);

create unique index hab_documentos_clinica_renglon_unico
  on hab_documentos_clinica (clinica_id, documento_catalogo_id, sede_id, servicio_habilitado_id) nulls not distinct
  where documento_catalogo_id is not null;

create index idx_hab_documentos_clinica_clinica on hab_documentos_clinica(clinica_id);
create index idx_hab_documentos_clinica_sede on hab_documentos_clinica(sede_id);
create index idx_hab_documentos_clinica_servicio on hab_documentos_clinica(servicio_habilitado_id);

create trigger hab_documentos_clinica_set_updated_at
  before update on hab_documentos_clinica
  for each row execute function set_updated_at();

create trigger hab_documentos_clinica_auditoria
  after insert or update or delete on hab_documentos_clinica
  for each row execute function fn_auditoria();

-- IDOR por FK (patrón de 0061): sede y servicio deben ser de la clínica.
create trigger hab_documentos_clinica_sede_misma_clinica
  before insert or update of sede_id, clinica_id on hab_documentos_clinica
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

create trigger hab_documentos_clinica_servicio_misma_clinica
  before insert or update of servicio_habilitado_id, clinica_id on hab_documentos_clinica
  for each row execute function fn_hab_misma_clinica('servicio_habilitado_id', 'clinica_servicios_habilitados', 'El servicio no pertenece a esta clínica.');

-- Forma del renglón según el catálogo + identidad inmutable. Lo que el
-- renglón ES (qué documento, de qué sede o servicio) no cambia; solo cambian
-- la marca de "No aplica", su justificación y las observaciones.
-- security definer: lee hab_documentos_catalogo sin depender del RLS de
-- quien escribe (hoy es legible por todos); no eleva nada más.
create function fn_hab_documento_clinica_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_por_sede boolean;
  v_por_servicio boolean;
begin
  if tg_op = 'UPDATE' then
    if new.clinica_id is distinct from old.clinica_id
      or new.documento_catalogo_id is distinct from old.documento_catalogo_id
      or new.nombre_adicional is distinct from old.nombre_adicional
      or new.sede_id is distinct from old.sede_id
      or new.servicio_habilitado_id is distinct from old.servicio_habilitado_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'El documento no se puede reasignar: solo cambian la marca "No aplica" y las observaciones.';
    end if;
    return new;
  end if;

  if new.documento_catalogo_id is null then
    -- Documento adicional: sede opcional, nunca por servicio.
    if new.servicio_habilitado_id is not null then
      raise exception 'Un documento adicional no se asocia a un servicio.';
    end if;
    return new;
  end if;

  select por_sede, uno_por_servicio into v_por_sede, v_por_servicio
  from hab_documentos_catalogo where id = new.documento_catalogo_id;

  if v_por_servicio then
    if new.servicio_habilitado_id is null or new.sede_id is not null then
      raise exception 'Este documento se carga uno por cada servicio declarado.';
    end if;
  elsif v_por_sede then
    if new.sede_id is null or new.servicio_habilitado_id is not null then
      raise exception 'Este documento se carga uno por cada sede.';
    end if;
  elsif new.sede_id is not null or new.servicio_habilitado_id is not null then
    raise exception 'Este documento es uno solo para toda la clínica.';
  end if;
  return new;
end;
$$;

create trigger hab_documentos_clinica_validar
  before insert or update on hab_documentos_clinica
  for each row execute function fn_hab_documento_clinica_validar();

alter table hab_documentos_clinica enable row level security;

create policy "hab_documentos_clinica_select" on hab_documentos_clinica
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

-- El renglón nace al subir el primer archivo (CREATE) o al marcar "No
-- aplica" (EDIT); siempre con el plan Pro (has_permission solo deja pasar
-- a cualquier admin sin mirar el plan).
create policy "hab_documentos_clinica_insert" on hab_documentos_clinica
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and (has_permission('habilitacion', 'CREATE') or has_permission('habilitacion', 'EDIT'))
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_documentos_clinica_update" on hab_documentos_clinica
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- Sin política de delete (HU-1.1 AC2 / requerimiento §3.3: lo cargado no se
-- borra).

-- 2.1 Un servicio con documentos de habilitación no se elimina desde Datos
-- básicos: el FK restrict ya lo impide, este trigger solo da el mensaje en
-- palabras del usuario (lib/clinicas/servicios-habilitados-db.ts muestra
-- los P0001 tal cual).
create function fn_servicio_habilitado_no_borrar_con_documentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cascada por borrado de la clínica entera: se deja pasar.
  if not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;
  if exists (select 1 from hab_documentos_clinica where servicio_habilitado_id = old.id) then
    raise exception 'Este servicio tiene documentos de habilitación registrados (su declaración de autoevaluación); no se puede eliminar. Si dejaste de prestarlo, márcalo como cerrado en Habilitación → Sedes y servicios.';
  end if;
  return old;
end;
$$;

create trigger clinica_servicios_habilitados_no_borrar_con_documentos
  before delete on clinica_servicios_habilitados
  for each row execute function fn_servicio_habilitado_no_borrar_con_documentos();

-- ============================================================
-- 3. hab_documento_versiones — append-only (HU-3.5)
-- ============================================================
-- Subir un archivo nuevo crea la versión N+1; la anterior queda en el
-- historial para demostrar qué estaba vigente en cada fecha.
create table hab_documento_versiones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  documento_id uuid not null references hab_documentos_clinica(id) on delete cascade,
  -- La asigna el trigger; lo que mande la app se ignora.
  version int not null,
  storage_path text not null unique,
  -- Nombre que tenía el archivo en el equipo del usuario: SOLO para mostrar
  -- (se escapa al renderizar). La ruta en Storage nunca se deriva de él.
  nombre_archivo text not null check (length(nombre_archivo) between 1 and 255),
  -- MIME verificado por la firma del archivo en el servidor, no el que dice
  -- el navegador.
  mime text not null check (mime in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  tamano_bytes int not null check (tamano_bytes > 0 and tamano_bytes <= 10485760),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  fecha_expedicion date,
  fecha_vencimiento date,
  -- Copia del catálogo al momento de subir (la fija el trigger): permite que
  -- la política de lectura no tenga que unir tablas por cada fila.
  es_financiero boolean not null default false,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  unique (documento_id, version),
  constraint hab_documento_versiones_fechas check (
    fecha_vencimiento is null or fecha_expedicion is null or fecha_vencimiento >= fecha_expedicion
  )
);

create index idx_hab_documento_versiones_clinica on hab_documento_versiones(clinica_id);
create index idx_hab_documento_versiones_documento on hab_documento_versiones(documento_id, version desc);

create trigger hab_documento_versiones_auditoria
  after insert or update or delete on hab_documento_versiones
  for each row execute function fn_auditoria();

create trigger hab_documento_versiones_documento_misma_clinica
  before insert on hab_documento_versiones
  for each row execute function fn_hab_misma_clinica('documento_id', 'hab_documentos_clinica', 'El documento no pertenece a esta clínica.');

-- Numeración sin carrera (el diseño señala que lib/rrhh/protocolos.ts la
-- calcula en la app y tiene condición de carrera: no se copia). Bloquea la
-- fila padre con FOR UPDATE: dos subidas simultáneas al mismo documento se
-- serializan y reciben N+1 y N+2.
-- security definer: el FOR UPDATE exige privilegio de UPDATE sobre el padre
-- y quien solo tiene CREATE no lo tiene por RLS; además debe ver versiones
-- financieras ajenas a su permiso para no repetir un número. No eleva nada
-- más: solo lee el padre y el máximo de versión, y fija columnas de NEW.
create function fn_hab_doc_version_siguiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_padre record;
begin
  select d.id, d.clinica_id, d.no_aplica, coalesce(c.es_financiero, false) as es_financiero
  into v_padre
  from hab_documentos_clinica d
  left join hab_documentos_catalogo c on c.id = d.documento_catalogo_id
  where d.id = new.documento_id
  for update of d;

  if not found or v_padre.clinica_id <> new.clinica_id then
    raise exception 'El documento no pertenece a esta clínica.';
  end if;
  if v_padre.no_aplica then
    raise exception 'Este documento está marcado como "No aplica". Quita esa marca antes de subir un archivo.';
  end if;

  -- La ruta la arma el servidor: <clinica>/<documentos|financiero>/<documento>/<archivo>.
  -- Se exige aquí también para que un insert directo por PostgREST no
  -- pueda apuntar a archivos de otra carpeta (ni de otra clínica).
  if split_part(new.storage_path, '/', 1) <> new.clinica_id::text
    or split_part(new.storage_path, '/', 2) <> (case when v_padre.es_financiero then 'financiero' else 'documentos' end)
    or split_part(new.storage_path, '/', 3) <> new.documento_id::text
  then
    raise exception 'Ruta de archivo inválida para este documento.';
  end if;

  new.es_financiero := v_padre.es_financiero;
  select coalesce(max(version), 0) + 1 into new.version
  from hab_documento_versiones where documento_id = new.documento_id;
  new.created_at := now();
  return new;
end;
$$;

create trigger hab_documento_versiones_siguiente
  before insert on hab_documento_versiones
  for each row execute function fn_hab_doc_version_siguiente();

-- Append-only real. El único DELETE admitido es la cascada al borrar la
-- clínica entera (la fila de clinicas ya no existe en ese punto); un DELETE
-- directo, aun con service role, falla.
create function fn_hab_doc_version_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;
  raise exception 'Las versiones de un documento no se modifican ni se borran: sube una versión nueva.';
end;
$$;

create trigger hab_documento_versiones_inmutable
  before update or delete on hab_documento_versiones
  for each row execute function fn_hab_doc_version_inmutable();

alter table hab_documento_versiones enable row level security;

-- Los documentos financieros (estados financieros, certificación de
-- suficiencia...) solo los ve quien gestiona con EDIT y plan Pro
-- (requerimiento §10, "roles que no deben ver").
create policy "hab_documento_versiones_select" on hab_documento_versiones
  for select to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'VIEW')
    and (not es_financiero or (has_permission('habilitacion', 'EDIT') and has_entitlement('habilitacion', 'gestion')))
  );

create policy "hab_documento_versiones_insert" on hab_documento_versiones
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
  );

-- Sin políticas de update ni delete.

-- ============================================================
-- 4. Trámite ante la secretaría (HU-3.4)
-- ============================================================
-- Suma N días hábiles (lunes a viernes sin festivos del país) a una fecha;
-- el día de partida no cuenta. Global y genérica: F8 puede reutilizarla para
-- las fechas límite de obligaciones.
create function fn_hab_sumar_dias_habiles(p_desde date, p_dias int, p_pais_codigo text default 'CO')
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_fecha date := p_desde;
  v_contados int := 0;
  v_pais uuid;
begin
  if p_desde is null or p_dias is null or p_dias < 0 then
    return null;
  end if;
  select id into v_pais from paises where codigo = p_pais_codigo;
  while v_contados < p_dias loop
    v_fecha := v_fecha + 1;
    if extract(isodow from v_fecha) < 6
      and not exists (select 1 from festivos where pais_id = v_pais and fecha = v_fecha)
    then
      v_contados := v_contados + 1;
    end if;
  end loop;
  return v_fecha;
end;
$$;

create table hab_tramite_hitos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo text not null check (tipo in (
    'radicado', 'devuelto_inconsistencias', 'codigo_asignado', 'visita_previa_programada',
    'visita_realizada', 'subsanacion_radicada', 'constancia_expedida', 'distintivo', 'visita_certificacion'
  )),
  fecha date not null,
  numero text check (length(numero) <= 100),
  observacion text check (length(observacion) <= 4000),
  hay_incumplimientos_subsanables boolean,
  -- Fecha del acta + 8 días hábiles (Manual 9.3.4.1). La fija el trigger;
  -- F8 crea la ocurrencia de obligación a partir de esta columna.
  subsanar_hasta date,
  storage_path text unique,
  nombre_archivo text check (length(nombre_archivo) between 1 and 255),
  mime text,
  tamano_bytes int check (tamano_bytes > 0 and tamano_bytes <= 10485760),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_por uuid references usuarios(id),
  anulado_en timestamptz,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  constraint hab_tramite_hitos_subsanables_solo_visita check (
    hay_incumplimientos_subsanables is null or tipo = 'visita_realizada'
  ),
  constraint hab_tramite_hitos_archivo_completo check (
    (storage_path is null and nombre_archivo is null and mime is null and tamano_bytes is null)
    or (storage_path is not null and nombre_archivo is not null and mime is not null and tamano_bytes is not null)
  ),
  constraint hab_tramite_hitos_anulado_motivo check (
    not anulado or length(trim(coalesce(anulado_motivo, ''))) >= 10
  )
);

create index idx_hab_tramite_hitos_clinica on hab_tramite_hitos(clinica_id, fecha desc);

create trigger hab_tramite_hitos_auditoria
  after insert or update or delete on hab_tramite_hitos
  for each row execute function fn_auditoria();

create function fn_hab_tramite_hito_preparar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.storage_path is not null and (
    split_part(new.storage_path, '/', 1) <> new.clinica_id::text
    or split_part(new.storage_path, '/', 2) <> 'tramite'
    or split_part(new.storage_path, '/', 3) <> new.id::text
  ) then
    raise exception 'Ruta de archivo inválida para este hito.';
  end if;
  if new.tipo = 'visita_realizada' and coalesce(new.hay_incumplimientos_subsanables, false) then
    new.subsanar_hasta := fn_hab_sumar_dias_habiles(new.fecha, 8);
  else
    new.subsanar_hasta := null;
  end if;
  new.anulado := false;
  new.anulado_motivo := null;
  new.anulado_por := null;
  new.anulado_en := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger hab_tramite_hitos_preparar
  before insert on hab_tramite_hitos
  for each row execute function fn_hab_tramite_hito_preparar();

-- "Solo anular" genérico para las tablas append-only con anulación de F7
-- (hitos y suficiencia): la única transición permitida es anulado
-- false → true con motivo ≥ 10 caracteres; el resto de columnas no cambia.
-- Mismo DELETE de cascada que las versiones.
create function fn_hab_tramite_solo_anular()
returns trigger
language plpgsql
as $$
declare
  v_campos text[] := array['anulado', 'anulado_motivo', 'anulado_por', 'anulado_en'];
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from clinicas where id = old.clinica_id) then
      return old;
    end if;
    raise exception 'Este registro no se borra: anúlalo con un motivo.';
  end if;
  if (to_jsonb(new) - v_campos) is distinct from (to_jsonb(old) - v_campos) then
    raise exception 'Este registro no se edita: anúlalo y registra uno nuevo.';
  end if;
  if old.anulado then
    raise exception 'Este registro ya está anulado.';
  end if;
  if not new.anulado or length(trim(coalesce(new.anulado_motivo, ''))) < 10 then
    raise exception 'Para anular escribe el motivo (mínimo 10 caracteres).';
  end if;
  new.anulado_en := now();
  new.anulado_por := auth.uid();
  return new;
end;
$$;

create trigger hab_tramite_hitos_solo_anular
  before update or delete on hab_tramite_hitos
  for each row execute function fn_hab_tramite_solo_anular();

alter table hab_tramite_hitos enable row level security;

create policy "hab_tramite_hitos_select" on hab_tramite_hitos
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_tramite_hitos_insert" on hab_tramite_hitos
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_tramite_hitos_update" on hab_tramite_hitos
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'VOID')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- Registrar un hito y sus efectos sobre el perfil en UNA transacción
-- (security invoker: el RLS de cada tabla sigue mandando).
--   radicado            → estado REPS 'en_tramite' si estaba 'no_inscrito'.
--   codigo_asignado     → código del prestador si la clínica no tenía (RPC
--                         angosta de 0061, que exige habilitacion/EDIT).
--   constancia_expedida → estado REPS 'inscrito' con fecha de inscripción y
--                         de vencimiento (HU-3.4 AC3; el check de 0061 exige
--                         la fecha de vencimiento con 'inscrito').
--   visita_realizada con subsanables → subsanar_hasta (trigger). PARA F8:
--     crear la ocurrencia `subsanacion-visita` con límite = subsanar_hasta
--     desde un trigger AFTER INSERT sobre hab_tramite_hitos (y anularla si
--     el hito se anula). No se crea aquí porque la tabla es de 0069.
create function fn_hab_registrar_hito(
  p_id uuid,
  p_tipo text,
  p_fecha date,
  p_numero text,
  p_observacion text,
  p_hay_subsanables boolean,
  p_storage_path text,
  p_nombre_archivo text,
  p_mime text,
  p_tamano_bytes int,
  p_sha256 text,
  p_fecha_vencimiento_reps date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_perfil record;
begin
  if v_clinica is null then
    raise exception 'Sesión inválida.';
  end if;
  -- La constancia cambia el perfil a "Inscrito": exige poder editarlo (si
  -- no, el UPDATE de abajo no afectaría filas por RLS y quedaría a medias).
  if p_tipo = 'constancia_expedida' and not has_permission('habilitacion', 'EDIT') then
    raise exception 'Registrar la constancia actualiza tu perfil a "Inscrito": necesitas permiso de edición en Habilitación.';
  end if;

  insert into hab_tramite_hitos (
    id, clinica_id, tipo, fecha, numero, observacion, hay_incumplimientos_subsanables,
    storage_path, nombre_archivo, mime, tamano_bytes, sha256, created_by
  ) values (
    coalesce(p_id, gen_random_uuid()), v_clinica, p_tipo, p_fecha, nullif(trim(p_numero), ''),
    nullif(trim(p_observacion), ''),
    case when p_tipo = 'visita_realizada' then coalesce(p_hay_subsanables, false) end,
    p_storage_path, p_nombre_archivo, p_mime, p_tamano_bytes, p_sha256, auth.uid()
  )
  returning id into p_id;

  if p_tipo in ('radicado', 'constancia_expedida') then
    select id, estado_reps, fecha_inscripcion_inicial into v_perfil
    from hab_perfil_prestador where clinica_id = v_clinica;
    if not found then
      raise exception 'Completa primero el perfil del prestador.';
    end if;

    if p_tipo = 'radicado' and v_perfil.estado_reps = 'no_inscrito' then
      update hab_perfil_prestador set estado_reps = 'en_tramite', updated_by = auth.uid()
      where id = v_perfil.id;
    elsif p_tipo = 'constancia_expedida' then
      if p_fecha_vencimiento_reps is null or p_fecha_vencimiento_reps <= p_fecha then
        raise exception 'Escribe la fecha de vencimiento de la inscripción (posterior a la constancia).';
      end if;
      update hab_perfil_prestador
      set estado_reps = 'inscrito',
          fecha_inscripcion_inicial = coalesce(fecha_inscripcion_inicial, p_fecha),
          fecha_vencimiento_reps = p_fecha_vencimiento_reps,
          updated_by = auth.uid()
      where id = v_perfil.id;
    end if;
  elsif p_tipo = 'codigo_asignado' and nullif(trim(p_numero), '') is not null
    and has_permission('habilitacion', 'EDIT') then
    if (select codigo_habilitacion from clinicas where id = v_clinica) is null then
      perform fn_hab_actualizar_codigo_prestador(p_numero);
    end if;
  end if;

  return p_id;
end;
$$;

revoke all on function fn_hab_registrar_hito(uuid, text, date, text, text, boolean, text, text, text, int, text, date) from public, anon;
grant execute on function fn_hab_registrar_hito(uuid, text, date, text, text, boolean, text, text, text, int, text, date) to authenticated;

-- ============================================================
-- 5. Suficiencia patrimonial (HU-3.3)
-- ============================================================
-- Res. 3100 art. 3.2 (texto Res. 544/2023): solo IPS y transporte especial.
-- Los 3 indicadores (Manual 8.2.1-8.2.3) NO se guardan: los calcula
-- lib/habilitacion/suficiencia.ts. numeric, nunca float (lección de 0050).
create table hab_suficiencia_patrimonial (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  fecha_corte date not null,
  patrimonio_total numeric(18, 2) not null,
  capital numeric(18, 2) not null check (capital >= 0),
  obligaciones_mercantiles_360 numeric(18, 2) not null check (obligaciones_mercantiles_360 >= 0),
  obligaciones_laborales_360 numeric(18, 2) not null check (obligaciones_laborales_360 >= 0),
  pasivo_corriente numeric(18, 2) not null check (pasivo_corriente >= 0),
  -- La certificación firmada (versión de un documento del checklist).
  documento_version_id uuid references hab_documento_versiones(id),
  observacion text check (length(observacion) <= 4000),
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_por uuid references usuarios(id),
  anulado_en timestamptz,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  constraint hab_suficiencia_anulado_motivo check (
    not anulado or length(trim(coalesce(anulado_motivo, ''))) >= 10
  )
);
-- patrimonio_total admite negativo a propósito: un patrimonio negativo es
-- un dato real (y no cumple el indicador), no un error de captura.

create index idx_hab_suficiencia_clinica on hab_suficiencia_patrimonial(clinica_id, fecha_corte desc);

create trigger hab_suficiencia_auditoria
  after insert or update or delete on hab_suficiencia_patrimonial
  for each row execute function fn_auditoria();

create trigger hab_suficiencia_version_misma_clinica
  before insert on hab_suficiencia_patrimonial
  for each row execute function fn_hab_misma_clinica('documento_version_id', 'hab_documento_versiones', 'La certificación no pertenece a esta clínica.');

create function fn_hab_suficiencia_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from hab_perfil_prestador
    where clinica_id = new.clinica_id and tipo_prestador in ('ips', 'transporte_especial')
  ) then
    raise exception 'La suficiencia patrimonial solo aplica a IPS y a transporte especial de pacientes (Res. 3100, art. 3.2).';
  end if;
  new.anulado := false;
  new.anulado_motivo := null;
  new.anulado_por := null;
  new.anulado_en := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger hab_suficiencia_validar
  before insert on hab_suficiencia_patrimonial
  for each row execute function fn_hab_suficiencia_validar();

create trigger hab_suficiencia_solo_anular
  before update or delete on hab_suficiencia_patrimonial
  for each row execute function fn_hab_tramite_solo_anular();

alter table hab_suficiencia_patrimonial enable row level security;

-- Lectura con EDIT (no basta VIEW): es información financiera.
create policy "hab_suficiencia_select" on hab_suficiencia_patrimonial
  for select to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_suficiencia_insert" on hab_suficiencia_patrimonial
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_suficiencia_update" on hab_suficiencia_patrimonial
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'VOID')
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 6. Storage: carpeta `financiero` (§1.5)
-- ============================================================
-- La política de lectura de 0061 exige habilitacion/VIEW. Para los archivos
-- financieros se AGREGA una política RESTRICTIVA (se combina con AND con
-- las permisivas) en vez de reescribir la de 0061, que F5/F8 también usan:
-- sin EDIT + plan Pro nadie lista ni firma URLs de <clinica>/financiero/...
-- La condición deja pasar cualquier otro bucket o carpeta sin tocarlos.
create policy "habilitacion_storage_select_financiero" on storage.objects
  as restrictive
  for select
  using (
    bucket_id <> 'habilitacion'
    or (storage.foldername(name))[2] is distinct from 'financiero'
    or (has_permission('habilitacion', 'EDIT') and has_entitlement('habilitacion', 'gestion'))
  );
