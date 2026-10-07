-- ============================================================
-- 0086 · Habilitación: correcciones de la revisión (bugs verificados)
-- ============================================================
-- Todo con `create or replace` / alter sobre lo ya aplicado (0061–0084 no
-- se tocan). Cada función se copió de su última definición y se cambió solo
-- lo indicado. SIN EJECUTAR contra PostgreSQL al escribirla (no había motor
-- local): revisar con scripts/habilitacion/bd-local/probar.sh.
--
--   1  Las obligaciones pendientes VENCIDAS ya no se borran al regenerar.
--   2  La alerta lleva la fecha objetivo en su llave de idempotencia: el
--      extintor recargado (misma fila, otra fecha) vuelve a avisar.
--   4  El resumen de talento humano ya no devuelve nombres a quien no tiene
--      rrhh/VIEW; el cierre nunca los copia a la foto inmutable.
--   5  El cierre trata también los servicios "sin_evaluar" como no aptos.
--   6  "Hoy" en hora de Colombia (fn_hab_hoy) en aplicabilidad, tablero y
--      progreso (antes current_date = UTC).
--   7a presentado_por / presentado_en no los dicta el cliente al insertar.
--   7b registrar un radicado sin EDIT falla claro (antes: 0 filas en silencio).
--   7g fn_hab_sumar_dias_habiles usa el país de la clínica.


-- ============================================================
-- 1. Generador de ocurrencias: las vencidas se quedan
-- ============================================================
-- Antes: el DELETE alcanzaba pendientes de sistema con fecha_limite entre
-- hoy-400 y hoy que no estuvieran en el conjunto deseado. Con estado_reps
-- 'no_inscrito'/'en_tramite' la ventana deseada arranca en hoy, así que la
-- obligación de ayer (sin reportar) se borraba y nunca figuraba como vencida.
-- Ahora solo se borran las pendientes FUTURAS que ya no corresponden (p. ej.
-- cambio de grupo D2 → C1); las de fecha anterior a hoy siguen pendientes y
-- vencidas hasta que alguien las presente o las marque "no aplica".
-- security definer: igual que en 0069 (lo llaman triggers y el cron).
create or replace function fn_hab_generar_ocurrencias(p_clinica_id uuid, p_hoy date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Bogota')::date);
begin
  if not exists (select 1 from clinicas where id = p_clinica_id) then
    return;  -- clínica borrándose (cascada): nada que generar
  end if;

  -- El conjunto deseado se evalúa dos veces (borrar / insertar): son
  -- decenas de filas y así no hace falta una tabla temporal.
  delete from hab_obligacion_ocurrencias o
  where o.clinica_id = p_clinica_id
    and o.estado = 'pendiente'
    and o.generada_por = 'sistema'
    and o.origen in ('calendario', 'vencimiento_reps', 'grupo_supersalud')
    and o.fecha_limite >= v_hoy  -- las anteriores a hoy NO se borran: siguen vencidas
    and not exists (
      select 1 from fn_hab_ocurrencias_deseadas(p_clinica_id, v_hoy) d
      where d.obligacion_id = o.obligacion_id
        and d.clave_periodo = o.clave_periodo
        and d.fecha_limite = o.fecha_limite
    );

  insert into hab_obligacion_ocurrencias
    (clinica_id, obligacion_id, origen, clave_periodo, periodo_corte, etiqueta_periodo, fecha_limite, generada_por)
  select p_clinica_id, d.obligacion_id, d.origen, d.clave_periodo, d.periodo_corte, d.etiqueta_periodo, d.fecha_limite, 'sistema'
  from fn_hab_ocurrencias_deseadas(p_clinica_id, v_hoy) d
  on conflict (clinica_id, obligacion_id, clave_periodo) where (estado <> 'anulado') do nothing;
end;
$$;

-- ============================================================
-- 2. Alertas: la fecha objetivo forma parte de la llave de idempotencia
-- ============================================================
-- hab_alertas_enviadas era única por (objeto_tipo, objeto_id, umbral_dias).
-- El extintor recargado conserva la fila y solo mueve fecha_vencimiento: tras
-- el primer ciclo ya no se avisaba nunca más. Lo mismo pasa con la fecha
-- compromiso de un plan de mejora. Se añade fecha_objetivo (la fecha contra
-- la que se avisó) y la unicidad la incluye.
alter table hab_alertas_enviadas add column if not exists fecha_objetivo date;

-- Relleno de lo ya enviado: si el aviso se mandó cuando la fecha ACTUAL del
-- objeto ya estaba dentro del umbral, se le asigna esa fecha (así el
-- despliegue no repite avisos vigentes); si no, pertenece a un ciclo
-- anterior y queda con su fecha de envío (no coincide con nada actual).
update hab_alertas_enviadas a
set fecha_objetivo = x.fecha
from (
  select 'ocurrencia'::text as tipo, id, fecha_limite as fecha from hab_obligacion_ocurrencias
  union all select 'documento_version', id, fecha_vencimiento from hab_documento_versiones
  union all select 'plan_mejora', id, fecha_compromiso from hab_planes_mejora
  union all select 'extintor', id, fecha_vencimiento from extintores
) x
where a.fecha_objetivo is null
  and a.objeto_tipo = x.tipo and a.objeto_id = x.id
  and x.fecha is not null
  and (x.fecha - (a.enviado_en at time zone 'America/Bogota')::date) <= a.umbral_dias;

update hab_alertas_enviadas
set fecha_objetivo = (enviado_en at time zone 'America/Bogota')::date
where fecha_objetivo is null;

alter table hab_alertas_enviadas alter column fecha_objetivo set not null;

-- La unicidad anterior no tiene nombre fijo garantizado: se busca y se quita.
do $$
declare
  v_nombre text;
begin
  for v_nombre in
    select conname from pg_constraint
    where conrelid = 'public.hab_alertas_enviadas'::regclass and contype = 'u'
  loop
    execute format('alter table hab_alertas_enviadas drop constraint %I', v_nombre);
  end loop;
end;
$$;

alter table hab_alertas_enviadas
  add constraint hab_alertas_enviadas_objeto_umbral_fecha_key
  unique (objeto_tipo, objeto_id, umbral_dias, fecha_objetivo);

-- fn_hab_alertas_pendientes: el NOT EXISTS compara también la fecha. Las
-- columnas de salida no cambian (la fecha del ítem ya es `fecha`).
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
          and a.fecha_objetivo = k.fecha
      )
  ) pendientes
  where pendientes.u is not null
  order by k.fecha, k.titulo;
$$;

comment on function fn_hab_alertas_pendientes(uuid, date) is
  'Ítems de habilitación con un umbral de aviso alcanzado y no avisado para su fecha objetivo actual (F9, 0086). Solo el cron (service role).';

-- ============================================================
-- 4. Talento humano: nombres solo con rrhh/VIEW
-- ============================================================
-- fn_hab_resumen_evidencia solo exige habilitacion/VIEW + gestión, pero las
-- filas por persona (nombre, título, tarjeta, vacunas) son datos de RRHH.
-- Ahora el resumen devuelve SIEMPRE los conteos agregados y las filas solo si
-- quien llama también tiene rrhh/VIEW (has_permission usa la sesión aunque
-- esta función sea definer). El cierre (más abajo) descarta 'filas' siempre.
-- NOTA: lo ya copiado a cierres pasados es inmutable y no se limpia aquí.
create or replace function fn_hab_ev_rrhh_talento_humano(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with personas as (
    select
      e.nombre,
      exists (select 1 from documentos_empleado d where d.empleado_id = e.id and d.tipo = 'acta_diploma') as titulo,
      (nullif(btrim(e.numero_tarjeta_profesional), '') is not null
        or exists (select 1 from documentos_empleado d where d.empleado_id = e.id and d.tipo = 'tarjeta_profesional')) as tarjeta,
      case
        when exists (select 1 from documentos_empleado d where d.empleado_id = e.id and d.tipo = 'vacuna'
                       and (d.fecha_vencimiento is null or d.fecha_vencimiento >= fn_hab_hoy())) then 'vigente'
        when exists (select 1 from documentos_empleado d where d.empleado_id = e.id and d.tipo = 'vacuna') then 'vencida'
        else 'falta'
      end as vacunas
    from empleados e
    where e.clinica_id = p_clinica_id and e.activo
  ),
  c as (
    select count(*)::int as total,
      count(*) filter (where titulo)::int as con_titulo,
      count(*) filter (where tarjeta)::int as con_tarjeta,
      count(*) filter (where vacunas = 'vigente')::int as vacunas_vigentes,
      count(*) filter (where vacunas = 'vencida')::int as vacunas_vencidas
    from personas
  )
  select jsonb_build_object(
    'estado', case when c.total = 0 then 'falta'
                   when c.con_titulo < c.total or c.con_tarjeta < c.total or c.vacunas_vencidas > 0 then 'alerta'
                   else 'ok' end,
    'titulo', 'Talento humano en RRHH',
    'detalle', case when c.total = 0 then 'No hay empleados activos registrados en RRHH.'
      else format('%s persona(s): %s con título, %s con tarjeta profesional o ReTHUS, %s con vacunas vigentes. Revisa solo a quienes prestan servicios de salud.',
        c.total, c.con_titulo, c.con_tarjeta, c.vacunas_vigentes) end,
    'conteos', to_jsonb(c),
    'sugerencia', null,
    'enlace', '/rrhh',
    'filas_visibles', has_permission('rrhh', 'VIEW'),
    'filas', case when has_permission('rrhh', 'VIEW') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', p.nombre,
        'titulo', case when p.titulo then 'ok' else 'falta' end,
        'tarjeta', case when p.tarjeta then 'ok' else 'falta' end,
        'vacunas', p.vacunas) order by p.nombre)
      from (select * from personas order by nombre limit 100) p
    ), '[]'::jsonb) else '[]'::jsonb end,
    'calculado_en', now()
  ) from c;
$$;

-- ============================================================
-- 5. Cierre de la autoevaluación: pendientes también piden confirmación
-- ============================================================
-- HU-4.6 AC2: "No cumple O pendientes" avisa y exige confirmación explícita.
-- v_no_aptos incluye los servicios 'sin_evaluar' (con 'estado' y
-- 'pendientes' en cada elemento para que la UI y el historial los
-- distingan). Además la foto del detalle descarta 'filas' del resumen de
-- evidencia (datos por persona de RRHH: nunca a una tabla inmutable).
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
      'servicio', e.servicio_nombre, 'no_cumple', e.no_cumple,
      'pendientes', e.pendientes, 'estado', e.estado
    )) filter (where e.estado in ('con_incumplimientos', 'sin_evaluar')), '[]'::jsonb)
  into v_servicios, v_no_aptos
  from fn_hab_estados_declaracion(null) e;

  if jsonb_array_length(v_servicios) = 0 then
    raise exception 'No hay servicios declarados con criterios para cerrar.';
  end if;
  if jsonb_array_length(v_no_aptos) > 0 and not coalesce(p_confirmo_no_aptos, false) then
    raise exception 'SERVICIOS_NO_APTOS: % servicio(s) tienen criterios que no cumples o sin evaluar y no se pueden declarar. Confirma que lo sabes para cerrar.', jsonb_array_length(v_no_aptos);
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
          then fn_hab_resumen_evidencia(e.fuente_codigo, e.sede_id, e.fuente_parametros) - 'filas' - 'filas_visibles' end,
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

-- ============================================================
-- 6. Fecha de hoy en hora de Colombia
-- ============================================================
-- Antes current_date (UTC): de 7 p. m. a medianoche en Colombia ya es
-- "mañana" y el motor evaluaba la norma con un día de adelanto.
create or replace function fn_hab_criterio_aplica(p_sede_id uuid, p_criterio_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from fn_hab_criterios_aplicables(p_sede_id, fn_hab_hoy()) a
    where a.criterio_id = p_criterio_id
  );
$$;

create or replace function fn_hab_tablero_criterios(p_sede_id uuid, p_estandar text default null)
returns table (
  sede_id uuid,
  criterio_id uuid,
  codigo text,
  numero text,
  nivel smallint,
  padre_id uuid,
  orden int,
  texto_literal text,
  pagina int,
  confianza text,
  motivo_confianza_baja text,
  nota_vigencia text,
  vigente_hasta date,
  es_encabezado boolean,
  autorresuelto boolean,
  origen text,
  remitido_desde_criterio_id uuid,
  remitido_desde_codigo text,
  en_cierre_temporal boolean,
  servicio_norma_id uuid,
  servicio_clave text,
  servicio_nombre text,
  servicio_orden int,
  estandar_codigo text,
  estandar_sigla text,
  estandar_nombre text,
  estandar_orden int,
  bloque_id uuid,
  bloque_encabezado text,
  bloque_subtitulo text,
  evaluacion_id uuid,
  estado text,
  justificacion text,
  observacion text,
  fecha_verificacion date,
  evaluado_por uuid,
  evaluado_en timestamptz,
  responsable_id uuid,
  fecha_objetivo date,
  evidencias_activas int,
  reverificar boolean,
  planes_abiertos int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.sede_id, c.id, c.codigo, c.numero, c.nivel, c.padre_id, c.orden, c.texto_literal, c.pagina,
    c.confianza, c.motivo_confianza_baja, c.nota_vigencia, c.vigente_hasta,
    a.es_encabezado, a.autorresuelto, a.origen, a.remitido_desde_criterio_id, rd.codigo,
    a.en_cierre_temporal,
    sn.id, sn.clave, sn.nombre, sn.orden,
    e.codigo, e.sigla, e.nombre, e.orden,
    b.id, b.encabezado_literal, b.subtitulo,
    v.id, v.estado, v.justificacion, v.observacion, v.fecha_verificacion, v.evaluado_por, v.created_at,
    asg.responsable_id, asg.fecha_objetivo,
    coalesce(ev.n, 0),
    -- HU-4.4 AC2: > 12 meses desde la última verificación (la
    -- autoevaluación es anual, art. 10). Se calcula, no se guarda.
    coalesce(v.estado in ('cumple', 'no_cumple', 'no_aplica')
      and v.fecha_verificacion <= ((now() at time zone 'America/Bogota')::date - interval '12 months')::date, false),
    coalesce(pm.n, 0)
  from fn_hab_criterios_aplicables(p_sede_id, fn_hab_hoy()) a
  join hab_criterios c on c.id = a.criterio_id
  join hab_servicios_norma sn on sn.id = c.servicio_norma_id
  join hab_estandares e on e.codigo = c.estandar_codigo
  join hab_bloques b on b.id = c.bloque_id
  left join hab_criterios rd on rd.id = a.remitido_desde_criterio_id
  left join lateral (
    select x.id, x.estado, x.justificacion, x.observacion, x.fecha_verificacion, x.evaluado_por, x.created_at
    from hab_evaluaciones x
    where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id
    order by x.created_at desc, x.id desc
    limit 1
  ) v on true
  left join hab_criterio_asignaciones asg
    on asg.sede_id = a.sede_id and asg.criterio_id = a.criterio_id and asg.clinica_id = clinica_actual()
  left join lateral (
    select count(*)::int as n
    from hab_evidencias x
    where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id and x.retirada_en is null
  ) ev on true
  left join lateral (
    select count(*)::int as n
    from hab_planes_mejora x
    where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id and x.estado <> 'cerrada'
  ) pm on true
  where p_sede_id is not null
    and (p_estandar is null or c.estandar_codigo = p_estandar)
  order by sn.orden, e.orden, c.orden;
$$;

create or replace function fn_hab_progreso_autoevaluacion(p_sede_id uuid default null)
returns table (
  sede_id uuid,
  servicio_norma_id uuid,
  servicio_clave text,
  estandar_codigo text,
  total int,
  encabezados int,
  autorresueltos int,
  evaluables int,
  cumple int,
  no_cumple int,
  no_aplica int,
  sin_evaluar int,
  reverificar int,
  asignados_a_mi int,
  planes_abiertos int
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      a.sede_id, a.servicio_norma_id, a.estandar_codigo,
      a.es_encabezado,
      a.autorresuelto and not a.es_encabezado as auto,
      not a.es_encabezado and not a.autorresuelto as evaluable,
      v.estado, v.fecha_verificacion,
      asg.responsable_id,
      exists (
        select 1 from hab_planes_mejora pm
        where pm.sede_id = a.sede_id and pm.criterio_id = a.criterio_id and pm.estado <> 'cerrada'
      ) as con_plan
    from fn_hab_criterios_aplicables(p_sede_id, fn_hab_hoy()) a
    left join lateral (
      select x.estado, x.fecha_verificacion
      from hab_evaluaciones x
      where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id
      order by x.created_at desc, x.id desc
      limit 1
    ) v on true
    left join hab_criterio_asignaciones asg
      on asg.sede_id = a.sede_id and asg.criterio_id = a.criterio_id and asg.clinica_id = clinica_actual()
  )
  select
    b.sede_id, b.servicio_norma_id, sn.clave, b.estandar_codigo,
    count(*)::int,
    count(*) filter (where b.es_encabezado)::int,
    count(*) filter (where b.auto)::int,
    count(*) filter (where b.evaluable)::int,
    count(*) filter (where b.evaluable and b.estado = 'cumple')::int,
    count(*) filter (where b.evaluable and b.estado = 'no_cumple')::int,
    count(*) filter (where b.evaluable and b.estado = 'no_aplica')::int,
    count(*) filter (where b.evaluable and coalesce(b.estado, 'pendiente') = 'pendiente')::int,
    count(*) filter (where b.evaluable and b.estado in ('cumple', 'no_cumple', 'no_aplica')
      and b.fecha_verificacion <= ((now() at time zone 'America/Bogota')::date - interval '12 months')::date)::int,
    count(*) filter (where b.evaluable and b.responsable_id = auth.uid())::int,
    count(*) filter (where b.con_plan)::int
  from base b
  join hab_servicios_norma sn on sn.id = b.servicio_norma_id
  group by b.sede_id, b.servicio_norma_id, sn.clave, sn.orden, b.estandar_codigo
  order by b.sede_id, sn.orden, b.estandar_codigo;
$$;

-- ============================================================
-- 7a. Ocurrencias: la autoría de la presentación no la dicta el cliente
-- ============================================================
create or replace function fn_hab_ocurrencia_validar_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  new.dia_no_habil := fn_es_dia_no_habil(new.fecha_limite, fn_hab_pais_clinica(new.clinica_id));

  if new.reemplaza_id is not null and not exists (
    select 1 from hab_obligacion_ocurrencias o
    where o.id = new.reemplaza_id and o.clinica_id = new.clinica_id
      and o.obligacion_id = new.obligacion_id and o.clave_periodo = new.clave_periodo
      and o.estado = 'anulado'
  ) then
    raise exception 'Solo se puede reemplazar una ocurrencia anulada del mismo periodo.';
  end if;

  if current_user in ('authenticated', 'anon') then
    -- El usuario solo registra envíos de obligaciones sin calendario
    -- (manual), subsanaciones (F7) y cierres temporales (vía novedad); las
    -- fechas de calendario las genera el sistema.
    if new.generada_por <> 'usuario' or new.origen not in ('manual', 'subsanacion_visita', 'cierre_temporal') then
      raise exception 'Las fechas del calendario las genera el sistema.';
    end if;
    if new.estado not in ('pendiente', 'presentado') then
      raise exception 'Estado inicial no permitido.';
    end if;
    new.created_by := auth.uid();
    new.motivo_anulacion := null;
    new.anulado_por := null;
    new.anulado_en := null;
    -- La autoría de la presentación sale de la sesión, no del cliente (igual
    -- que en la ruta de UPDATE de fn_hab_ocurrencia_transicion).
    new.presentado_por := null;
    new.presentado_en := null;
  elsif new.presentado_por is not null and not exists (
    select 1 from usuarios u where u.id = new.presentado_por and u.clinica_id = new.clinica_id
  ) then
    -- Definer o service role: quien presenta debe ser de la misma clínica.
    raise exception 'Quien presenta debe pertenecer a la clínica de la obligación.';
  end if;

  if new.estado = 'presentado' then
    if new.fecha_presentacion > v_hoy then
      raise exception 'La fecha de presentación no puede ser futura.';
    end if;
    new.presentado_por := coalesce(new.presentado_por, auth.uid());
    new.presentado_en := coalesce(new.presentado_en, now());
  end if;
  return new;
end;
$$;

-- ============================================================
-- 7b. Registrar hito: el radicado exige EDIT si cambia el perfil
-- ============================================================
create or replace function fn_hab_registrar_hito(
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

  -- El radicado pasa el perfil de "No inscrito" a "En trámite": mismo UPDATE
  -- sujeto a RLS. Sin EDIT afectaría 0 filas en silencio; mejor un error claro
  -- (la transacción entera se revierte, el hito tampoco queda a medias).
  if p_tipo = 'radicado' and not has_permission('habilitacion', 'EDIT')
     and exists (select 1 from hab_perfil_prestador where clinica_id = v_clinica and estado_reps = 'no_inscrito') then
    raise exception 'Registrar el radicado cambia el estado de tu perfil a "En trámite": necesitas permiso de edición en Habilitación.';
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

-- ============================================================
-- 7g. Días hábiles con el país de la clínica
-- ============================================================
create or replace function fn_hab_sumar_dias_habiles(p_desde date, p_dias int, p_pais_codigo text default null)
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
  -- Sin país explícito: el de la clínica de la sesión (fn_hab_pais_clinica cae
  -- a Colombia si no hay sesión, p. ej. el cron o un definer).
  if p_pais_codigo is null then
    v_pais := fn_hab_pais_clinica(clinica_actual());
  else
    select id into v_pais from paises where codigo = p_pais_codigo;
  end if;
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

-- ============================================================
-- 8. Privilegios (se repiten por claridad; create or replace ya los conserva)
-- ============================================================
-- Lección de bootstrap_clinica (0020): las funciones definer que reciben un
-- clinica_id no se exponen a usuarios.
revoke all on function fn_hab_generar_ocurrencias(uuid, date) from public, anon, authenticated;
grant execute on function fn_hab_generar_ocurrencias(uuid, date) to service_role;
revoke execute on function fn_hab_alertas_pendientes(uuid, date) from public, anon, authenticated;
grant execute on function fn_hab_alertas_pendientes(uuid, date) to service_role;
revoke execute on function fn_hab_ev_rrhh_talento_humano(uuid, uuid, jsonb) from public, anon, authenticated;

revoke execute on function fn_hab_cerrar_autoevaluacion(text, text, boolean) from public, anon;
grant execute on function fn_hab_cerrar_autoevaluacion(text, text, boolean) to authenticated;
revoke execute on function fn_hab_criterio_aplica(uuid, uuid) from public, anon;
grant execute on function fn_hab_criterio_aplica(uuid, uuid) to authenticated;
revoke execute on function fn_hab_tablero_criterios(uuid, text) from public, anon;
grant execute on function fn_hab_tablero_criterios(uuid, text) to authenticated;
revoke execute on function fn_hab_progreso_autoevaluacion(uuid) from public, anon;
grant execute on function fn_hab_progreso_autoevaluacion(uuid) to authenticated;
revoke all on function fn_hab_registrar_hito(uuid, text, date, text, text, boolean, text, text, text, int, text, date) from public, anon;
grant execute on function fn_hab_registrar_hito(uuid, text, date, text, text, boolean, text, text, text, int, text, date) to authenticated;
