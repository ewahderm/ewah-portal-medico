-- ============================================================
-- 0087 · SG-SST · Correcciones de la auditoría
-- ============================================================
-- Corrige lo que 0072–0079 dejaron mal (esas migraciones ya se aplicaron y
-- no se editan: todo va aquí con create or replace / alter).
--   1. Alertas y insignia: cada reporte pendiente (ARL, EPS y, si el evento
--      es grave o mortal, MinTrabajo) alerta por su cuenta con su propia
--      llave de idempotencia; un evento cerrado no alerta (igual que
--      lib/sst/plazos.ts → pendientesEvento y lib/sst/tablero.ts).
--   2. Autoevaluación: el grupo (7/21/60) lo calcula la BD con la misma
--      regla de lib/sst/grupo.ts (docs/sgsst §3) y rechaza uno menor.
--   3. Ausentismo con la misma base (días hábiles) en numerador y
--      denominador (Res. 0312, Art. 30) y días de incapacidad por AT desde
--      incapacidades_empleado cuando existen.
--   4. La autoevaluación guarda una FOTO de cada estándar (nombre, peso…):
--      cerrada, no cambia aunque el catálogo se corrija después.
--   5. Capacitaciones: la asistencia y el cambio a "realizada" son una sola
--      operación atómica; solo se agrega o quita asistencia mientras la
--      capacitación está programada.
--   6. Fechas anuales del registro 2027–2030.
--   7. Storage: subir archivos de gestión exige el plan Pro (gestion).

-- ============================================================
-- 1. Alertas y insignia: un aviso por cada reporte pendiente
-- ============================================================
-- Llaves (objeto_tipo, objeto_id, umbral): 'evento_reporte' sigue siendo la
-- de la ARL (lo ya avisado no se repite); EPS y MinTrabajo tienen la suya.
-- Antes el aviso 'evento_reporte' decía "a la ARL y la EPS", así que lo ya
-- avisado también cuenta como avisado para la EPS (no se duplica el correo).
insert into sst_alertas_enviadas (clinica_id, objeto_tipo, objeto_id, umbral_dias, destinatarios, proveedor_id, created_at)
select clinica_id, 'evento_reporte_eps', objeto_id, umbral_dias, destinatarios, proveedor_id, created_at
from sst_alertas_enviadas
where objeto_tipo = 'evento_reporte'
on conflict (objeto_tipo, objeto_id, umbral_dias) do nothing;

-- security definer: lo llama solo el cron (service role) y lee de todas las
-- clínicas; se le revoca la ejecución a anon/authenticated (ver abajo).
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
    -- Reporte a la ARL: 2 días hábiles. Un evento cerrado no alerta.
    select 'evento_reporte'::text as tipo, a.id, a.fecha_limite_reporte as fecha, array[1, 0] as umbrales,
      case a.tipo_evento when 'enfermedad_laboral' then 'Reportar la enfermedad laboral a la ARL'
        else 'Reportar el accidente a la ARL (FURAT)' end as titulo,
      concat_ws(' · ', e.nombre, 'evento del ' || to_char(a.fecha, 'DD/MM/YYYY')) as detalle,
      '/sst/eventos/' || a.id as ruta
    from accidentes_trabajo a
    left join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.clinica_id = p_clinica_id
      and a.tipo_evento in ('accidente', 'enfermedad_laboral')
      and not a.reportado_arl
      and not a.cerrado
      and a.fecha >= hoy.d - 60

    union all
    -- Reporte a la EPS: mismo plazo, aviso propio.
    select 'evento_reporte_eps', a.id, a.fecha_limite_reporte, array[1, 0],
      case a.tipo_evento when 'enfermedad_laboral' then 'Reportar la enfermedad laboral a la EPS'
        else 'Reportar el accidente a la EPS' end,
      concat_ws(' · ', e.nombre, 'evento del ' || to_char(a.fecha, 'DD/MM/YYYY')),
      '/sst/eventos/' || a.id
    from accidentes_trabajo a
    left join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.clinica_id = p_clinica_id
      and a.tipo_evento in ('accidente', 'enfermedad_laboral')
      and not a.reportado_eps
      and not a.cerrado
      and a.fecha >= hoy.d - 60

    union all
    -- Reporte a MinTrabajo: solo si el evento es grave o mortal.
    select 'evento_reporte_mintrabajo', a.id, a.fecha_limite_reporte, array[1, 0],
      case a.tipo_evento when 'enfermedad_laboral' then 'Reportar la enfermedad laboral a MinTrabajo'
        else 'Reportar el accidente grave o mortal a MinTrabajo' end,
      concat_ws(' · ', e.nombre, 'evento del ' || to_char(a.fecha, 'DD/MM/YYYY')),
      '/sst/eventos/' || a.id
    from accidentes_trabajo a
    left join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.clinica_id = p_clinica_id
      and a.tipo_evento in ('accidente', 'enfermedad_laboral')
      and a.gravedad in ('grave', 'mortal')
      and not a.reportado_mintrabajo
      and not a.cerrado
      and a.fecha >= hoy.d - 60

    union all
    -- Investigación: 15 días (incidentes y accidentes). Un evento cerrado
    -- no alerta (pendientesEvento devuelve [] para los cerrados).
    select 'evento_investigacion', a.id, a.fecha_limite_investigacion, array[5, 0],
      'Terminar la investigación del ' || case a.tipo_evento when 'incidente' then 'incidente' when 'enfermedad_laboral' then 'caso de enfermedad laboral' else 'accidente' end,
      concat_ws(' · ', e.nombre, 'evento del ' || to_char(a.fecha, 'DD/MM/YYYY')),
      '/sst/eventos/' || a.id
    from accidentes_trabajo a
    left join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.clinica_id = p_clinica_id
      and not a.cerrado
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

-- create or replace conserva los privilegios, pero se repiten por claridad.
revoke execute on function fn_sst_alertas_pendientes(uuid, boolean, date) from public, anon, authenticated;
grant execute on function fn_sst_alertas_pendientes(uuid, boolean, date) to service_role;

-- Insignia del menú (RLS del usuario: invoker). Cuenta cada reporte
-- pendiente (ARL, EPS, MinTrabajo si es grave o mortal) de los eventos
-- abiertos, las investigaciones vencidas de eventos abiertos y las
-- acciones vencidas.
create or replace function fn_sst_conteo_urgentes()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d)
  select (
    select coalesce(sum(
      (not a.reportado_arl)::int
      + (not a.reportado_eps)::int
      + coalesce(a.gravedad in ('grave', 'mortal') and not a.reportado_mintrabajo, false)::int
    ), 0)::int
    from accidentes_trabajo a, hoy
    where a.clinica_id = clinica_actual()
      and a.tipo_evento in ('accidente', 'enfermedad_laboral')
      and not a.cerrado
      and a.fecha >= hoy.d - 60
  ) + (
    select count(*)::int from accidentes_trabajo a, hoy
    where a.clinica_id = clinica_actual()
      and not a.cerrado
      and a.fecha >= hoy.d - 90
      and a.fecha_limite_investigacion < hoy.d
      and not exists (select 1 from sst_investigaciones i where i.accidente_id = a.id and i.estado = 'cerrada')
  ) + (
    select count(*)::int from sst_acciones x, hoy
    where x.clinica_id = clinica_actual() and x.estado <> 'cerrada' and x.fecha_compromiso < hoy.d
  );
$$;

-- ============================================================
-- 2. Fechas anuales del registro (2027–2030)
-- ============================================================
-- Sin fila para el año, el aviso del registro (y el pendiente del tablero)
-- desaparecía en silencio al cambiar de año. Se siembra 2027–2030 con la
-- misma regla de la Circular 027 de 2026 (31 de julio). NO es el texto de
-- cada circular: queda verificado = false y la fuente lo dice; cuando el
-- Ministerio publique la circular de un año se corrige la fila. Además, el
-- tablero muestra un aviso visible si el año en curso no tiene fecha.
insert into sst_fechas_anuales (anio, fecha_limite_registro, fuente, verificado) values
  (2027, '2027-07-31', 'Regla de la Circular 027 de 2026 (31 de julio); por cotejar con la circular de 2027', false),
  (2028, '2028-07-31', 'Regla de la Circular 027 de 2026 (31 de julio); por cotejar con la circular de 2028', false),
  (2029, '2029-07-31', 'Regla de la Circular 027 de 2026 (31 de julio); por cotejar con la circular de 2029', false),
  (2030, '2030-07-31', 'Regla de la Circular 027 de 2026 (31 de julio); por cotejar con la circular de 2030', false)
on conflict (anio) do nothing;

-- ============================================================
-- 3. Autoevaluación: grupo calculado por la BD
-- ============================================================
create or replace function fn_sst_rango_clase(p_codigo text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_codigo when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 when 'V' then 5 end;
$$;

-- Misma regla que lib/sst/grupo.ts (docs/sgsst §3): trabajadores =
-- dependientes + sin categoría + otros del perfil + contratistas (salvo
-- exclusión justificada); clase = la MAYOR entre el código de actividad de
-- la clínica (primer dígito), la clase de la clínica y la de los cargos
-- vigentes. Devuelve '60' (clase IV/V o más de 50), '21' (11 a 50), '7'
-- (hasta 10) o null si no se puede saber (sin trabajadores, independiente
-- sin trabajadores, o sin clase de riesgo).
-- security definer: lee RRHH (empleados, cargos) aunque quien inicia la
-- autoevaluación no tenga permiso de RRHH; solo devuelve un código de grupo.
-- Sin ejecución para usuarios: la llama fn_sst_iniciar_autoevaluacion.
create or replace function fn_sst_grupo_requerido(p_clinica_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_perfil sst_perfil%rowtype;
  v_dep int;
  v_con int;
  v_sin int;
  v_trab int;
  v_clase int;
  v_actividad int;
  v_clinica_clase int;
  v_cargos int;
begin
  select * into v_perfil from sst_perfil where clinica_id = p_clinica_id;
  select count(*) filter (where e.categoria_contrato = 'laboral'),
         count(*) filter (where e.categoria_contrato = 'servicios'),
         count(*) filter (where e.categoria_contrato is null)
    into v_dep, v_con, v_sin
  from empleados e
  where e.clinica_id = p_clinica_id and e.activo;
  v_trab := v_dep + v_sin + coalesce(v_perfil.otros_trabajadores, 0)
            + case when coalesce(v_perfil.excluye_contratistas, false) then 0 else v_con end;
  if v_trab <= 0 then
    return null;
  end if;

  select case when c.codigo_actividad_economica ~ '^[1-5][0-9]{6}$' then left(c.codigo_actividad_economica, 1)::int end,
         (select fn_sst_rango_clase(cr.codigo) from clases_riesgo cr where cr.id = c.clase_riesgo_id)
    into v_actividad, v_clinica_clase
  from clinicas c where c.id = p_clinica_id;
  select max(fn_sst_rango_clase(cr.codigo)) into v_cargos
  from empleados e
  join lateral (
    select h.cargo_id from historial_cargos_empleado h
    where h.empleado_id = e.id order by h.fecha_inicio desc, h.created_at desc limit 1
  ) hc on true
  join cargos cg on cg.id = hc.cargo_id
  join clases_riesgo cr on cr.id = cg.clase_riesgo_id
  where e.clinica_id = p_clinica_id and e.activo;
  v_clase := greatest(v_actividad, v_clinica_clase, v_cargos);
  if v_clase is null then
    return null;
  end if;

  if v_clase >= 4 or v_trab > 50 then return '60'; end if;
  if v_trab > 10 then return '21'; end if;
  return '7';
end;
$$;

revoke execute on function fn_sst_grupo_requerido(uuid) from public, anon, authenticated;
grant execute on function fn_sst_grupo_requerido(uuid) to service_role;

-- ============================================================
-- 4. Foto de cada estándar en la autoevaluación
-- ============================================================
alter table sst_autoevaluacion_items
  add column snap_ciclo text,
  add column snap_componente text,
  add column snap_nombre text,
  add column snap_descripcion text,
  add column snap_peso numeric(5, 2),
  add column snap_orden int,
  add column snap_verificado boolean;

-- Lo ya existente (abiertas y cerradas) toma el catálogo de hoy: es lo
-- mejor que hay; desde aquí quedan congeladas.
update sst_autoevaluacion_items i
set snap_ciclo = e.ciclo, snap_componente = e.componente, snap_nombre = e.nombre, snap_descripcion = e.descripcion,
    snap_peso = e.peso, snap_orden = e.orden, snap_verificado = e.verificado
from sst_estandares e
where e.codigo = i.estandar_codigo;

alter table sst_autoevaluacion_items
  alter column snap_ciclo set not null,
  alter column snap_componente set not null,
  alter column snap_nombre set not null,
  alter column snap_descripcion set not null,
  alter column snap_peso set not null,
  alter column snap_orden set not null,
  alter column snap_verificado set not null,
  add constraint sst_item_snap_peso_positivo check (snap_peso > 0);

-- Ítems: solo se editan mientras la autoevaluación está abierta, y solo el
-- estado y sus textos. La foto del estándar solo puede cambiar para quedar
-- igual al catálogo (la refresca el cierre); nadie la inventa.
create or replace function fn_sst_item_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.autoevaluacion_id <> old.autoevaluacion_id or new.estandar_codigo <> old.estandar_codigo or new.clinica_id <> old.clinica_id then
    raise exception 'El ítem no cambia de estándar ni de autoevaluación.';
  end if;
  if (select estado from sst_autoevaluaciones where id = new.autoevaluacion_id) <> 'abierta' then
    raise exception 'La autoevaluación está cerrada: no se modifica.';
  end if;
  if (new.snap_ciclo, new.snap_componente, new.snap_nombre, new.snap_descripcion, new.snap_peso, new.snap_orden, new.snap_verificado)
     is distinct from
     (old.snap_ciclo, old.snap_componente, old.snap_nombre, old.snap_descripcion, old.snap_peso, old.snap_orden, old.snap_verificado)
     and not exists (
       select 1 from sst_estandares e
       where e.codigo = new.estandar_codigo
         and (e.ciclo, e.componente, e.nombre, e.descripcion, e.peso, e.orden, e.verificado)
           = (new.snap_ciclo, new.snap_componente, new.snap_nombre, new.snap_descripcion, new.snap_peso, new.snap_orden, new.snap_verificado)
     ) then
    raise exception 'La foto del estándar no se edita.';
  end if;
  return new;
end;
$$;

-- Al cerrar, la foto se actualiza al catálogo vigente (por si se corrigió un
-- texto mientras estaba abierta) y desde ahí queda fija.
-- security definer: quien cierra (APPROVE) puede no tener EDIT sobre los
-- ítems, y el UPDATE de la foto pasaría por la RLS de sst_items_update. Solo
-- toca autoevaluaciones ABIERTAS de la clínica del usuario.
create or replace function fn_sst_refrescar_foto(p_autoevaluacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid;
  v_estado text;
begin
  select a.clinica_id, a.estado into v_clinica, v_estado from sst_autoevaluaciones a where a.id = p_autoevaluacion_id;
  if not found or v_estado <> 'abierta' or v_clinica is distinct from clinica_actual() then
    return;
  end if;
  update sst_autoevaluacion_items i
  set snap_ciclo = e.ciclo, snap_componente = e.componente, snap_nombre = e.nombre, snap_descripcion = e.descripcion,
      snap_peso = e.peso, snap_orden = e.orden, snap_verificado = e.verificado
  from sst_estandares e
  where e.codigo = i.estandar_codigo
    and i.autoevaluacion_id = p_autoevaluacion_id
    and (i.snap_ciclo, i.snap_componente, i.snap_nombre, i.snap_descripcion, i.snap_peso, i.snap_orden, i.snap_verificado)
        is distinct from (e.ciclo, e.componente, e.nombre, e.descripcion, e.peso, e.orden, e.verificado);
end;
$$;

revoke execute on function fn_sst_refrescar_foto(uuid) from public, anon;
grant execute on function fn_sst_refrescar_foto(uuid) to authenticated;

-- Cabecera: el puntaje se calcula con la FOTO (snap_peso), no con el
-- catálogo vivo.
create or replace function fn_sst_autoevaluacion_cierre()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pendientes int;
  v_total numeric;
  v_logrado numeric;
begin
  if old.estado = 'cerrada' then
    raise exception 'La autoevaluación está cerrada: no se modifica.';
  end if;
  if new.clinica_id <> old.clinica_id or new.anio <> old.anio or new.grupo <> old.grupo then
    raise exception 'El año y el grupo de la autoevaluación no cambian.';
  end if;
  if new.estado = 'abierta' then
    new.puntaje := null;
    new.nivel := null;
    new.fecha_cierre := null;
    new.cerrada_por := null;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') and not has_permission('sst', 'APPROVE') then
    raise exception 'No tienes permiso para cerrar la autoevaluación.';
  end if;
  perform fn_sst_refrescar_foto(new.id);
  select count(*) filter (where i.estado = 'pendiente'),
         sum(i.snap_peso),
         coalesce(sum(i.snap_peso) filter (where i.estado in ('cumple', 'no_aplica')), 0)
    into v_pendientes, v_total, v_logrado
  from sst_autoevaluacion_items i
  where i.autoevaluacion_id = new.id;
  if v_pendientes > 0 then
    raise exception 'Quedan % ítems sin calificar.', v_pendientes;
  end if;
  new.puntaje := round(v_logrado / v_total * 100, 2);
  new.nivel := case when new.puntaje < 60 then 'critico' when new.puntaje <= 85 then 'moderado' else 'aceptable' end;
  new.fecha_cierre := now();
  new.cerrada_por := auth.uid();
  return new;
end;
$$;

-- El grupo lo decide la BD (fn_sst_grupo_requerido): p_grupo se conserva por
-- compatibilidad con el código anterior, y se rechaza si es menor al que
-- corresponde (uno mayor sí se admite: es más exigente, no menos).
-- security definer: crea la autoevaluación y sus ítems (no hay política de
-- insert) y lee RRHH para calcular el grupo.
create or replace function fn_sst_iniciar_autoevaluacion(p_anio int, p_grupo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_id uuid;
  v_requerido text;
begin
  if v_clinica is null or not has_permission('sst', 'CREATE') then
    raise exception 'No tienes permiso para iniciar la autoevaluación.';
  end if;
  if not has_entitlement('sst', 'gestion') then
    raise exception 'La autoevaluación de estándares está disponible en el plan Pro.';
  end if;
  if p_grupo is null or p_grupo not in ('7', '21', '60') then
    raise exception 'Grupo de estándares inválido.';
  end if;
  if p_anio is null or p_anio not between 2019 and extract(year from (now() at time zone 'America/Bogota'))::int then
    raise exception 'Año inválido.';
  end if;
  v_requerido := fn_sst_grupo_requerido(v_clinica);
  if v_requerido is null then
    raise exception 'Primero completa el diagnóstico (trabajadores y clase de riesgo): sin eso no se sabe qué grupo de estándares te corresponde.';
  end if;
  if p_grupo::int < v_requerido::int then
    raise exception 'Te corresponden % estándares: no puedes iniciar la autoevaluación con el grupo de %.', v_requerido, p_grupo;
  end if;
  insert into sst_autoevaluaciones (clinica_id, anio, grupo, created_by)
  values (v_clinica, p_anio, p_grupo, auth.uid())
  returning id into v_id;
  insert into sst_autoevaluacion_items (
    autoevaluacion_id, clinica_id, estandar_codigo,
    snap_ciclo, snap_componente, snap_nombre, snap_descripcion, snap_peso, snap_orden, snap_verificado
  )
  select v_id, v_clinica, e.codigo, e.ciclo, e.componente, e.nombre, e.descripcion, e.peso, e.orden, e.verificado
  from sst_estandares e
  where p_grupo = '60' or (p_grupo = '21' and e.en_21) or (p_grupo = '7' and e.en_7);
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe la autoevaluación de %.', p_anio;
end;
$$;

revoke execute on function fn_sst_iniciar_autoevaluacion(int, text) from public, anon;
grant execute on function fn_sst_iniciar_autoevaluacion(int, text) to authenticated;
revoke execute on function fn_sst_item_proteger() from public, anon, authenticated;
revoke execute on function fn_sst_autoevaluacion_cierre() from public, anon, authenticated;

-- ============================================================
-- 5. Indicadores: ausentismo homogéneo y severidad desde incapacidades
-- ============================================================
-- Ausentismo (Res. 0312, Art. 30): días de ausencia por incapacidad ÷ días
-- de trabajo programados. Antes el numerador sumaba días de CALENDARIO y el
-- denominador (trabajadores × días hábiles) días hábiles: podía pasar de
-- 100 %. Ahora los dos usan DÍAS HÁBILES (lunes a viernes sin festivos): el
-- numerador cuenta, por persona, los días hábiles cubiertos por sus
-- incapacidades dentro del mes (una persona con dos incapacidades que se
-- cruzan cuenta el día una sola vez) y nunca pasa del denominador.
-- Severidad: días de incapacidad por AT de CADA MES. Se prefieren las
-- incapacidades registradas en RRHH (incapacidades_empleado con
-- accidente_trabajo_id) y se reparten por días de calendario entre los
-- meses que cubren; solo si el accidente no tiene incapacidades ligadas se
-- usa accidentes_trabajo.dias_incapacidad (digitado a mano), contado desde
-- la fecha del accidente. Los días cargados siguen en el mes del accidente.
-- security definer: lee RRHH (incapacidades, empleados) aunque quien ve los
-- indicadores no tenga permiso de RRHH; solo devuelve números agregados y
-- exige sst/VIEW de la clínica del usuario.
create or replace function fn_sst_indicadores(p_anio int)
returns table (
  mes int,
  trabajadores int,
  accidentes int,
  dias_incapacidad_at int,
  dias_cargados int,
  at_mortales int,
  el_nuevas int,
  el_total int,
  dias_ausencia int,
  dias_programados int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_clinica uuid := clinica_actual();
  v_pais uuid;
  v_perfil sst_perfil%rowtype;
begin
  if v_clinica is null or not has_permission('sst', 'VIEW') then
    raise exception 'No tienes permiso para ver los indicadores del SG-SST.';
  end if;
  if p_anio is null or p_anio not between 2019 and 2100 then
    raise exception 'Año inválido.';
  end if;
  select * into v_perfil from sst_perfil where clinica_id = v_clinica;
  v_pais := fn_hab_pais_clinica(v_clinica);
  return query
  with meses as (
    select m, make_date(p_anio, m, 1) as ini, (make_date(p_anio, m, 1) + interval '1 month - 1 day')::date as fin
    from generate_series(1, 12) m
  ),
  personal as (
    select ms.m,
      (select count(*) from empleados e
        where e.clinica_id = v_clinica
          and (e.categoria_contrato = 'laboral' or (e.categoria_contrato = 'servicios' and not coalesce(v_perfil.excluye_contratistas, false)) or e.categoria_contrato is null)
          and (e.fecha_inicio_contrato is null or e.fecha_inicio_contrato <= ms.fin)
          and (e.activo or e.fecha_fin_contrato >= ms.ini))::int + coalesce(v_perfil.otros_trabajadores, 0) as n,
      (select count(*) from generate_series(ms.ini::timestamp, ms.fin::timestamp, interval '1 day') d
        where not fn_es_dia_no_habil(d::date, v_pais))::int as habiles
    from meses ms
  )
  select ms.m, p.n,
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.fecha between ms.ini and ms.fin),
    (select coalesce(sum(greatest(0, least(s.desde + s.n - 1, ms.fin) - greatest(s.desde, ms.ini) + 1)), 0)::int
      from (
        select i.fecha_inicio as desde, i.dias as n
        from incapacidades_empleado i
        join accidentes_trabajo a on a.id = i.accidente_trabajo_id
        where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and i.clinica_id = v_clinica
        union all
        select a.fecha, a.dias_incapacidad
        from accidentes_trabajo a
        where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.dias_incapacidad > 0
          and not exists (select 1 from incapacidades_empleado i where i.accidente_trabajo_id = a.id)
      ) s
      where s.desde <= ms.fin and s.desde + s.n - 1 >= ms.ini),
    (select coalesce(sum(a.dias_cargados), 0)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.fecha between ms.ini and ms.fin),
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'accidente' and a.gravedad = 'mortal' and a.fecha between ms.ini and ms.fin),
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'enfermedad_laboral' and a.fecha between ms.ini and ms.fin),
    (select count(*)::int from accidentes_trabajo a
      where a.clinica_id = v_clinica and a.tipo_evento = 'enfermedad_laboral' and a.fecha <= ms.fin
        and (not a.cerrado or a.fecha_cierre >= ms.ini)),
    (select least(count(*), p.n * p.habiles)::int
      from (
        select distinct i.empleado_id, d::date as dia
        from incapacidades_empleado i
        cross join lateral generate_series(
          greatest(i.fecha_inicio, ms.ini)::timestamp,
          least(i.fecha_inicio + i.dias - 1, ms.fin)::timestamp,
          interval '1 day') d
        where i.clinica_id = v_clinica
          and i.fecha_inicio <= ms.fin and i.fecha_inicio + i.dias - 1 >= ms.ini
          and not fn_es_dia_no_habil(d::date, v_pais)
      ) x),
    p.n * p.habiles
  from meses ms
  join personal p on p.m = ms.m
  order by ms.m;
end;
$$;

comment on function fn_sst_indicadores(int) is
  'SG-SST F7: insumos mensuales de los indicadores del Art. 30 de la Res. 0312 (solo números; ausentismo en días hábiles). Exige sst/VIEW.';

revoke execute on function fn_sst_indicadores(int) from public, anon;
grant execute on function fn_sst_indicadores(int) to authenticated;

-- ============================================================
-- 6. Capacitaciones: asistencia atómica y corregible
-- ============================================================
-- Antes la política de insert decía "mientras no esté cerrada" pero no lo
-- verificaba, y no había forma de quitar a alguien agregado por error.
drop policy "sst_asistentes_insert" on sst_capacitacion_asistentes;
create policy "sst_asistentes_insert" on sst_capacitacion_asistentes
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('sst', 'CREATE') and has_entitlement('sst', 'gestion')
    and exists (
      select 1 from sst_capacitaciones c
      where c.id = capacitacion_id and c.clinica_id = clinica_actual() and c.estado = 'programada'
    )
  );
-- Quitar a alguien solo mientras la capacitación está programada (una vez
-- realizada, la lista de asistencia es el registro y no cambia).
create policy "sst_asistentes_delete" on sst_capacitacion_asistentes
  for delete to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
    and exists (
      select 1 from sst_capacitaciones c
      where c.id = capacitacion_id and c.clinica_id = clinica_actual() and c.estado = 'programada'
    )
  );

-- La lista de asistentes queda IGUAL a p_asistentes (agrega y quita) y, si
-- p_realizada, la capacitación pasa a "realizada" en la misma transacción:
-- si algo falla no queda realizada sin asistencia y se puede reintentar.
-- security invoker: todo pasa por la RLS del usuario (EDIT + gestion para la
-- capacitación y los borrados, CREATE para los inserts).
create or replace function fn_sst_guardar_asistencia(p_capacitacion_id uuid, p_asistentes uuid[], p_realizada boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica uuid;
  v_estado text;
  v_lista uuid[] := coalesce(p_asistentes, '{}');
begin
  select c.clinica_id, c.estado into v_clinica, v_estado
  from sst_capacitaciones c where c.id = p_capacitacion_id for update;
  if not found then
    raise exception 'La capacitación no existe o no tienes permiso sobre ella.';
  end if;
  if v_estado <> 'programada' then
    raise exception 'Esta capacitación ya está cerrada: la asistencia no se modifica.';
  end if;
  delete from sst_capacitacion_asistentes a
  where a.capacitacion_id = p_capacitacion_id and a.empleado_id <> all (v_lista);
  insert into sst_capacitacion_asistentes (capacitacion_id, clinica_id, empleado_id)
  select p_capacitacion_id, v_clinica, x from (select distinct unnest(v_lista) as x) l
  on conflict (capacitacion_id, empleado_id) do nothing;
  if p_realizada then
    update sst_capacitaciones set estado = 'realizada' where id = p_capacitacion_id;
  end if;
end;
$$;

revoke execute on function fn_sst_guardar_asistencia(uuid, uuid[], boolean) from public, anon;
grant execute on function fn_sst_guardar_asistencia(uuid, uuid[], boolean) to authenticated;

-- ============================================================
-- 7. Storage: subir archivos de gestión exige el plan Pro
-- ============================================================
-- Lo único del bucket que es del plan Gratis es el informe de la
-- investigación de un evento (carpeta 'investigaciones'); el resto de lo que
-- se sube es de gestión (mismo criterio de lib/sst/subidas.ts y de
-- lib/habilitacion/subidas.ts).
drop policy "sst_storage_insert" on storage.objects;
create policy "sst_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'sst' and (storage.foldername(name))[1] = clinica_actual()::text and has_permission('sst', 'CREATE')
    and ((storage.foldername(name))[2] = 'investigaciones' or has_entitlement('sst', 'gestion'))
  );
