-- ============================================================
-- 0070 · Habilitación F9 (alertas) + F10 (tablero y cierre)
-- ============================================================
-- Diseño: docs/habilitacion/diseno-tecnico-habilitacion.md §1.4
-- (hab_autoevaluaciones), §4.4 (alertas) y §5.6 (tablero).
--
-- F9 — lecturas del cron diario (service role, revocadas a usuarios):
--   fn_hab_clinicas_con_gestion()          clínicas con el feature `gestion`
--   fn_hab_destinatarios(clinica)          usuarios activos con VIEW o nivel 1
--   fn_hab_alertas_pendientes(clinica,hoy) ítems con umbral alcanzado y NO
--                                          avisado (idempotencia contra
--                                          hab_alertas_enviadas)
--   fn_hab_conteo_urgentes()               insignia del menú (usuario)
--
-- F10 — cierre de la autoevaluación como foto inmutable:
--   fn_hab_estados_declaracion(sede)       servicio × sede: listo /
--                                          con_incumplimientos / sin_evaluar
--   fn_hab_cerrar_autoevaluacion(...)      única vía de inserción: el conjunto,
--                                          los estados derivados y los
--                                          resúmenes de evidencia se
--                                          calculan AQUÍ (el cliente no
--                                          manda nada de eso)
--   FK hab_autoevaluaciones.ocurrencia_id y la ocurrencia
--   'reps-autoevaluacion' queda presentada con la autoevaluación como prueba.

-- ============================================================
-- 1. Índices del cron (§4.4)
-- ============================================================
create index if not exists idx_hab_documento_versiones_vencimiento
  on hab_documento_versiones(clinica_id, fecha_vencimiento) where fecha_vencimiento is not null;

-- ============================================================
-- 2. Clínicas con gestión (misma regla que has_entitlement, sin sesión)
-- ============================================================
create or replace function fn_hab_clinicas_con_gestion()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from clinicas c
  join modulos m on m.codigo = 'habilitacion'
  join clinica_modulos cm on cm.clinica_id = c.id and cm.modulo_id = m.id and cm.activo
  where c.activo
    and coalesce(
      (select o.incluido from clinica_feature_overrides o
        where o.clinica_id = c.id and o.modulo_id = m.id and o.feature_codigo = 'gestion'
          and (o.expira_at is null or o.expira_at > now())
        order by o.created_at desc limit 1),
      (select pf.incluido from plan_features pf
        where pf.plan_id = c.plan_id and pf.modulo_id = m.id and pf.feature_codigo = 'gestion'),
      false);
$$;

-- ============================================================
-- 3. Destinatarios: usuarios activos con habilitacion/VIEW o nivel 1
-- ============================================================
create or replace function fn_hab_destinatarios(p_clinica_id uuid)
returns table (usuario_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, lower(u.email)
  from usuarios u
  join roles r on r.id = u.rol_id
  where u.clinica_id = p_clinica_id
    and u.activo
    and u.email is not null
    and (r.nivel = 1 or exists (
      select 1
      from rol_modulo_permiso rmp
      join modulos m on m.id = rmp.modulo_id and m.codigo = 'habilitacion'
      join permisos p on p.id = rmp.permiso_id and p.codigo = 'VIEW'
      where rmp.rol_id = u.rol_id and rmp.concedido
    ));
$$;

-- ============================================================
-- 4. Ítems por avisar (§4.4 paso 2)
-- ============================================================
-- Para cada objeto: umbrales = días de aviso (config de la obligación o
-- default del catálogo; fijos para documentos, planes y extintores).
-- Alcanzado = dias_restantes <= t. Por avisar = alcanzados que no están en
-- hab_alertas_enviadas. Si el cron falla un día, al siguiente sale el aviso
-- (el umbral sigue alcanzado y sin registro) y nunca se duplica: el cron
-- registra TODOS los umbrales devueltos de una vez.
--   ocurrencia          pendientes de obligaciones activas y confirmadas
--                       (las "por confirmar" no alertan, AC2 HU-5.1). Incluye
--                       el vencimiento del REPS (90/60/30/15/7/1/0 del
--                       catálogo) y la verificación anual del grupo.
--   documento_version   versión vigente (la última) de un renglón que no
--                       está en "no aplica", con fecha de vencimiento.
--   plan_mejora         abiertos o en curso, contra la fecha compromiso.
--   extintor            activos de sedes con servicios declarados, ≤ 30 días.
create or replace function fn_hab_alertas_pendientes(p_clinica_id uuid, p_hoy date default null)
returns table (
  objeto_tipo text,
  objeto_id uuid,
  umbrales int[],
  fecha date,
  dias int,
  titulo text,
  detalle text,
  ruta text,
  portal_url text,
  dia_no_habil boolean,
  obligacion_id uuid,
  correo_adicional text
)
language sql
stable
security definer
set search_path = public
as $$
  with hoy as (select coalesce(p_hoy, (now() at time zone 'America/Bogota')::date) as d),
  candidatos as (
    select 'ocurrencia'::text as tipo, o.id, o.fecha_limite as fecha,
      coalesce(cfg.dias_aviso, cat.dias_aviso_default) as umbrales,
      cat.nombre as titulo,
      concat_ws(' · ', o.etiqueta_periodo, case cat.entidad
        when 'secretaria_salud' then 'Secretaría de salud'
        when 'supersalud' then 'Supersalud'
        when 'minsalud' then 'Ministerio de Salud'
        when 'ins' then 'INS'
        else null end) as detalle,
      '/habilitacion/calendario' as ruta,
      cat.plataforma_url as portal_url,
      o.dia_no_habil,
      o.obligacion_id,
      cfg.correo_adicional
    from hab_obligacion_ocurrencias o
    join hab_obligaciones_catalogo cat on cat.id = o.obligacion_id
    join hab_obligaciones_clinica cfg on cfg.clinica_id = o.clinica_id and cfg.obligacion_id = o.obligacion_id
    where o.clinica_id = p_clinica_id
      and o.estado = 'pendiente'
      and cfg.activa
      and (cfg.confirmada or not (cat.activacion_default = 'por_confirmar' or cat.requiere_confirmacion_asesor))

    union all
    select 'documento_version', v.id, v.fecha_vencimiento, array[60, 30, 15, 7, 0],
      coalesce(dc.nombre_corto, d.nombre_adicional),
      concat_ws(' · ', s.nombre, 'versión ' || v.version, 'vence'),
      '/habilitacion/documentos', null, false, null, null
    from hab_documentos_clinica d
    left join hab_documentos_catalogo dc on dc.id = d.documento_catalogo_id
    left join sedes s on s.id = d.sede_id
    join lateral (
      select x.* from hab_documento_versiones x
      where x.documento_id = d.id order by x.version desc limit 1
    ) v on true
    where d.clinica_id = p_clinica_id
      and not d.no_aplica
      and v.fecha_vencimiento is not null

    union all
    select 'plan_mejora', pm.id, pm.fecha_compromiso, array[7, 0],
      'Plan de mejora ' || c.codigo,
      concat_ws(' · ', s.nombre, left(pm.accion, 140), 'responsable: ' || u.nombre),
      '/habilitacion/autoevaluacion?sede=' || pm.sede_id, null, false, null, null
    from hab_planes_mejora pm
    join hab_criterios c on c.id = pm.criterio_id
    join sedes s on s.id = pm.sede_id
    left join usuarios u on u.id = pm.responsable_id
    where pm.clinica_id = p_clinica_id and pm.estado <> 'cerrada'

    union all
    select 'extintor', e.id, e.fecha_vencimiento, array[30, 7, 0],
      'Extintor ' || coalesce(te.nombre, ''),
      concat_ws(' · ', s.nombre, e.ubicacion, 'serie ' || e.numero_serie),
      '/medio-ambiente', null, false, null, null
    from extintores e
    join sedes s on s.id = e.sede_id
    left join tipos_extintor te on te.id = e.tipo_extintor_id
    where e.clinica_id = p_clinica_id
      and e.activo
      and exists (
        select 1 from clinica_servicios_habilitados h
        where h.sede_id = e.sede_id and h.clinica_id = e.clinica_id and h.estado <> 'cerrado'
      )
  )
  select k.tipo, k.id, pendientes.u, k.fecha, (k.fecha - hoy.d)::int,
    k.titulo, k.detalle, k.ruta, k.portal_url, k.dia_no_habil, k.obligacion_id, k.correo_adicional
  from candidatos k
  cross join hoy
  cross join lateral (
    select array_agg(t order by t desc) as u
    from unnest(k.umbrales) t
    where (k.fecha - hoy.d) <= t
      and not exists (
        select 1 from hab_alertas_enviadas a
        where a.objeto_tipo = k.tipo and a.objeto_id = k.id and a.umbral_dias = t
      )
  ) pendientes
  where pendientes.u is not null
  order by k.fecha, k.titulo;
$$;

comment on function fn_hab_alertas_pendientes(uuid, date) is
  'Ítems de habilitación con un umbral de aviso alcanzado y no avisado (F9). Solo el cron (service role).';

-- ============================================================
-- 5. Insignia del menú (§4.4 in-app): vencidas + ≤ 7 días + documentos
--    vencidos. RLS del usuario (invoker); todos los planes.
-- ============================================================
create or replace function fn_hab_conteo_urgentes()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d)
  select (
    select count(*)::int
    from hab_obligacion_ocurrencias o
    join hab_obligaciones_catalogo cat on cat.id = o.obligacion_id
    join hab_obligaciones_clinica cfg on cfg.clinica_id = o.clinica_id and cfg.obligacion_id = o.obligacion_id
    cross join hoy
    where o.clinica_id = clinica_actual()
      and o.estado = 'pendiente'
      and o.fecha_limite <= hoy.d + 7
      and cfg.activa
      and (cfg.confirmada or not (cat.activacion_default = 'por_confirmar' or cat.requiere_confirmacion_asesor))
  ) + (
    select count(*)::int
    from hab_documentos_clinica d
    cross join hoy
    join lateral (
      select x.fecha_vencimiento from hab_documento_versiones x
      where x.documento_id = d.id order by x.version desc limit 1
    ) v on true
    where d.clinica_id = clinica_actual()
      and not d.no_aplica
      and v.fecha_vencimiento < hoy.d
  );
$$;

-- ============================================================
-- 6. Estado de declaración por servicio × sede (§5.6, HU-4.6)
-- ============================================================
-- La norma no admite cumplimiento parcial: un solo "No cumple" deja el
-- servicio sin poder declararse aunque tenga 98 %. Criterios que cuentan
-- para el servicio S de una sede: los evaluables de S, los de 11.1 de la
-- sede (transversales, aplican a todos) y los que S exige por remisión.
-- Estado: con_incumplimientos (≥ 1 No cumple) > sin_evaluar (≥ 1
-- pendiente) > listo.
create or replace function fn_hab_estados_declaracion(p_sede_id uuid default null)
returns table (
  sede_id uuid,
  sede_nombre text,
  servicio_norma_id uuid,
  servicio_clave text,
  servicio_nombre text,
  servicio_orden int,
  evaluables int,
  cumple int,
  no_cumple int,
  no_aplica int,
  pendientes int,
  estado text
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive apl as (
    select a.sede_id, a.criterio_id, a.servicio_norma_id, rd.servicio_norma_id as remite_servicio,
      sn.clave = '11.1' as transversal,
      coalesce(v.estado, 'pendiente') as estado
    from fn_hab_criterios_aplicables(p_sede_id, (now() at time zone 'America/Bogota')::date) a
    join hab_servicios_norma sn on sn.id = a.servicio_norma_id
    left join hab_criterios rd on rd.id = a.remitido_desde_criterio_id
    left join lateral (
      select x.estado from hab_evaluaciones x
      where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id
      order by x.created_at desc, x.id desc limit 1
    ) v on true
    where not a.es_encabezado and not a.autorresuelto
  ),
  declarados as (
    select distinct h.sede_id, h.servicio_norma_id
    from clinica_servicios_habilitados h
    join sedes s on s.id = h.sede_id
    where h.clinica_id = clinica_actual()
      and h.servicio_norma_id is not null
      and h.complejidad is not null
      and h.estado <> 'cerrado'
      and (case when p_sede_id is null then s.activo else s.id = p_sede_id end)
  )
  select d.sede_id, s.nombre, d.servicio_norma_id, sn.clave, sn.nombre, sn.orden,
    count(a.criterio_id)::int,
    count(*) filter (where a.estado = 'cumple')::int,
    count(*) filter (where a.estado = 'no_cumple')::int,
    count(*) filter (where a.estado = 'no_aplica')::int,
    count(*) filter (where a.estado = 'pendiente')::int,
    case
      when count(*) filter (where a.estado = 'no_cumple') > 0 then 'con_incumplimientos'
      when count(*) filter (where a.estado = 'pendiente') > 0 or count(a.criterio_id) = 0 then 'sin_evaluar'
      else 'listo'
    end
  from declarados d
  join sedes s on s.id = d.sede_id
  join hab_servicios_norma sn on sn.id = d.servicio_norma_id
  left join apl a on a.sede_id = d.sede_id
    and (a.servicio_norma_id = d.servicio_norma_id or a.transversal or a.remite_servicio = d.servicio_norma_id)
  group by d.sede_id, s.nombre, s.orden, d.servicio_norma_id, sn.clave, sn.nombre, sn.orden
  order by s.orden, s.nombre, sn.orden;
$$;

comment on function fn_hab_estados_declaracion(uuid) is
  'Estado de declaración de cada servicio declarado por sede: listo / con_incumplimientos / sin_evaluar (cuenta sus criterios, los de 11.1 de la sede y los exigidos por remisión).';

-- ============================================================
-- 7. Ocurrencia REPS presentada con la autoevaluación como prueba
-- ============================================================
alter table hab_autoevaluaciones
  add constraint hab_autoevaluaciones_ocurrencia_fk
  foreign key (ocurrencia_id) references hab_obligacion_ocurrencias(id);

alter table hab_obligacion_ocurrencias
  add column autoevaluacion_id uuid references hab_autoevaluaciones(id);

alter table hab_obligacion_ocurrencias drop constraint hab_ocurrencia_presentada_con_prueba;
alter table hab_obligacion_ocurrencias add constraint hab_ocurrencia_presentada_con_prueba
  check (estado <> 'presentado'
    or (fecha_presentacion is not null and (radicado is not null or storage_path is not null or autoevaluacion_id is not null)));

-- La autoevaluación solo sirve de prueba de SU ocurrencia (la que la
-- cabecera ya apunta, en la misma clínica): nadie marca otra obligación
-- como presentada citando una autoevaluación.
create or replace function fn_hab_ocurrencia_autoevaluacion_valida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.autoevaluacion_id is not distinct from old.autoevaluacion_id then
    return new;
  end if;
  if new.autoevaluacion_id is not null and not exists (
    select 1 from hab_autoevaluaciones a
    where a.id = new.autoevaluacion_id and a.clinica_id = new.clinica_id
      and a.ocurrencia_id = new.id and not a.anulado
  ) then
    raise exception 'La autoevaluación no corresponde a esta obligación.';
  end if;
  if tg_op = 'UPDATE' and old.estado <> 'pendiente' then
    raise exception 'Una obligación presentada no se edita: anúlala y regístrala de nuevo.';
  end if;
  return new;
end;
$$;

create trigger hab_obligacion_ocurrencias_autoevaluacion
  before insert or update of autoevaluacion_id on hab_obligacion_ocurrencias
  for each row execute function fn_hab_ocurrencia_autoevaluacion_valida();

-- ============================================================
-- 8. Cierre de la autoevaluación (HU-4.6)
-- ============================================================
drop policy "hab_autoevaluaciones_insert" on hab_autoevaluaciones;
drop policy "hab_autoevaluacion_detalle_insert" on hab_autoevaluacion_detalle;

-- security definer y SIN políticas de insert en las dos tablas: la foto
-- solo nace aquí (con políticas de insert, quien tiene APPROVE podría
-- insertar por PostgREST una cabecera con un resumen fabricado o filas de
-- detalle sueltas). Exige explícitamente habilitacion/APPROVE + gestión;
-- todo se filtra por clinica_actual() (auth.uid() sigue siendo el de
-- quien llama). Todo lo que queda en la foto lo calcula la BD: conjunto (motor §1.6), estado vigente de cada criterio, estado
-- DERIVADO de encabezados ("Cuenta con:", agregado de sus descendientes) y
-- autorresueltos (agregado de 11.1 del mismo estándar en la sede, HU-4.2
-- AC6), y la evidencia con el resumen vivo de su proveedora (§6) en ese
-- momento. Agregado: un No cumple → No cumple; algo pendiente → Pendiente;
-- todo No aplica → No aplica; si no, Cumple (= agregarEstados en TS).
--
-- Servicios no aptos: si hay alguno, el cierre exige p_confirmo_no_aptos
-- (el usuario vio la lista). Si quien cierra puede editar obligaciones, la
-- ocurrencia pendiente más próxima de 'reps-autoevaluacion' queda
-- presentada hoy con esta autoevaluación como prueba.
create or replace function fn_hab_cerrar_autoevaluacion(
  p_nombre text,
  p_motivo text,
  p_confirmo_no_aptos boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_id uuid := gen_random_uuid();
  v_norma uuid;
  v_no_aptos jsonb;
  v_servicios jsonb;
  v_ocurrencia uuid;
  v_detalle jsonb;
  v_resumen jsonb;
begin
  if v_clinica is null or not has_permission('habilitacion', 'APPROVE') then
    raise exception 'No tienes permiso para cerrar la autoevaluación.';
  end if;
  if not has_entitlement('habilitacion', 'gestion') then
    raise exception 'Cerrar la autoevaluación es parte del plan Pro.';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) not between 3 and 200 then
    raise exception 'Ponle un nombre a la autoevaluación (3 a 200 caracteres).';
  end if;

  select id into v_norma from hab_normas where vigente_hasta is null;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'sede_id', e.sede_id, 'sede', e.sede_nombre, 'servicio_clave', e.servicio_clave,
      'servicio', e.servicio_nombre, 'evaluables', e.evaluables, 'cumple', e.cumple,
      'no_cumple', e.no_cumple, 'no_aplica', e.no_aplica, 'pendientes', e.pendientes, 'estado', e.estado
    )), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'sede_id', e.sede_id, 'sede', e.sede_nombre, 'servicio_clave', e.servicio_clave,
      'servicio', e.servicio_nombre, 'no_cumple', e.no_cumple
    )) filter (where e.estado = 'con_incumplimientos'), '[]'::jsonb)
  into v_servicios, v_no_aptos
  from fn_hab_estados_declaracion(null) e;

  if jsonb_array_length(v_servicios) = 0 then
    raise exception 'No hay servicios declarados con criterios para cerrar.';
  end if;
  if jsonb_array_length(v_no_aptos) > 0 and not coalesce(p_confirmo_no_aptos, false) then
    raise exception 'SERVICIOS_NO_APTOS: % servicio(s) tienen criterios que no cumples y no se pueden declarar. Confirma que lo sabes para cerrar.', jsonb_array_length(v_no_aptos);
  end if;

  if has_permission('habilitacion', 'EDIT') then
    select o.id into v_ocurrencia
    from hab_obligacion_ocurrencias o
    join hab_obligaciones_catalogo c on c.id = o.obligacion_id and c.codigo = 'reps-autoevaluacion'
    where o.clinica_id = v_clinica and o.estado = 'pendiente'
    order by o.fecha_limite
    limit 1;
  end if;

  -- El detalle se calcula UNA vez como jsonb: de ahí sale el resumen de
  -- la cabecera (inmutable desde que nace) y luego las filas del detalle.
  with recursive apl as (
    select a.sede_id, a.criterio_id, a.padre_id, a.estandar_codigo, a.origen,
      a.remitido_desde_criterio_id, a.es_encabezado, a.autorresuelto,
      sn.clave as servicio_clave
    from fn_hab_criterios_aplicables(null, v_hoy) a
    join hab_servicios_norma sn on sn.id = a.servicio_norma_id
  ),
  vig as (
    select a.*, v.id as evaluacion_id, v.estado as estado_directo, v.justificacion, v.evaluado_por, v.fecha_verificacion
    from apl a
    left join lateral (
      select x.id, x.estado, x.justificacion, x.evaluado_por, x.fecha_verificacion
      from hab_evaluaciones x
      where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id
      order by x.created_at desc, x.id desc limit 1
    ) v on true
  ),
  agg111 as (
    select sede_id, estandar_codigo,
      case
        when bool_or(coalesce(estado_directo, 'pendiente') = 'no_cumple') then 'no_cumple'
        when bool_or(coalesce(estado_directo, 'pendiente') = 'pendiente') then 'pendiente'
        when bool_and(estado_directo = 'no_aplica') then 'no_aplica'
        else 'cumple'
      end as estado
    from vig
    where servicio_clave = '11.1' and not es_encabezado and not autorresuelto
    group by sede_id, estandar_codigo
  ),
  hojas as (
    select g.sede_id, g.criterio_id,
      case
        when g.autorresuelto then coalesce(a11.estado, 'pendiente')
        else coalesce(g.estado_directo, 'pendiente')
      end as estado
    from vig g
    left join agg111 a11 on a11.sede_id = g.sede_id and a11.estandar_codigo = g.estandar_codigo
    where not g.es_encabezado
  ),
  -- Descendientes de cada encabezado dentro de lo aplicable de la sede.
  arbol (sede_id, raiz, criterio_id) as (
    select g.sede_id, g.criterio_id, g.criterio_id from vig g where g.es_encabezado
    union all
    select ar.sede_id, ar.raiz, h.criterio_id
    from arbol ar
    join apl h on h.sede_id = ar.sede_id and h.padre_id = ar.criterio_id
  ),
  encabezados as (
    select ar.sede_id, ar.raiz as criterio_id,
      case
        when count(h.criterio_id) = 0 then 'pendiente'
        when bool_or(h.estado = 'no_cumple') then 'no_cumple'
        when bool_or(h.estado = 'pendiente') then 'pendiente'
        when bool_and(h.estado = 'no_aplica') then 'no_aplica'
        else 'cumple'
      end as estado
    from arbol ar
    left join hojas h on h.sede_id = ar.sede_id and h.criterio_id = ar.criterio_id and ar.criterio_id <> ar.raiz
    group by ar.sede_id, ar.raiz
  ),
  estados as (
    select * from hojas union all select * from encabezados
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sede_id', g.sede_id,
    'criterio_id', g.criterio_id,
    'sede_nombre', s.nombre,
    'servicio_clave', g.servicio_clave,
    'estandar_codigo', g.estandar_codigo,
    'criterio_codigo', c.codigo,
    'texto_literal', c.texto_literal,
    'estado', est.estado,
    'origen', case
      when g.es_encabezado then 'encabezado'
      when g.autorresuelto then 'autorresuelto'
      when g.origen in ('directo', 'transversal', 'remision') then g.origen
      else 'directo'
    end,
    'remitido_desde_codigo', rd.codigo,
    'justificacion', case when g.es_encabezado or g.autorresuelto then null else g.justificacion end,
    'evaluacion_id', case when g.es_encabezado or g.autorresuelto then null else g.evaluacion_id end,
    'evaluado_por', case when g.es_encabezado or g.autorresuelto then null else g.evaluado_por end,
    'fecha_verificacion', case when g.es_encabezado or g.autorresuelto then null else g.fecha_verificacion end,
    'evidencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', e.tipo,
        'descripcion', e.descripcion,
        'nombre_archivo', e.nombre_archivo,
        'storage_path', e.storage_path,
        'sha256', e.sha256,
        'url', e.url,
        'fuente', e.fuente_codigo,
        'resumen', case when e.tipo = 'registro_modulo'
          then fn_hab_resumen_evidencia(e.fuente_codigo, e.sede_id, e.fuente_parametros) end,
        'protocolo', case when e.tipo = 'documento_normativo' then (
          select jsonb_build_object('nombre', p.nombre, 'version', p.version,
            'nombre_archivo', p.nombre_archivo, 'storage_path', p.storage_path, 'vigente_desde', p.vigente_desde)
          from hab_protocolos_vigentes p
          where p.clinica_id = e.clinica_id and p.tipo_documento_id = e.tipo_documento_normativo_id
        ) end,
        'creada_en', e.created_at
      ) order by e.created_at)
      from hab_evidencias e
      where e.sede_id = g.sede_id and e.criterio_id = g.criterio_id and e.retirada_en is null
    ), '[]'::jsonb),
    'evaluable', not g.es_encabezado and not g.autorresuelto
  )), '[]'::jsonb)
  into v_detalle
  from vig g
  join estados est on est.sede_id = g.sede_id and est.criterio_id = g.criterio_id
  join hab_criterios c on c.id = g.criterio_id
  join sedes s on s.id = g.sede_id
  left join hab_criterios rd on rd.id = g.remitido_desde_criterio_id;

  if jsonb_array_length(v_detalle) = 0 then
    raise exception 'No hay criterios aplicables para cerrar.';
  end if;

  -- Resumen congelado para el historial (sin recalcular): totales de los
  -- evaluables por estado, por estándar y por sede, más el estado de
  -- declaración de cada servicio.
  with d as (
    select x.sede_id, x.sede_nombre, x.estandar_codigo, x.estado
    from jsonb_to_recordset(v_detalle) as x(sede_id uuid, sede_nombre text, estandar_codigo text, estado text, evaluable boolean)
    where x.evaluable
  ),
  tot as (
    select jsonb_build_object(
      'evaluables', count(*), 'cumple', count(*) filter (where estado = 'cumple'),
      'no_cumple', count(*) filter (where estado = 'no_cumple'), 'no_aplica', count(*) filter (where estado = 'no_aplica'),
      'pendientes', count(*) filter (where estado = 'pendiente')) as j
    from d
  ),
  por_est as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'estandar_codigo', estandar_codigo, 'cumple', cumple, 'no_cumple', no_cumple,
      'no_aplica', no_aplica, 'pendientes', pendientes) order by orden), '[]'::jsonb) as j
    from (
      select d.estandar_codigo, e.orden,
        count(*) filter (where d.estado = 'cumple') as cumple,
        count(*) filter (where d.estado = 'no_cumple') as no_cumple,
        count(*) filter (where d.estado = 'no_aplica') as no_aplica,
        count(*) filter (where d.estado = 'pendiente') as pendientes
      from d join hab_estandares e on e.codigo = d.estandar_codigo
      group by d.estandar_codigo, e.orden
    ) q
  ),
  por_sede as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'sede_id', sede_id, 'sede', sede_nombre, 'cumple', cumple, 'no_cumple', no_cumple,
      'no_aplica', no_aplica, 'pendientes', pendientes) order by sede_nombre), '[]'::jsonb) as j
    from (
      select sede_id, sede_nombre,
        count(*) filter (where estado = 'cumple') as cumple,
        count(*) filter (where estado = 'no_cumple') as no_cumple,
        count(*) filter (where estado = 'no_aplica') as no_aplica,
        count(*) filter (where estado = 'pendiente') as pendientes
      from d group by sede_id, sede_nombre
    ) q
  )
  select jsonb_build_object('totales', tot.j, 'estandares', por_est.j, 'sedes', por_sede.j,
    'servicios', v_servicios, 'criterios', jsonb_array_length(v_detalle), 'fecha', v_hoy)
  into v_resumen
  from tot, por_est, por_sede;

  insert into hab_autoevaluaciones (
    id, clinica_id, nombre, motivo, norma_id, cerrado_por, confirmo_servicios_no_aptos,
    servicios_no_aptos, resumen, ocurrencia_id
  ) values (
    v_id, v_clinica, btrim(p_nombre), p_motivo, v_norma, auth.uid(),
    jsonb_array_length(v_no_aptos) > 0 and coalesce(p_confirmo_no_aptos, false),
    v_no_aptos, v_resumen, v_ocurrencia
  );

  insert into hab_autoevaluacion_detalle (
    autoevaluacion_id, clinica_id, sede_id, criterio_id, sede_nombre, servicio_clave, estandar_codigo,
    criterio_codigo, texto_literal, estado, origen, remitido_desde_codigo, justificacion, evaluacion_id,
    evaluado_por, fecha_verificacion, evidencias
  )
  select v_id, v_clinica, x.sede_id, x.criterio_id, x.sede_nombre, x.servicio_clave, x.estandar_codigo,
    x.criterio_codigo, x.texto_literal, x.estado, x.origen, x.remitido_desde_codigo, x.justificacion,
    x.evaluacion_id, x.evaluado_por, x.fecha_verificacion, x.evidencias
  from jsonb_to_recordset(v_detalle) as x(
    sede_id uuid, criterio_id uuid, sede_nombre text, servicio_clave text, estandar_codigo text,
    criterio_codigo text, texto_literal text, estado text, origen text, remitido_desde_codigo text,
    justificacion text, evaluacion_id uuid, evaluado_por uuid, fecha_verificacion date, evidencias jsonb
  );

  if v_ocurrencia is not null then
    update hab_obligacion_ocurrencias
    set estado = 'presentado',
        fecha_presentacion = v_hoy,
        autoevaluacion_id = v_id,
        observacion = 'Autoevaluación «' || btrim(p_nombre) || '» cerrada en EWAH. Declárala en el REPS y registra la fecha en el historial.'
    where id = v_ocurrencia;
  end if;

  return v_id;
end;
$$;

comment on function fn_hab_cerrar_autoevaluacion(text, text, boolean) is
  'Cierra la autoevaluación como foto inmutable (HU-4.6). Todo se calcula en la BD; exige APPROVE + gestión y confirmar los servicios no aptos.';

-- ============================================================
-- 9. Privilegios
-- ============================================================
revoke execute on function fn_hab_clinicas_con_gestion() from public, anon, authenticated;
revoke execute on function fn_hab_destinatarios(uuid) from public, anon, authenticated;
revoke execute on function fn_hab_alertas_pendientes(uuid, date) from public, anon, authenticated;
grant execute on function fn_hab_clinicas_con_gestion() to service_role;
grant execute on function fn_hab_destinatarios(uuid) to service_role;
grant execute on function fn_hab_alertas_pendientes(uuid, date) to service_role;

revoke execute on function fn_hab_conteo_urgentes() from public, anon;
revoke execute on function fn_hab_estados_declaracion(uuid) from public, anon;
revoke execute on function fn_hab_cerrar_autoevaluacion(text, text, boolean) from public, anon;
grant execute on function fn_hab_conteo_urgentes() to authenticated;
grant execute on function fn_hab_estados_declaracion(uuid) to authenticated;
grant execute on function fn_hab_cerrar_autoevaluacion(text, text, boolean) to authenticated;
revoke execute on function fn_hab_ocurrencia_autoevaluacion_valida() from public, anon, authenticated;
