-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F6: evidencia
-- de otros módulos.
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico: diseno-tecnico-habilitacion.md §6 y fila F6 de §7.
-- Historia HU-4.7 del requerimiento. Número: el plan reservaba 0069 para
-- F6, pero F7/F8 siguen como borradores sin aplicar; F6 toma 0067 para no
-- dejar huecos en la historia de migraciones (los borradores pasan a
-- 0068/0069).
--
-- Principio (§6): la evidencia guarda una REFERENCIA (fuente + parámetros)
-- y el resumen se calcula en vivo por una función de solo lectura; nunca
-- se copia el dato de otro módulo. Las proveedoras devuelven solo
-- agregados: nunca salarios, contratos, diagnósticos ni datos de salud del
-- empleado (vacunas: vigente / vencida / falta, sin detalle).
--
-- Contenido:
--   1. hab_evidencias: tipos `registro_modulo` y `documento_normativo`.
--   2. Proveedoras fn_hab_ev_* (security definer, sin EXECUTE para nadie)
--      y el dispatcher fn_hab_resumen_evidencia (único punto de entrada).
--   3. hab_criterio_fuentes_sugeridas: curaduría global criterio → fuente
--      o tipo de protocolo (revisada a mano contra el texto de 11.1).
--   4. Tipos de documento normativo de habilitación (nombres tomados del
--      texto de la norma) + políticas de documentos_normativos: Habilitación
--      ve y carga SOLO los de su categoría, y esos no se borran. Sus
--      archivos van al bucket `habilitacion` (carpeta protocolos/), no a
--      `documentos-rrhh`: así no se tocan las políticas de storage de RRHH.
--   5. Versión de documentos_normativos de habilitación asignada por la BD
--      (sin carrera entre dos cargas simultáneas).

-- ============================================================
-- 1. Evidencias: referencia a otro módulo o a un protocolo
-- ============================================================
alter table hab_evidencias
  add column fuente_codigo text check (fuente_codigo in (
    'rrhh_talento_humano', 'ma_temperatura_nevera', 'ma_temperatura_ambiente', 'ma_residuos',
    'ma_limpieza', 'ma_extintores', 'inv_registro_sanitario', 'inv_lotes_vencidos',
    'sistema_consentimientos', 'sistema_historia_clinica'
  )),
  add column fuente_parametros jsonb not null default '{}'::jsonb,
  add column tipo_documento_normativo_id uuid references tipos_documento_normativo(id);

alter table hab_evidencias drop constraint hab_evidencias_tipo_check;
alter table hab_evidencias add constraint hab_evidencias_tipo_check
  check (tipo in ('archivo', 'nota', 'enlace', 'registro_modulo', 'documento_normativo'));

alter table hab_evidencias drop constraint hab_evidencias_forma;
alter table hab_evidencias add constraint hab_evidencias_forma check (
  (tipo = 'archivo' and storage_path is not null and nombre_archivo is not null
    and mime is not null and tamano_bytes is not null and url is null
    and fuente_codigo is null and tipo_documento_normativo_id is null)
  or (tipo = 'enlace' and url is not null and storage_path is null
    and fuente_codigo is null and tipo_documento_normativo_id is null)
  or (tipo = 'nota' and url is null and storage_path is null
    and fuente_codigo is null and tipo_documento_normativo_id is null)
  or (tipo = 'registro_modulo' and fuente_codigo is not null and url is null and storage_path is null
    and tipo_documento_normativo_id is null)
  or (tipo = 'documento_normativo' and tipo_documento_normativo_id is not null and url is null
    and storage_path is null and fuente_codigo is null)
);

-- Parámetros: lista cerrada por fuente, nunca SQL dinámico. Hoy solo la
-- nevera admite uno ({"nevera_id": "<uuid de una nevera de la sede>"}).
-- El protocolo debe ser de la categoría habilitación (los de RRHH no los
-- puede leer quien solo tiene permisos de Habilitación).
-- security definer: debe ver neveras / tipos sin depender del RLS de
-- Medio Ambiente del usuario; solo LEE para validar.
create or replace function fn_hab_evidencia_validar_referencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'registro_modulo' then
    if jsonb_typeof(new.fuente_parametros) <> 'object' then
      raise exception 'Parámetros de la fuente inválidos.';
    end if;
    if new.fuente_parametros - 'nevera_id' <> '{}'::jsonb
       or (new.fuente_parametros ? 'nevera_id' and new.fuente_codigo <> 'ma_temperatura_nevera') then
      raise exception 'Parámetros de la fuente inválidos.';
    end if;
    if new.fuente_parametros ? 'nevera_id' and not exists (
      select 1 from neveras n
      where n.id::text = new.fuente_parametros->>'nevera_id'
        and n.clinica_id = new.clinica_id and n.sede_id = new.sede_id
    ) then
      raise exception 'La nevera no pertenece a esta sede.';
    end if;
  else
    new.fuente_parametros := '{}'::jsonb;
  end if;

  if new.tipo = 'documento_normativo' and not exists (
    select 1 from tipos_documento_normativo t
    where t.id = new.tipo_documento_normativo_id and t.categoria = 'habilitacion'
  ) then
    raise exception 'Ese tipo de documento no es un protocolo de habilitación.';
  end if;
  return new;
end;
$$;

comment on function fn_hab_evidencia_validar_referencia() is
  'Valida fuente_parametros (lista cerrada) y que el protocolo sea de habilitación. security definer solo para LEER neveras y tipos.';

create trigger hab_evidencias_validar_referencia
  before insert on hab_evidencias
  for each row execute function fn_hab_evidencia_validar_referencia();

-- fn_hab_evaluar (0066) con los campos nuevos de evidencia. Misma firma:
-- create or replace. p_evidencias acepta además "fuente_codigo",
-- "fuente_parametros", "tipo_documento_normativo_id" y
-- "sugerida_por_sistema".
create or replace function fn_hab_evaluar(
  p_sede_id uuid,
  p_criterio_id uuid,
  p_estado text,
  p_justificacion text default null,
  p_observacion text default null,
  p_evidencias jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
  v_vigente record;
  v_ev jsonb;
  v_id uuid;
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if jsonb_typeof(coalesce(p_evidencias, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) > 10 then
    raise exception 'Evidencias inválidas.';
  end if;

  select e.id, e.estado, e.justificacion, e.observacion into v_vigente
  from hab_evaluaciones e
  where e.sede_id = p_sede_id and e.criterio_id = p_criterio_id and e.clinica_id = v_clinica_id
  order by e.created_at desc, e.id desc
  limit 1;

  if found
     and v_vigente.estado = p_estado
     and v_vigente.justificacion is not distinct from nullif(btrim(p_justificacion), '')
     and v_vigente.observacion is not distinct from nullif(btrim(p_observacion), '')
     and jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) = 0 then
    return v_vigente.id;
  end if;

  for v_ev in select * from jsonb_array_elements(coalesce(p_evidencias, '[]'::jsonb)) loop
    insert into hab_evidencias (clinica_id, sede_id, criterio_id, tipo, descripcion, url, storage_path,
      nombre_archivo, mime, tamano_bytes, sha256, fuente_codigo, fuente_parametros, tipo_documento_normativo_id,
      sugerida_por_sistema, created_by)
    values (v_clinica_id, p_sede_id, p_criterio_id, v_ev->>'tipo', v_ev->>'descripcion', v_ev->>'url',
      v_ev->>'storage_path', v_ev->>'nombre_archivo', v_ev->>'mime', (v_ev->>'tamano_bytes')::int,
      v_ev->>'sha256', v_ev->>'fuente_codigo', coalesce(v_ev->'fuente_parametros', '{}'::jsonb),
      (v_ev->>'tipo_documento_normativo_id')::uuid, coalesce((v_ev->>'sugerida_por_sistema')::boolean, false),
      auth.uid());
  end loop;

  insert into hab_evaluaciones (clinica_id, sede_id, criterio_id, norma_id, estado, justificacion, observacion, evaluado_por)
  values (v_clinica_id, p_sede_id, p_criterio_id,
    (select norma_id from hab_criterios where id = p_criterio_id),
    p_estado, nullif(btrim(p_justificacion), ''), nullif(btrim(p_observacion), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- 2. Proveedoras de evidencia (§6.1, §6.2)
-- ============================================================
-- Todas: (p_clinica_id, p_sede_id, p_parametros) → jsonb con la forma
--   { estado: ok|alerta|falta, titulo, detalle, conteos, sugerencia:
--     cumple|no_cumple|null, enlace, filas?, calculado_en }
-- security definer porque leen tablas cuyo RLS exige permisos de otros
-- módulos (rrhh, medio_ambiente, inventario) que el responsable de calidad
-- puede no tener. Por eso: NADIE tiene EXECUTE sobre ellas (revoke abajo);
-- solo las llama el dispatcher, que valida sesión, clínica, sede y
-- permiso. Devuelven agregados, nunca filas crudas.
-- "Hoy" y "últimos 30 días" en hora de Colombia.

create or replace function fn_hab_hoy() returns date
language sql stable set search_path = public
as $$ select (now() at time zone 'America/Bogota')::date $$;

-- Talento humano: por persona, título / tarjeta profesional o ReTHUS /
-- vacunas. Sin sugerencia: el sistema no sabe quién presta servicios de
-- salud (la recepcionista no necesita tarjeta) — lo decide el responsable.
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
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', p.nombre,
        'titulo', case when p.titulo then 'ok' else 'falta' end,
        'tarjeta', case when p.tarjeta then 'ok' else 'falta' end,
        'vacunas', p.vacunas) order by p.nombre)
      from (select * from personas order by nombre limit 100) p
    ), '[]'::jsonb),
    'calculado_en', now()
  ) from c;
$$;

-- Cadena de frío: rango 2–8 °C (medicamentos y biológicos refrigerados).
create or replace function fn_hab_ev_ma_temperatura_nevera(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with neveras_sede as (
    select n.id, n.nombre from neveras n
    where n.clinica_id = p_clinica_id and n.sede_id = p_sede_id and n.activo
      and (p_parametros->>'nevera_id' is null or n.id::text = p_parametros->>'nevera_id')
  ),
  por_nevera as (
    select ns.nombre,
      count(distinct r.fecha)::int as dias,
      count(r.id) filter (where r.temperatura_celsius < 2 or r.temperatura_celsius > 8)::int as fuera
    from neveras_sede ns
    left join registros_temperatura_nevera r
      on r.nevera_id = ns.id and r.clinica_id = p_clinica_id and r.fecha > fn_hab_hoy() - 30 and r.fecha <= fn_hab_hoy()
    group by ns.id, ns.nombre
  ),
  c as (
    select count(*)::int as neveras, coalesce(min(dias), 0)::int as dias_min, coalesce(sum(fuera), 0)::int as fuera_de_rango
    from por_nevera
  )
  select jsonb_build_object(
    'estado', case when c.neveras = 0 or c.dias_min = 0 then 'falta'
                   when c.fuera_de_rango > 0 or c.dias_min < 28 then 'alerta' else 'ok' end,
    'titulo', 'Temperatura de neveras (últimos 30 días)',
    'detalle', case when c.neveras = 0 then 'No hay neveras activas registradas en esta sede.'
      else (select string_agg(format('%s: %s/30 días con registro, %s fuera de 2–8 °C', nombre, dias, fuera), '; ' order by nombre) from por_nevera) || '.' end,
    'conteos', to_jsonb(c),
    'sugerencia', case when c.neveras > 0 and c.dias_min >= 28 and c.fuera_de_rango = 0 then 'cumple' end,
    'enlace', '/medio-ambiente',
    'calculado_en', now()
  ) from c;
$$;

-- Temperatura y humedad de consultorios: solo cobertura (la norma no fija
-- un rango general).
create or replace function fn_hab_ev_ma_temperatura_ambiente(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with por_consultorio as (
    select co.nombre, count(distinct r.fecha)::int as dias
    from consultorios co
    left join registros_temperatura_consultorio r
      on r.consultorio_id = co.id and r.clinica_id = p_clinica_id and r.fecha > fn_hab_hoy() - 30 and r.fecha <= fn_hab_hoy()
    where co.clinica_id = p_clinica_id and co.sede_id = p_sede_id and co.activo
    group by co.id, co.nombre
  ),
  c as (select count(*)::int as consultorios, coalesce(min(dias), 0)::int as dias_min, coalesce(max(dias), 0)::int as dias_max from por_consultorio)
  select jsonb_build_object(
    'estado', case when c.consultorios = 0 or c.dias_max = 0 then 'falta' when c.dias_min < 28 then 'alerta' else 'ok' end,
    'titulo', 'Temperatura y humedad de consultorios (últimos 30 días)',
    'detalle', case when c.consultorios = 0 then 'No hay consultorios activos en esta sede.'
      else (select string_agg(format('%s: %s/30 días con registro', nombre, dias), '; ' order by nombre) from por_consultorio) || '.' end,
    'conteos', to_jsonb(c),
    'sugerencia', null,
    'enlace', '/medio-ambiente',
    'calculado_en', now()
  ) from c;
$$;

create or replace function fn_hab_ev_ma_residuos(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with r as (
    select * from registros_residuos
    where clinica_id = p_clinica_id and sede_id = p_sede_id and fecha > fn_hab_hoy() - 30 and fecha <= fn_hab_hoy()
  ),
  c as (select count(*)::int as registros, count(distinct fecha)::int as dias, coalesce(round(sum(peso_kg), 1), 0) as kg from r)
  select jsonb_build_object(
    'estado', case when c.registros = 0 then 'falta' else 'ok' end,
    'titulo', 'Registro de residuos (últimos 30 días)',
    'detalle', case when c.registros = 0 then 'Sin registros de residuos en los últimos 30 días.'
      else format('%s registro(s) en %s día(s), %s kg en total: ', c.registros, c.dias, c.kg)
        || (select string_agg(format('%s %s kg', tipo_residuo, round(sum_kg, 1)), ', ' order by tipo_residuo)
            from (select tipo_residuo, sum(peso_kg) as sum_kg from r group by tipo_residuo) t) || '.' end,
    'conteos', to_jsonb(c),
    'sugerencia', null,
    'enlace', '/medio-ambiente',
    'calculado_en', now()
  ) from c;
$$;

create or replace function fn_hab_ev_ma_limpieza(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with r as (
    select * from registros_limpieza
    where clinica_id = p_clinica_id and sede_id = p_sede_id and fecha > fn_hab_hoy() - 30 and fecha <= fn_hab_hoy()
  ),
  c as (select count(*)::int as registros, count(distinct fecha)::int as dias, count(distinct coalesce(consultorio_id::text, area_nombre, area_tipo))::int as areas from r)
  select jsonb_build_object(
    'estado', case when c.registros = 0 then 'falta' when c.dias < 20 then 'alerta' else 'ok' end,
    'titulo', 'Registro de limpieza y desinfección (últimos 30 días)',
    'detalle', case when c.registros = 0 then 'Sin registros de limpieza en los últimos 30 días.'
      else format('%s registro(s) en %s de 30 días, %s área(s) distintas.', c.registros, c.dias, c.areas) end,
    'conteos', to_jsonb(c),
    'sugerencia', null,
    'enlace', '/medio-ambiente',
    'calculado_en', now()
  ) from c;
$$;

create or replace function fn_hab_ev_ma_extintores(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with c as (
    select count(*)::int as total,
      count(*) filter (where fecha_vencimiento < fn_hab_hoy())::int as vencidos,
      count(*) filter (where fecha_vencimiento >= fn_hab_hoy() and fecha_vencimiento <= fn_hab_hoy() + 30)::int as por_vencer,
      count(*) filter (where fecha_vencimiento is null)::int as sin_fecha
    from extintores
    where clinica_id = p_clinica_id and sede_id = p_sede_id and activo
  )
  select jsonb_build_object(
    'estado', case when c.total = 0 then 'falta' when c.vencidos > 0 or c.por_vencer > 0 or c.sin_fecha > 0 then 'alerta' else 'ok' end,
    'titulo', 'Extintores de la sede',
    'detalle', case when c.total = 0 then 'No hay extintores activos registrados en esta sede.'
      else format('%s extintor(es): %s vigentes, %s por vencer en 30 días, %s vencidos%s.', c.total,
        c.total - c.vencidos - c.por_vencer - c.sin_fecha, c.por_vencer, c.vencidos,
        case when c.sin_fecha > 0 then format(', %s sin fecha de vencimiento', c.sin_fecha) else '' end) end,
    'conteos', to_jsonb(c),
    'sugerencia', case when c.total = 0 then null when c.vencidos > 0 then 'no_cumple' when c.sin_fecha = 0 then 'cumple' end,
    'enlace', '/medio-ambiente',
    'calculado_en', now()
  ) from c;
$$;

-- Insumos: el catálogo es de la clínica (no por sede).
create or replace function fn_hab_ev_inv_registro_sanitario(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with i as (
    select nombre,
      nullif(btrim(registro_sanitario), '') is null as sin_registro,
      fecha_vencimiento_registro_sanitario < fn_hab_hoy() as vencido
    from insumos where clinica_id = p_clinica_id and activo
  ),
  c as (
    select count(*)::int as insumos,
      count(*) filter (where sin_registro)::int as sin_registro,
      count(*) filter (where not sin_registro and coalesce(vencido, false))::int as registro_vencido
    from i
  )
  select jsonb_build_object(
    'estado', case when c.insumos = 0 then 'falta' when c.sin_registro + c.registro_vencido > 0 then 'alerta' else 'ok' end,
    'titulo', 'Registro sanitario de insumos (Inventario)',
    'detalle', case when c.insumos = 0 then 'No hay insumos activos en Inventario.'
      when c.sin_registro + c.registro_vencido = 0 then format('Los %s insumos activos tienen registro sanitario vigente.', c.insumos)
      else format('%s de %s insumos activos sin registro sanitario o con registro vencido: %s.', c.sin_registro + c.registro_vencido, c.insumos,
        (select string_agg(nombre, ', ' order by nombre) from (select nombre from i where sin_registro or coalesce(vencido, false) order by nombre limit 15) x)) end,
    'conteos', to_jsonb(c),
    'sugerencia', case when c.insumos = 0 then null when c.sin_registro + c.registro_vencido > 0 then 'no_cumple' else 'cumple' end,
    'enlace', '/inventario',
    'calculado_en', now()
  ) from c;
$$;

create or replace function fn_hab_ev_inv_lotes_vencidos(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with l as (
    select l.numero_lote, i.nombre, l.fecha_vencimiento
    from lotes l join insumos i on i.id = l.insumo_id
    where l.clinica_id = p_clinica_id and l.sede_id = p_sede_id and l.activo and l.cantidad_actual > 0
  ),
  c as (
    select count(*)::int as lotes_con_existencia,
      count(*) filter (where fecha_vencimiento < fn_hab_hoy())::int as vencidos,
      count(*) filter (where fecha_vencimiento >= fn_hab_hoy() and fecha_vencimiento <= fn_hab_hoy() + 30)::int as por_vencer,
      count(*) filter (where fecha_vencimiento is null)::int as sin_fecha
    from l
  )
  select jsonb_build_object(
    'estado', case when c.lotes_con_existencia = 0 then 'falta' when c.vencidos > 0 then 'alerta'
                   when c.por_vencer > 0 or c.sin_fecha > 0 then 'alerta' else 'ok' end,
    'titulo', 'Fechas de vencimiento de lotes con existencia (Inventario)',
    'detalle', case when c.lotes_con_existencia = 0 then 'No hay lotes con existencia en esta sede.'
      else format('%s lote(s) con existencia: %s vencidos, %s vencen en 30 días, %s sin fecha.', c.lotes_con_existencia, c.vencidos, c.por_vencer, c.sin_fecha)
        || coalesce(' Vencidos: ' || (select string_agg(format('%s lote %s', nombre, numero_lote), ', ') from (select * from l where fecha_vencimiento < fn_hab_hoy() order by fecha_vencimiento limit 10) x) || '.', '') end,
    'conteos', to_jsonb(c),
    'sugerencia', case when c.lotes_con_existencia = 0 then null when c.vencidos > 0 then 'no_cumple' when c.sin_fecha = 0 then 'cumple' end,
    'enlace', '/inventario',
    'calculado_en', now()
  ) from c;
$$;

-- Consentimientos: cobertura en tratamientos vigentes del último
-- trimestre. Sin sugerencia: la norma pide el PROCEDIMIENTO y su
-- verificación, no solo el conteo.
create or replace function fn_hab_ev_sistema_consentimientos(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with t as (
    select t.id, exists (select 1 from tratamiento_consentimientos tc where tc.tratamiento_id = t.id) as con_consentimiento
    from tratamientos t
    where t.clinica_id = p_clinica_id and t.sede_id = p_sede_id and not t.anulado
      and t.fecha > fn_hab_hoy() - 90 and t.fecha <= fn_hab_hoy()
  ),
  c as (select count(*)::int as tratamientos, count(*) filter (where con_consentimiento)::int as con_consentimiento from t)
  select jsonb_build_object(
    'estado', case when c.tratamientos = 0 then 'falta' when c.con_consentimiento < c.tratamientos then 'alerta' else 'ok' end,
    'titulo', 'Consentimiento informado en el software (últimos 90 días)',
    'detalle', case when c.tratamientos = 0 then 'Sin tratamientos registrados en esta sede en los últimos 90 días.'
      else format('EWAH Tech guarda el consentimiento firmado de cada tratamiento. %s de %s tratamientos con consentimiento cargado.', c.con_consentimiento, c.tratamientos) end,
    'conteos', to_jsonb(c),
    'sugerencia', null,
    'enlace', '/tratamientos',
    'calculado_en', now()
  ) from c;
$$;

-- Historia clínica: ficha descriptiva del software (append-only con
-- auditoría) + actividad reciente. No lee el contenido clínico.
create or replace function fn_hab_ev_sistema_historia_clinica(p_clinica_id uuid, p_sede_id uuid, p_parametros jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  with c as (
    select count(*)::int as evoluciones_90_dias, count(distinct paciente_id)::int as pacientes_90_dias
    from evoluciones_paciente
    where clinica_id = p_clinica_id and fecha > fn_hab_hoy() - 90 and fecha <= fn_hab_hoy()
  )
  select jsonb_build_object(
    'estado', 'ok',
    'titulo', 'Historia clínica electrónica de EWAH Tech',
    'detalle', format('Registros append-only: lo guardado no se modifica ni se borra (las correcciones quedan como registro nuevo), cada anotación queda con fecha, hora y autor, y los cambios quedan en auditoría. Acceso por usuario y rol. Últimos 90 días: %s evolución(es) de %s paciente(s).',
      c.evoluciones_90_dias, c.pacientes_90_dias),
    'conteos', to_jsonb(c),
    'sugerencia', null,
    'enlace', '/pacientes',
    'calculado_en', now()
  ) from c;
$$;

-- Dispatcher: el ÚNICO punto de entrada. Lista cerrada en un `case` (nunca
-- SQL dinámico con el texto recibido); exige sesión, permiso VIEW y plan
-- con gestión, y que la sede sea de la clínica de la sesión.
create or replace function fn_hab_resumen_evidencia(p_fuente text, p_sede_id uuid, p_parametros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_p jsonb := coalesce(p_parametros, '{}'::jsonb);
begin
  if v_clinica is null or not has_permission('habilitacion', 'VIEW') or not has_entitlement('habilitacion', 'gestion') then
    raise exception 'No tienes permiso para ver la evidencia de habilitación.' using errcode = '42501';
  end if;
  if not exists (select 1 from sedes where id = p_sede_id and clinica_id = v_clinica) then
    raise exception 'La sede no pertenece a esta clínica.';
  end if;
  if jsonb_typeof(v_p) <> 'object' or v_p - 'nevera_id' <> '{}'::jsonb then
    raise exception 'Parámetros de la fuente inválidos.';
  end if;
  if p_fuente is null or p_fuente not in (
    'rrhh_talento_humano', 'ma_temperatura_nevera', 'ma_temperatura_ambiente', 'ma_residuos', 'ma_limpieza',
    'ma_extintores', 'inv_registro_sanitario', 'inv_lotes_vencidos', 'sistema_consentimientos', 'sistema_historia_clinica'
  ) then
    raise exception 'Fuente de evidencia desconocida.';
  end if;

  return case p_fuente
    when 'rrhh_talento_humano' then fn_hab_ev_rrhh_talento_humano(v_clinica, p_sede_id, v_p)
    when 'ma_temperatura_nevera' then fn_hab_ev_ma_temperatura_nevera(v_clinica, p_sede_id, v_p)
    when 'ma_temperatura_ambiente' then fn_hab_ev_ma_temperatura_ambiente(v_clinica, p_sede_id, v_p)
    when 'ma_residuos' then fn_hab_ev_ma_residuos(v_clinica, p_sede_id, v_p)
    when 'ma_limpieza' then fn_hab_ev_ma_limpieza(v_clinica, p_sede_id, v_p)
    when 'ma_extintores' then fn_hab_ev_ma_extintores(v_clinica, p_sede_id, v_p)
    when 'inv_registro_sanitario' then fn_hab_ev_inv_registro_sanitario(v_clinica, p_sede_id, v_p)
    when 'inv_lotes_vencidos' then fn_hab_ev_inv_lotes_vencidos(v_clinica, p_sede_id, v_p)
    when 'sistema_consentimientos' then fn_hab_ev_sistema_consentimientos(v_clinica, p_sede_id, v_p)
    when 'sistema_historia_clinica' then fn_hab_ev_sistema_historia_clinica(v_clinica, p_sede_id, v_p)
  end || jsonb_build_object('fuente', p_fuente);
end;
$$;

comment on function fn_hab_resumen_evidencia(text, uuid, jsonb) is
  'Resumen vivo de una fuente de evidencia de otro módulo. security definer: eleva para LEER agregados de RRHH/Medio Ambiente/Inventario/Tratamientos que el usuario de Habilitación puede no tener; exige habilitacion/VIEW + gestión y filtra por clinica_actual() y la sede. Nunca devuelve filas crudas.';

revoke execute on function fn_hab_hoy() from public, anon;
grant execute on function fn_hab_hoy() to authenticated;
revoke execute on function fn_hab_ev_rrhh_talento_humano(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_ma_temperatura_nevera(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_ma_temperatura_ambiente(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_ma_residuos(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_ma_limpieza(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_ma_extintores(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_inv_registro_sanitario(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_inv_lotes_vencidos(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_sistema_consentimientos(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_ev_sistema_historia_clinica(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_hab_resumen_evidencia(text, uuid, jsonb) from public, anon;
grant execute on function fn_hab_resumen_evidencia(text, uuid, jsonb) to authenticated;
revoke execute on function fn_hab_evidencia_validar_referencia() from public, anon, authenticated;

-- ============================================================
-- 4. Protocolos de habilitación (tipos de documento normativo)
-- ============================================================
-- Nombres tomados del texto de 11.1 (no inventados); el código lleva el
-- prefijo HAB_. Se gestionan desde Habilitación, no desde RRHH.
insert into tipos_documento_normativo (codigo, nombre, categoria, orden) values
  ('HAB_POLITICA_SEGURIDAD_PACIENTE', 'Política de seguridad del paciente', 'habilitacion', 101),
  ('HAB_CONSENTIMIENTO_INFORMADO', 'Procedimiento de consentimiento informado', 'habilitacion', 102),
  ('HAB_GUIAS_PRACTICA_CLINICA', 'Guías de práctica clínica, procedimientos y protocolos de atención', 'habilitacion', 103),
  ('HAB_LIMPIEZA_DESINFECCION', 'Aseo, limpieza y desinfección de áreas y superficies', 'habilitacion', 104),
  ('HAB_BIOSEGURIDAD', 'Bioseguridad', 'habilitacion', 105),
  ('HAB_DERRAMES', 'Descontaminación por derrames de sangre u otros fluidos corporales', 'habilitacion', 106),
  ('HAB_REANIMACION', 'Procedimiento de reanimación cerebro cardio pulmonar', 'habilitacion', 107),
  ('HAB_LAVADO_MANOS', 'Protocolo de lavado de manos o higienización', 'habilitacion', 108),
  ('HAB_PROCESOS_MEDICAMENTOS', 'Procesos de medicamentos, dispositivos médicos e insumos (selección, adquisición, transporte, recepción, almacenamiento, conservación)', 'habilitacion', 109),
  ('HAB_FARMACO_TECNO_VIGILANCIA', 'Programas de farmacovigilancia, tecnovigilancia y reactivovigilancia', 'habilitacion', 110),
  ('HAB_MANTENIMIENTO_EQUIPOS', 'Programa de mantenimiento preventivo de equipos biomédicos', 'habilitacion', 111)
on conflict (codigo) do nothing;

-- Políticas: Habilitación ve y carga SOLO su categoría; RRHH sigue igual
-- para las suyas. Los de habilitación no se borran (ni admin): se sube
-- una versión nueva.
create or replace function fn_tipo_normativo_es_habilitacion(p_tipo uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from tipos_documento_normativo where id = p_tipo and categoria = 'habilitacion') $$;

create policy "documentos_normativos_select_habilitacion" on documentos_normativos
  for select using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'VIEW')
    and fn_tipo_normativo_es_habilitacion(tipo_documento_id)
  );

create policy "documentos_normativos_insert_habilitacion" on documentos_normativos
  for insert with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
    and fn_tipo_normativo_es_habilitacion(tipo_documento_id)
    and storage_path like clinica_id::text || '/protocolos/%'
  );

-- RRHH no carga protocolos de habilitación por su pantalla (su política de
-- insert no miraba la categoría).
drop policy "documentos_normativos_insert_con_permiso" on documentos_normativos;
create policy "documentos_normativos_insert_con_permiso" on documentos_normativos
  for insert with check (
    clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE')
    and not fn_tipo_normativo_es_habilitacion(tipo_documento_id)
  );

drop policy "documentos_normativos_delete_admin" on documentos_normativos;
create policy "documentos_normativos_delete_admin" on documentos_normativos
  for delete using (
    clinica_id = clinica_actual() and es_admin()
    and not fn_tipo_normativo_es_habilitacion(tipo_documento_id)
  );

-- ============================================================
-- 5. Versión asignada por la BD para los de habilitación
-- ============================================================
-- La app de RRHH calcula max+1 antes de insertar (carrera si dos cargan a
-- la vez). Para habilitación la BD la asigna bajo un candado por
-- (clínica, tipo). security definer: debe ver TODAS las versiones aunque
-- el RLS de quien carga no las muestre.
create or replace function fn_hab_version_siguiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_tipo_normativo_es_habilitacion(new.tipo_documento_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.clinica_id::text || ':' || new.tipo_documento_id::text, 0));
  select coalesce(max(version), 0) + 1 into new.version
  from documentos_normativos
  where clinica_id = new.clinica_id and tipo_documento_id = new.tipo_documento_id;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  -- La columna trae default current_date (fecha UTC: después de las 7 p. m.
  -- ya es "mañana"); la fecha de una versión es la de Colombia.
  new.vigente_desde := fn_hab_hoy();
  return new;
end;
$$;

create trigger documentos_normativos_version_habilitacion
  before insert on documentos_normativos
  for each row execute function fn_hab_version_siguiente();

revoke execute on function fn_hab_version_siguiente() from public, anon, authenticated;

-- Los de habilitación tampoco se modifican (una versión es una foto).
create or replace function fn_hab_normativo_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if fn_tipo_normativo_es_habilitacion(old.tipo_documento_id)
     and (tg_op = 'UPDATE' or exists (select 1 from clinicas where id = old.clinica_id)) then
    raise exception 'Las versiones de un protocolo de habilitación no se modifican ni se borran: sube una versión nueva.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger documentos_normativos_habilitacion_inmutable
  before update or delete on documentos_normativos
  for each row execute function fn_hab_normativo_inmutable();

revoke execute on function fn_hab_normativo_inmutable() from public, anon, authenticated;

-- Última versión de cada protocolo de habilitación de la clínica (para el
-- selector de evidencia y la pantalla de protocolos). security invoker:
-- aplica el RLS de arriba.
create or replace view hab_protocolos_vigentes
with (security_invoker = true) as
select distinct on (d.clinica_id, d.tipo_documento_id)
  d.id, d.clinica_id, d.tipo_documento_id, t.codigo, t.nombre, d.version, d.nombre_archivo, d.storage_path,
  d.vigente_desde, d.created_by, d.created_at
from documentos_normativos d
join tipos_documento_normativo t on t.id = d.tipo_documento_id and t.categoria = 'habilitacion'
order by d.clinica_id, d.tipo_documento_id, d.version desc;

-- ============================================================
-- 3. Curaduría criterio → fuente / protocolo (global)
-- ============================================================
-- Revisada a mano contra el texto literal de 11.1 (y 11.6.2 para los
-- extintores de ambulancia). Global: sin clinica_id, sin auditoría; su
-- trazabilidad es esta migración. Se resuelve por código del criterio
-- vigente; si un código no existe la migración falla (aserción abajo).
create table hab_criterio_fuentes_sugeridas (
  id uuid primary key default gen_random_uuid(),
  criterio_id uuid not null references hab_criterios(id) on delete cascade,
  fuente_codigo text check (fuente_codigo in (
    'rrhh_talento_humano', 'ma_temperatura_nevera', 'ma_temperatura_ambiente', 'ma_residuos',
    'ma_limpieza', 'ma_extintores', 'inv_registro_sanitario', 'inv_lotes_vencidos',
    'sistema_consentimientos', 'sistema_historia_clinica'
  )),
  tipo_documento_normativo_id uuid references tipos_documento_normativo(id),
  nota text,
  constraint hab_fuente_sugerida_una check ((fuente_codigo is null) <> (tipo_documento_normativo_id is null)),
  unique nulls not distinct (criterio_id, fuente_codigo, tipo_documento_normativo_id)
);

create index idx_hab_fuentes_sugeridas_criterio on hab_criterio_fuentes_sugeridas(criterio_id);

alter table hab_criterio_fuentes_sugeridas enable row level security;
create policy "hab_criterio_fuentes_sugeridas_select" on hab_criterio_fuentes_sugeridas
  for select to authenticated using (true);

with curaduria(codigo, fuente, protocolo, nota) as (values
  ('11.1.TH.1', 'rrhh_talento_humano', null, 'Títulos: documento "Acta o diploma" de cada persona en RRHH.'),
  ('11.1.TH.2', 'rrhh_talento_humano', null, 'Tarjeta profesional o ReTHUS de cada persona en RRHH.'),
  ('11.1.MD.4.8', 'ma_temperatura_nevera', null, 'Registro diario de temperatura de las neveras (cadena de frío).'),
  ('11.1.MD.7', 'ma_temperatura_nevera', null, 'Condiciones de temperatura de almacenamiento refrigerado.'),
  ('11.1.MD.7', 'ma_temperatura_ambiente', null, 'Temperatura y humedad de los sitios de almacenamiento.'),
  ('11.1.IN.17', 'ma_residuos', null, 'Gestión de residuos: apoyo para el concepto sanitario (el concepto lo emite la autoridad sanitaria).'),
  ('11.1.IN.17', 'ma_limpieza', null, 'Orden y aseo: apoyo para el concepto sanitario.'),
  ('11.1.IN.41', 'ma_limpieza', null, 'Registros de orden, aseo, limpieza y desinfección.'),
  ('11.1.IN.49', 'ma_limpieza', null, 'Registros de orden, aseo, limpieza y desinfección.'),
  ('11.1.PP.12.2', 'ma_limpieza', null, 'Ejecución del procedimiento de aseo, limpieza y desinfección.'),
  ('11.6.2.IN.17.1', 'ma_extintores', null, 'Extintores registrados en Medio Ambiente para la sede.'),
  ('11.6.2.IN.19.1', 'ma_extintores', null, 'Extintores registrados en Medio Ambiente para la sede.'),
  ('11.1.MD.1.8', 'inv_registro_sanitario', null, 'Registro sanitario de los insumos activos en Inventario.'),
  ('11.1.MD.2.5', 'inv_registro_sanitario', null, 'Registro sanitario de los insumos activos en Inventario.'),
  ('11.1.MD.1.5', 'inv_lotes_vencidos', null, 'Fecha de vencimiento de cada lote en Inventario.'),
  ('11.1.MD.2.9', 'inv_lotes_vencidos', null, 'Fecha de vencimiento de cada lote en Inventario.'),
  ('11.1.MD.4.7', 'inv_lotes_vencidos', null, 'Control de fechas de vencimiento de lotes con existencia.'),
  ('11.1.HC.9', 'sistema_consentimientos', null, 'Consentimientos cargados por tratamiento en el software.'),
  ('11.1.PP.4.5', 'sistema_consentimientos', null, 'Funcionalidad del procedimiento de consentimiento informado.'),
  ('11.1.HC.3', 'sistema_historia_clinica', null, 'Historia clínica electrónica que no permite modificar lo guardado.'),
  ('11.1.HC.6', 'sistema_historia_clinica', null, 'Cada anotación con fecha, hora y autor.'),
  ('11.1.HC.8', 'sistema_historia_clinica', null, 'Custodia y confidencialidad con acceso por rol.'),
  ('11.1.PP.1', null, 'HAB_POLITICA_SEGURIDAD_PACIENTE', null),
  ('11.1.HC.9', null, 'HAB_CONSENTIMIENTO_INFORMADO', null),
  ('11.1.PP.4.5', null, 'HAB_CONSENTIMIENTO_INFORMADO', null),
  ('11.1.PP.6', null, 'HAB_GUIAS_PRACTICA_CLINICA', null),
  ('11.1.PP.9', null, 'HAB_GUIAS_PRACTICA_CLINICA', null),
  ('11.1.PP.12.2', null, 'HAB_LIMPIEZA_DESINFECCION', null),
  ('11.1.PP.12.5', null, 'HAB_BIOSEGURIDAD', null),
  ('11.1.PP.12.6', null, 'HAB_DERRAMES', null),
  ('11.1.PP.12.3', null, 'HAB_REANIMACION', null),
  ('11.1.MD.8', null, 'HAB_LAVADO_MANOS', null),
  ('11.1.MD.4.1', null, 'HAB_PROCESOS_MEDICAMENTOS', null),
  ('11.1.MD.4.2', null, 'HAB_PROCESOS_MEDICAMENTOS', null),
  ('11.1.MD.4.3', null, 'HAB_PROCESOS_MEDICAMENTOS', null),
  ('11.1.MD.4.4', null, 'HAB_PROCESOS_MEDICAMENTOS', null),
  ('11.1.MD.4.5', null, 'HAB_PROCESOS_MEDICAMENTOS', null),
  ('11.1.MD.4.6', null, 'HAB_PROCESOS_MEDICAMENTOS', null),
  ('11.1.MD.6', null, 'HAB_FARMACO_TECNO_VIGILANCIA', null),
  ('11.1.DO.2.1', null, 'HAB_MANTENIMIENTO_EQUIPOS', null)
),
resuelta as (
  select c.id as criterio_id, k.fuente, t.id as tipo_id, k.nota, k.codigo
  from curaduria k
  left join hab_criterios c on c.codigo = k.codigo and c.vigente_hasta is null
  left join tipos_documento_normativo t on t.codigo = k.protocolo
)
insert into hab_criterio_fuentes_sugeridas (criterio_id, fuente_codigo, tipo_documento_normativo_id, nota)
select criterio_id, fuente, tipo_id, nota from resuelta;

-- Aserción: los 40 renglones resolvieron (un código mal escrito haría
-- fallar el insert por criterio_id null, pero se deja explícito).
do $$
begin
  if (select count(*) from hab_criterio_fuentes_sugeridas) <> 40 then
    raise exception 'Curaduría de fuentes sugeridas incompleta: % de 40.', (select count(*) from hab_criterio_fuentes_sugeridas);
  end if;
end;
$$;
