-- ============================================================
-- 0079 · SG-SST F8 · Alertas diarias e insignia del menú
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F8. Mismo patrón que
-- Habilitación (0070): el cron (service role) lee los ítems con un umbral
-- alcanzado y NO avisado, manda un correo por clínica y registra lo
-- avisado; si un día falla, al siguiente sale, y nunca se duplica.
--   - Reporte a la ARL/EPS y la investigación: todas las clínicas con el
--     módulo (son plazos legales; los eventos son del plan Gratis).
--   - Lo demás (acciones, exámenes periódicos, plan anual, licencia del
--     responsable, periodos de comité, autoevaluación y registro anual):
--     solo con el feature `gestion`.
-- Las vacunas siguen en las alertas de RRHH. El aviso de la ARL de RRHH
-- se retira (lo cubre este, con festivos y una sola vez por plazo).

-- ============================================================
-- 1. Fechas anuales parametrizables (registro de la autoevaluación)
-- ============================================================
create table sst_fechas_anuales (
  anio int primary key check (anio between 2019 and 2100),
  fecha_limite_registro date not null,
  fuente text not null check (length(fuente) <= 300),
  verificado boolean not null default false
);
alter table sst_fechas_anuales enable row level security;
create policy "sst_fechas_anuales_select" on sst_fechas_anuales for select to authenticated using (true);

insert into sst_fechas_anuales (anio, fecha_limite_registro, fuente) values
  (2026, '2026-07-31', 'Circular 027 de 2026 del Ministerio del Trabajo (registro en el aplicativo del SGRL; por cotejar)');

-- ============================================================
-- 2. Registro de lo avisado
-- ============================================================
create table sst_alertas_enviadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  objeto_tipo text not null check (length(objeto_tipo) <= 60),
  objeto_id uuid not null,
  umbral_dias int not null,
  destinatarios text[] not null default '{}',
  proveedor_id text,
  created_at timestamptz not null default now(),
  unique (objeto_tipo, objeto_id, umbral_dias)
);
create index idx_sst_alertas_enviadas_clinica on sst_alertas_enviadas(clinica_id, created_at desc);
alter table sst_alertas_enviadas enable row level security;
-- Sin insert/update/delete para usuarios: solo el cron (service role).
create policy "sst_alertas_enviadas_select" on sst_alertas_enviadas
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));

-- ============================================================
-- 3. Clínicas con el módulo (y si tienen gestión)
-- ============================================================
create or replace function fn_sst_clinicas_alertas()
returns table (clinica_id uuid, gestion boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
    coalesce(
      (select o.incluido from clinica_feature_overrides o
        where o.clinica_id = c.id and o.modulo_id = m.id and o.feature_codigo = 'gestion'
          and (o.expira_at is null or o.expira_at > now())
        order by o.created_at desc limit 1),
      (select pf.incluido from plan_features pf
        where pf.plan_id = c.plan_id and pf.modulo_id = m.id and pf.feature_codigo = 'gestion'),
      false)
  from clinicas c
  join modulos m on m.codigo = 'sst'
  join clinica_modulos cm on cm.clinica_id = c.id and cm.modulo_id = m.id and cm.activo
  where c.activo;
$$;

create or replace function fn_sst_destinatarios(p_clinica_id uuid)
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
      join modulos m on m.id = rmp.modulo_id and m.codigo = 'sst'
      join permisos p on p.id = rmp.permiso_id and p.codigo = 'VIEW'
      where rmp.rol_id = u.rol_id and rmp.concedido
    ));
$$;

-- ============================================================
-- 4. Ítems por avisar
-- ============================================================
-- objeto_id identifica QUÉ se avisa; cuando la fecha de un mismo objeto
-- puede cambiar (licencia renovada, registro de cada año) el tipo lleva la
-- fecha o el año, para que el aviso nuevo no choque con el viejo. El
-- examen periódico se ancla al último examen: uno nuevo = aviso nuevo.
create or replace function fn_sst_alertas_pendientes(p_clinica_id uuid, p_gestion boolean, p_hoy date default null)
returns table (
  objeto_tipo text,
  objeto_id uuid,
  umbrales int[],
  fecha date,
  dias int,
  titulo text,
  detalle text,
  ruta text
)
language sql
stable
security definer
set search_path = public
as $$
  with hoy as (select coalesce(p_hoy, (now() at time zone 'America/Bogota')::date) as d),
  perfil as (select * from sst_perfil where clinica_id = p_clinica_id),
  candidatos as (
    -- Reporte a la ARL y la EPS: 2 días hábiles.
    select 'evento_reporte'::text as tipo, a.id, a.fecha_limite_reporte as fecha, array[1, 0] as umbrales,
      case a.tipo_evento when 'enfermedad_laboral' then 'Reportar la enfermedad laboral a la ARL y la EPS'
        else 'Reportar el accidente a la ARL y la EPS (FURAT)' end as titulo,
      concat_ws(' · ', e.nombre, 'evento del ' || to_char(a.fecha, 'DD/MM/YYYY')) as detalle,
      '/sst/eventos/' || a.id as ruta
    from accidentes_trabajo a
    left join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.clinica_id = p_clinica_id
      and a.tipo_evento in ('accidente', 'enfermedad_laboral')
      and not a.reportado_arl
      and a.fecha >= hoy.d - 60

    union all
    -- Investigación: 15 días (incidentes y accidentes).
    select 'evento_investigacion', a.id, a.fecha_limite_investigacion, array[5, 0],
      'Terminar la investigación del ' || case a.tipo_evento when 'incidente' then 'incidente' when 'enfermedad_laboral' then 'caso de enfermedad laboral' else 'accidente' end,
      concat_ws(' · ', e.nombre, 'evento del ' || to_char(a.fecha, 'DD/MM/YYYY')),
      '/sst/eventos/' || a.id
    from accidentes_trabajo a
    left join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.clinica_id = p_clinica_id
      and a.fecha >= hoy.d - 90
      and not exists (select 1 from sst_investigaciones i where i.accidente_id = a.id and i.estado = 'cerrada')

    union all
    -- Acciones (de investigaciones, matriz o autoevaluación).
    select 'accion', x.id, x.fecha_compromiso, array[7, 0],
      case x.origen when 'matriz' then 'Medida de intervención' when 'autoevaluacion' then 'Acción de mejora (estándares)' else 'Acción del plan' end,
      concat_ws(' · ', left(x.descripcion, 140), 'responsable: ' || u.nombre),
      case x.origen when 'investigacion' then coalesce('/sst/eventos/' || (select i.accidente_id from sst_investigaciones i where i.id = x.origen_id), '/sst/eventos')
        when 'matriz' then '/sst/peligros' when 'autoevaluacion' then '/sst/estandares' else '/sst' end
    from sst_acciones x
    left join usuarios u on u.id = x.responsable_id
    where p_gestion and x.clinica_id = p_clinica_id and x.estado <> 'cerrada'

    union all
    -- Examen periódico según el profesiograma.
    select 'examen_periodico', ex.doc_id, (ex.fecha_evento + make_interval(months => ec.periodicidad_meses))::date, array[30, 0],
      'Examen médico ocupacional periódico',
      concat_ws(' · ', emp.nombre, cg.nombre, 'último: ' || to_char(ex.fecha_evento, 'DD/MM/YYYY')),
      '/sst/personas'
    from empleados emp
    join lateral (
      select h.cargo_id from historial_cargos_empleado h
      where h.empleado_id = emp.id order by h.fecha_inicio desc, h.created_at desc limit 1
    ) hc on true
    join sst_examenes_cargo ec on ec.cargo_id = hc.cargo_id
    left join cargos cg on cg.id = hc.cargo_id
    join lateral (
      select d.id as doc_id, d.fecha_evento
      from documentos_empleado d
      join tipos_examen_ocupacional t on t.id = d.tipo_examen_id
      where d.empleado_id = emp.id and d.tipo = 'examen_ocupacional'
        and d.fecha_evento is not null and t.codigo in ('INGRESO', 'PERIODICO')
      order by d.fecha_evento desc limit 1
    ) ex on true
    where p_gestion and emp.clinica_id = p_clinica_id and emp.activo

    union all
    -- Actividades del plan anual del mes que termina.
    select 'plan_actividad', pa.id, (make_date(pa.anio, pa.mes, 1) + interval '1 month - 1 day')::date, array[7, 0],
      'Actividad del plan anual',
      concat_ws(' · ', left(pa.actividad, 140), 'responsable: ' || u.nombre),
      '/sst/plan'
    from sst_plan_actividades pa
    left join usuarios u on u.id = pa.responsable_id
    cross join hoy
    where p_gestion and pa.clinica_id = p_clinica_id and pa.estado = 'pendiente'
      and pa.anio >= extract(year from hoy.d)::int - 1

    union all
    -- Licencia en SST del responsable.
    select 'licencia:' || p.responsable_licencia_vence, p.id, p.responsable_licencia_vence, array[60, 30, 0],
      'Vence la licencia en SST del responsable',
      p.responsable_nombre,
      '/sst'
    from perfil p
    where p_gestion and p.responsable_licencia_vence is not null

    union all
    -- Periodo vigente de cada comité.
    select 'comite', c.id, c.fecha_fin, array[60, 30, 0],
      case c.tipo when 'vigia' then 'Termina el periodo del vigía de SST' when 'copasst' then 'Termina el periodo del COPASST'
        else 'Termina el periodo del Comité de Convivencia' end,
      'Conforma el nuevo periodo (elección y acta) antes del vencimiento',
      '/sst/plan?tab=comites'
    from (
      select distinct on (tipo) * from sst_comites
      where clinica_id = p_clinica_id order by tipo, fecha_fin desc
    ) c
    where p_gestion

    union all
    -- Autoevaluación de estándares del año (Res. 0312: cada año).
    select 'autoevaluacion:' || extract(year from hoy.d)::int, p_clinica_id, make_date(extract(year from hoy.d)::int, 12, 31), array[60, 30, 7],
      'Autoevaluación de estándares mínimos ' || extract(year from hoy.d)::int,
      'Califica los estándares y arma el plan de mejoramiento',
      '/sst/estandares'
    from hoy
    where p_gestion
      and coalesce((select modo from perfil), 'empleador') = 'empleador'
      and not exists (
        select 1 from sst_autoevaluaciones s
        where s.clinica_id = p_clinica_id and s.anio = extract(year from hoy.d)::int and s.estado = 'cerrada'
      )

    union all
    -- Registro anual de la autoevaluación y el plan ante el Ministerio.
    select 'registro_anual:' || f.anio, p_clinica_id, f.fecha_limite_registro, array[30, 7, 0],
      'Registrar la autoevaluación y el plan de mejoramiento ante el Ministerio del Trabajo',
      f.fuente,
      '/sst/estandares'
    from sst_fechas_anuales f
    cross join hoy
    where p_gestion
      and coalesce((select modo from perfil), 'empleador') = 'empleador'
      and f.fecha_limite_registro between hoy.d - 7 and hoy.d + 60
  )
  select k.tipo, k.id, pendientes.u, k.fecha, (k.fecha - hoy.d)::int, k.titulo, k.detalle, k.ruta
  from candidatos k
  cross join hoy
  cross join lateral (
    select array_agg(t order by t desc) as u
    from unnest(k.umbrales) t
    where (k.fecha - hoy.d) <= t
      and not exists (
        select 1 from sst_alertas_enviadas a
        where a.objeto_tipo = k.tipo and a.objeto_id = k.id and a.umbral_dias = t
      )
  ) pendientes
  where pendientes.u is not null and k.fecha is not null
  order by k.fecha, k.titulo;
$$;

comment on function fn_sst_alertas_pendientes(uuid, boolean, date) is
  'SG-SST F8: ítems con un umbral de aviso alcanzado y no avisado. Solo el cron (service role).';

revoke execute on function fn_sst_clinicas_alertas() from public, anon, authenticated;
revoke execute on function fn_sst_destinatarios(uuid) from public, anon, authenticated;
revoke execute on function fn_sst_alertas_pendientes(uuid, boolean, date) from public, anon, authenticated;
grant execute on function fn_sst_clinicas_alertas() to service_role;
grant execute on function fn_sst_destinatarios(uuid) to service_role;
grant execute on function fn_sst_alertas_pendientes(uuid, boolean, date) to service_role;

-- ============================================================
-- 5. Insignia del menú: reportes y acciones vencidos o por vencer
--    (RLS del usuario: invoker).
-- ============================================================
create or replace function fn_sst_conteo_urgentes()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d)
  select (
    select count(*)::int from accidentes_trabajo a, hoy
    where a.clinica_id = clinica_actual()
      and a.tipo_evento in ('accidente', 'enfermedad_laboral')
      and not a.reportado_arl
      and a.fecha >= hoy.d - 60
  ) + (
    select count(*)::int from accidentes_trabajo a, hoy
    where a.clinica_id = clinica_actual()
      and a.fecha >= hoy.d - 90
      and a.fecha_limite_investigacion < hoy.d
      and not exists (select 1 from sst_investigaciones i where i.accidente_id = a.id and i.estado = 'cerrada')
  ) + (
    select count(*)::int from sst_acciones x, hoy
    where x.clinica_id = clinica_actual() and x.estado <> 'cerrada' and x.fecha_compromiso < hoy.d
  );
$$;
