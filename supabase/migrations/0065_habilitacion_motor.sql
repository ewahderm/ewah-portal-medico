-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F3: motor de
-- aplicabilidad ("¿qué criterios aplican a esta sede?").
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico aprobado: diseno-tecnico-habilitacion.md §1.6, §1.7 y fila
-- F3 de §7. UNA sola implementación, en SQL, usada por la UI, la validación
-- de inserts de evaluaciones (F5), el preview "este servicio te agrega N
-- criterios" (F4) y el cierre de autoevaluación. No se reimplementa en
-- TypeScript: dos motores = deriva garantizada.
--
-- El oráculo de pruebas es el motor de referencia en JS
-- (scripts/habilitacion/lib/motor.mjs); scripts/habilitacion/
-- probar-motor.mjs compara ambos criterio por criterio.
--
-- Precisiones a §1.6 que trae la siembra (scripts/habilitacion/NOTAS.md,
-- "Recomendaciones para el motor SQL"):
--   - El rol de telemedicina filtra aunque el bloque no restrinja categoría
--     (429 bloques "telemedicina - prestador de referencia" con categoría
--     null): sin esto, una sede solo remisora vería los de referencia.
--   - La parte NO telemedicina de un bloque coincide sola, sin mirar el rol
--     ("Modalidades intramural, telemedicina – prestador remisor" aplica a
--     una sede solo intramural).
--   - Para remitir se usa el contexto del criterio ORIGEN (su complejidad, o
--     la única del destino, y sus modalidades) salvo que la remisión traiga
--     complejidades_destino / modalidades_destino. Profundidad máx. 3
--     (11.2.2.IN.10 → 11.2.1.IN.16 → 11.2.1 intramural). La profundidad
--     acotada es la guarda de ciclos.
--   - criterios_destino es un puntero directo: esos códigos entran con sus
--     descendientes y sin filtro de bloque.
--
-- Todas security invoker: el núcleo solo lee catálogos globales (lectura
-- abierta a authenticated) y el envoltorio lee sedes /
-- clinica_servicios_habilitados con el RLS de quien llama, además de
-- filtrar explícitamente por clinica_actual() (defensa en profundidad: un
-- usuario de otra clínica recibe 0 filas aunque pase un sede_id ajeno).

-- ============================================================
-- 1. Predicados puros (inlinables: immutable, sin search_path, sin tablas)
-- ============================================================
-- Un bloque coincide con un contexto (complejidades, modalidades,
-- categorías y roles de telemedicina) y el uso de la edificación de la sede.
-- null en el bloque = no restringe esa dimensión; uso null en la sede =
-- conservador, entran ambos bloques de edificación (mostrar de más, nunca
-- de menos). 'no_aplica' en el contexto = servicio sin complejidad, no
-- filtra por complejidad.
create or replace function fn_hab_bloque_coincide(
  p_aplica_complejidad text[],
  p_aplica_modalidad text[],
  p_aplica_tele_categoria text[],
  p_aplica_tele_rol text[],
  p_aplica_edificacion text,
  p_complejidades text[],
  p_modalidades text[],
  p_tele_categorias text[],
  p_tele_roles text[],
  p_uso_edificacion text
)
returns boolean
language sql
immutable
as $$
  select
    (p_aplica_complejidad is null
      or coalesce('no_aplica' = any(p_complejidades), false)
      or p_aplica_complejidad && p_complejidades)
    and (p_aplica_modalidad is null
      -- parte no telemedicina del bloque: coincide sola
      or array_remove(p_aplica_modalidad, 'telemedicina') && p_modalidades
      -- parte telemedicina: exige la modalidad y, si el bloque restringe,
      -- categoría y rol (el rol filtra aunque la categoría sea null)
      or ('telemedicina' = any(p_aplica_modalidad)
        and 'telemedicina' = any(p_modalidades)
        and (p_aplica_tele_categoria is null or p_aplica_tele_categoria && p_tele_categorias)
        and (p_aplica_tele_rol is null or p_aplica_tele_rol && p_tele_roles)))
    and (p_aplica_edificacion is null
      or p_uso_edificacion is null
      or p_aplica_edificacion = p_uso_edificacion);
$$;

-- Vigencia a una fecha: el 2027-01-03 salen solos los derogados por la Res.
-- 914/2025 y entra el texto nuevo de 11.2.1.DO.23.6, sin cron ni migración.
create or replace function fn_hab_criterio_vigente(p_desde date, p_hasta date, p_fecha date)
returns boolean
language sql
immutable
as $$
  select (p_desde is null or p_desde <= p_fecha) and (p_hasta is null or p_hasta > p_fecha);
$$;

-- ============================================================
-- 2. Núcleo puro: contexto hipotético de UNA sede → criterios aplicables
-- ============================================================
-- p_contexto:
--   { "uso_edificacion": "exclusivo_salud" | "mixto" | null,
--     "servicios": [ { "servicio_norma_id": uuid, "complejidad": text,
--                      "modalidades": [], "telemedicina_categorias": [],
--                      "telemedicina_roles": [], "cierre_temporal": bool? } ] }
-- Solo lee tablas globales: testeable con fixtures y sirve al preview
-- (llamarlo con y sin el servicio nuevo).
--
-- Salida por criterio:
--   origen: directo > transversal (11.1) > remision (prioridad del dedupe).
--   remitido_desde_criterio_id: el criterio que lo trajo (solo remision).
--   autorresuelto: remite_a_11_1 (no se evalúa a mano; su estado lo deriva
--     la capa de presentación, §3.3).
--   en_cierre_temporal: true si TODOS los caminos que lo traen vienen de
--     servicios en cierre temporal (entra igual: para reactivar debe seguir
--     cumpliendo, §1.6; la UI lo marca).
create or replace function fn_hab_resolver_criterios(p_contexto jsonb, p_fecha date)
returns table (
  criterio_id uuid,
  servicio_norma_id uuid,
  estandar_codigo text,
  bloque_id uuid,
  padre_id uuid,
  origen text,
  remitido_desde_criterio_id uuid,
  es_encabezado boolean,
  autorresuelto boolean,
  orden int,
  en_cierre_temporal boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive
  -- Paso 1: servicios declarados (solo los que existen en el catálogo).
  declarados as (
    select
      sn.id as servicio_id,
      sn.norma_id,
      array_remove(array[e->>'complejidad'], null) as ctx_c,
      array(select jsonb_array_elements_text(coalesce(e->'modalidades', '[]'))) as ctx_m,
      array(select jsonb_array_elements_text(coalesce(e->'telemedicina_categorias', '[]'))) as ctx_cat,
      array(select jsonb_array_elements_text(coalesce(e->'telemedicina_roles', '[]'))) as ctx_rol,
      coalesce((e->>'cierre_temporal')::boolean, false) as cierre
    from jsonb_array_elements(coalesce(p_contexto->'servicios', '[]'::jsonb)) e
    join hab_servicios_norma sn on sn.id = (e->>'servicio_norma_id')::uuid
  ),
  -- 11.1 una vez por sede si hay ≥ 1 servicio; contexto = unión de todos.
  entradas as (
    select d.servicio_id, d.ctx_c, d.ctx_m, d.ctx_cat, d.ctx_rol, 'directo'::text as origen, d.cierre
    from declarados d
    union all
    select
      t.id,
      array(select distinct x from declarados d, unnest(d.ctx_c) x),
      array(select distinct x from declarados d, unnest(d.ctx_m) x),
      array(select distinct x from declarados d, unnest(d.ctx_cat) x),
      array(select distinct x from declarados d, unnest(d.ctx_rol) x),
      'transversal',
      (select bool_and(d.cierre) from declarados d)
    from hab_servicios_norma t
    where t.es_transversal
      and t.norma_id in (select d.norma_id from declarados d)
  ),
  -- Pasos 2-4: bloques que coinciden + vigencia, y remisiones recursivas.
  alcanzados (criterio_id, origen, desde, ctx_c, ctx_m, ctx_cat, ctx_rol, cierre, prof) as (
    select c.id, e.origen, null::uuid, e.ctx_c, e.ctx_m, e.ctx_cat, e.ctx_rol, e.cierre, 0
    from entradas e
    join hab_bloques b on b.servicio_norma_id = e.servicio_id
    join hab_criterios c on c.bloque_id = b.id
    where fn_hab_bloque_coincide(b.aplica_complejidad, b.aplica_modalidad, b.aplica_telemedicina_categoria,
            b.aplica_telemedicina_rol, b.aplica_tipo_edificacion,
            e.ctx_c, e.ctx_m, e.ctx_cat, e.ctx_rol, p_contexto->>'uso_edificacion')
      and fn_hab_criterio_vigente(c.vigente_desde, c.vigente_hasta, p_fecha)

    union all

    select dest.id, 'remision', a.criterio_id, dest.ctx_c, dest.ctx_m, a.ctx_cat, a.ctx_rol, a.cierre, a.prof + 1
    from alcanzados a
    join hab_criterios co on co.id = a.criterio_id and co.tiene_remision
    join hab_criterio_remisiones r on r.criterio_id = co.id
    join hab_servicios_norma sd on sd.id = r.servicio_destino_id
    cross join lateral (
      -- (a) Todo el bloque del destino que coincida, mismo estándar del
      --     origen (o estandar_destino), con el contexto del origen
      --     ajustado por la remisión.
      select c2.id, x.ctx_c, x.ctx_m
      from (select
              coalesce(r.complejidades_destino,
                case when cardinality(sd.complejidades) = 1 then sd.complejidades else a.ctx_c end) as ctx_c,
              coalesce(r.modalidades_destino, a.ctx_m) as ctx_m) x
      join hab_bloques b2 on b2.servicio_norma_id = sd.id
        and b2.estandar_codigo = coalesce(r.estandar_destino, co.estandar_codigo)
      join hab_criterios c2 on c2.bloque_id = b2.id
      where r.criterios_destino is null
        and fn_hab_bloque_coincide(b2.aplica_complejidad, b2.aplica_modalidad, b2.aplica_telemedicina_categoria,
              b2.aplica_telemedicina_rol, b2.aplica_tipo_edificacion,
              x.ctx_c, x.ctx_m, a.ctx_cat, a.ctx_rol, p_contexto->>'uso_edificacion')
        and fn_hab_criterio_vigente(c2.vigente_desde, c2.vigente_hasta, p_fecha)
      union all
      -- (b) Puntero directo: los códigos listados y sus descendientes, sin
      --     filtro de bloque, con el contexto del origen.
      select p.id, a.ctx_c, a.ctx_m
      from (
        with recursive arbol as (
          select c3.id, c3.vigente_desde, c3.vigente_hasta
          from hab_criterios c3
          where c3.norma_id = sd.norma_id
            and c3.codigo = any(r.criterios_destino)
            and c3.vigente_desde is null
          union all
          select h.id, h.vigente_desde, h.vigente_hasta
          from arbol t
          join hab_criterios h on h.padre_id = t.id
        )
        select arbol.id, arbol.vigente_desde, arbol.vigente_hasta from arbol
      ) p
      where r.criterios_destino is not null
        and fn_hab_criterio_vigente(p.vigente_desde, p.vigente_hasta, p_fecha)
    ) dest
    where a.prof < 3
  ),
  -- Paso 7: dedupe con prioridad directo > transversal > remision.
  incluidos as (
    select distinct on (al.criterio_id)
      al.criterio_id, al.origen, al.desde,
      bool_and(al.cierre) over (partition by al.criterio_id) as cierre
    from alcanzados al
    order by al.criterio_id,
      case al.origen when 'directo' then 0 when 'transversal' then 1 else 2 end,
      al.prof, al.desde
  ),
  -- Paso 6: jerarquía. Un hijo solo entra si toda su cadena de ancestros
  -- entró (se recorre desde las raíces).
  finales (criterio_id) as (
    select i.criterio_id
    from incluidos i
    join hab_criterios c on c.id = i.criterio_id
    where c.padre_id is null
    union all
    select h.id
    from finales f
    join hab_criterios h on h.padre_id = f.criterio_id
    join incluidos i on i.criterio_id = h.id
  )
  select
    c.id, c.servicio_norma_id, c.estandar_codigo, c.bloque_id, c.padre_id,
    i.origen, i.desde, c.es_encabezado, c.remite_a_11_1, c.orden, i.cierre
  from finales f
  join incluidos i on i.criterio_id = f.criterio_id
  join hab_criterios c on c.id = f.criterio_id;
$$;

comment on function fn_hab_resolver_criterios(jsonb, date) is
  'Motor de aplicabilidad de habilitación (núcleo puro, §1.6): contexto hipotético de una sede → criterios aplicables a p_fecha. Solo lee catálogos globales.';

-- ============================================================
-- 3. Envoltorio de clínica: sedes reales → núcleo
-- ============================================================
-- Arma el contexto desde sedes + clinica_servicios_habilitados (filas con
-- sede, numeral y complejidad; estado <> 'cerrado'; cierre_temporal entra
-- con marca). p_sede_id null = todas las sedes ACTIVAS de la clínica; con
-- p_sede_id se devuelve esa sede aunque esté inactiva (consultar su
-- historial). Fuera de la clínica del usuario: 0 filas.
create or replace function fn_hab_criterios_aplicables(
  p_sede_id uuid default null,
  p_fecha date default current_date
)
returns table (
  sede_id uuid,
  criterio_id uuid,
  servicio_norma_id uuid,
  estandar_codigo text,
  bloque_id uuid,
  padre_id uuid,
  origen text,
  remitido_desde_criterio_id uuid,
  es_encabezado boolean,
  autorresuelto boolean,
  orden int,
  en_cierre_temporal boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, r.*
  from sedes s
  cross join lateral (
    select jsonb_build_object(
      'uso_edificacion', s.uso_edificacion,
      'servicios', coalesce(jsonb_agg(jsonb_build_object(
        'servicio_norma_id', h.servicio_norma_id,
        'complejidad', h.complejidad,
        'modalidades', to_jsonb(h.modalidades),
        'telemedicina_categorias', to_jsonb(h.telemedicina_categorias),
        'telemedicina_roles', to_jsonb(h.telemedicina_roles),
        'cierre_temporal', h.estado = 'cierre_temporal'
      )), '[]'::jsonb)
    ) as contexto
    from clinica_servicios_habilitados h
    where h.sede_id = s.id
      and h.clinica_id = s.clinica_id
      and h.servicio_norma_id is not null
      and h.complejidad is not null
      and h.estado <> 'cerrado'
  ) ctx
  cross join lateral fn_hab_resolver_criterios(ctx.contexto, p_fecha) r
  where s.clinica_id = clinica_actual()
    and (case when p_sede_id is null then s.activo else s.id = p_sede_id end);
$$;

comment on function fn_hab_criterios_aplicables(uuid, date) is
  'Criterios de habilitación aplicables a las sedes de la clínica del usuario (envoltorio del núcleo fn_hab_resolver_criterios, §1.6).';

-- Usado por la validación de inserts de evaluaciones (F5, a la fecha de hoy).
create or replace function fn_hab_criterio_aplica(p_sede_id uuid, p_criterio_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from fn_hab_criterios_aplicables(p_sede_id, current_date) a
    where a.criterio_id = p_criterio_id
  );
$$;

-- ============================================================
-- 4. Tablero (una sola ida a la BD para la pantalla de autoevaluación)
-- ============================================================
-- Versión F3: criterios aplicables de la sede + textos + estándar +
-- servicio + bloque, en orden de lectura. Las columnas de evaluación
-- vigente, asignación y evidencias van en null porque sus tablas llegan en
-- 0066 (F5); 0066 reemplaza el cuerpo con `create or replace` manteniendo
-- EXACTAMENTE esta firma y estas columnas (si cambia una columna, Postgres
-- exige drop + create). Se publica ya para que F4 y F5 programen contra la
-- forma definitiva.
create or replace function fn_hab_tablero_criterios(p_sede_id uuid)
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
  -- F5 (0066): evaluación vigente
  evaluacion_id uuid,
  estado text,
  justificacion text,
  observacion text,
  fecha_verificacion date,
  evaluado_por uuid,
  evaluado_en timestamptz,
  -- F5 (0066): asignación y evidencias
  responsable_id uuid,
  fecha_objetivo date,
  evidencias_activas int
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
    null::uuid, null::text, null::text, null::text, null::date, null::uuid, null::timestamptz,
    null::uuid, null::date, null::int
  from fn_hab_criterios_aplicables(p_sede_id, current_date) a
  join hab_criterios c on c.id = a.criterio_id
  join hab_servicios_norma sn on sn.id = c.servicio_norma_id
  join hab_estandares e on e.codigo = c.estandar_codigo
  join hab_bloques b on b.id = c.bloque_id
  left join hab_criterios rd on rd.id = a.remitido_desde_criterio_id
  where p_sede_id is not null
  order by sn.orden, e.orden, c.orden;
$$;

-- ============================================================
-- 5. Privilegios: solo usuarios autenticados (y service_role, por defecto)
-- ============================================================
revoke execute on function fn_hab_bloque_coincide(text[], text[], text[], text[], text, text[], text[], text[], text[], text) from public, anon;
revoke execute on function fn_hab_criterio_vigente(date, date, date) from public, anon;
revoke execute on function fn_hab_resolver_criterios(jsonb, date) from public, anon;
revoke execute on function fn_hab_criterios_aplicables(uuid, date) from public, anon;
revoke execute on function fn_hab_criterio_aplica(uuid, uuid) from public, anon;
revoke execute on function fn_hab_tablero_criterios(uuid) from public, anon;

grant execute on function fn_hab_bloque_coincide(text[], text[], text[], text[], text, text[], text[], text[], text[], text) to authenticated;
grant execute on function fn_hab_criterio_vigente(date, date, date) to authenticated;
grant execute on function fn_hab_resolver_criterios(jsonb, date) to authenticated;
grant execute on function fn_hab_criterios_aplicables(uuid, date) to authenticated;
grant execute on function fn_hab_criterio_aplica(uuid, uuid) to authenticated;
grant execute on function fn_hab_tablero_criterios(uuid) to authenticated;
