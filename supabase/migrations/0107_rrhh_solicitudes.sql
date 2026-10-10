-- ============================================================
-- 0107 · Recursos humanos · Solicitudes de vacaciones, permisos y reposiciones
-- ============================================================
--   1. clinicas.rrhh_sabado_laboral: si el sábado cuenta como día hábil para
--      las vacaciones. Domingos y festivos (tabla festivos) nunca cuentan.
--   2. rrhh_solicitudes: una tabla para los tres tipos:
--        vacaciones  fecha_inicio..fecha_fin, días hábiles calculados;
--        permiso     una fecha y un rango de horas;
--        reposicion  una fecha y un rango de horas para reponer permisos.
--      Estados: pendiente → aprobada | rechazada | cancelada.
--   3. Quién: el empleado vinculado a un usuario solicita para sí mismo (sin
--      necesitar acceso a RRHH); quien tiene rrhh/CREATE registra para
--      cualquier empleado (por ejemplo, los que no tienen usuario); quien
--      tiene rrhh/APPROVE (el Administrador siempre) aprueba o rechaza.
--      Nadie aprueba su propia solicitud, salvo el Administrador.
--   4. Al aprobar unas vacaciones se registran en vacaciones_empleado y
--      descuentan del saldo. Se pueden pedir y aprobar más días de los
--      acumulados (queda marcado). Al aprobar un permiso, quien aprueba
--      decide si se repone, si es remunerado sin reponer o no remunerado.

-- ============================================================
-- 1. Sábado laboral
-- ============================================================
alter table clinicas add column rrhh_sabado_laboral boolean not null default true;

-- ============================================================
-- 2. Solicitudes
-- ============================================================
create table rrhh_solicitudes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  tipo text not null check (tipo in ('vacaciones', 'permiso', 'reposicion')),
  -- Vacaciones.
  fecha_inicio date,
  fecha_fin date,
  dias numeric(6, 1),
  excede_saldo boolean not null default false,
  -- Permisos y reposiciones.
  fecha date,
  hora_inicio time,
  hora_fin time,
  horas numeric(6, 2),
  motivo text check (length(motivo) <= 500),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  -- Al aprobar un permiso.
  modalidad text check (modalidad in ('se_repone', 'remunerado', 'no_remunerado')),
  comentario_resolucion text check (length(comentario_resolucion) <= 500),
  resuelto_por uuid references usuarios(id) on delete set null,
  resuelto_en timestamptz,
  vacaciones_id uuid references vacaciones_empleado(id) on delete set null,
  -- Quién la registró (el mismo empleado o RRHH en su nombre).
  solicitado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rrhh_sol_vacaciones check (
    tipo <> 'vacaciones' or (fecha_inicio is not null and fecha_fin is not null and fecha_fin >= fecha_inicio and dias > 0)),
  constraint rrhh_sol_horas check (
    tipo = 'vacaciones' or (fecha is not null and hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio and horas > 0)),
  constraint rrhh_sol_modalidad check (
    (tipo = 'permiso' and estado = 'aprobada') = (modalidad is not null))
);

create index idx_rrhh_solicitudes_clinica on rrhh_solicitudes (clinica_id, estado, created_at desc);
create index idx_rrhh_solicitudes_empleado on rrhh_solicitudes (empleado_id, created_at desc);
create trigger rrhh_solicitudes_auditoria after insert or update on rrhh_solicitudes
  for each row execute function fn_auditoria();

alter table rrhh_solicitudes enable row level security;
-- Cada empleado ve las suyas; RRHH ve las de la clínica.
-- La política se crea más abajo, junto a fn_rrhh_puede_ver_empleado (el
-- empleado sin acceso a RRHH no puede leer la tabla empleados).
-- Se escribe solo por las funciones de abajo.

-- ============================================================
-- 3. Cálculos
-- ============================================================
-- Días hábiles de vacaciones entre dos fechas, según la clínica.
create or replace function fn_rrhh_dias_habiles(p_clinica uuid, p_desde date, p_hasta date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from generate_series(p_desde, p_hasta, interval '1 day') d
  cross join (select pais_operacion_id, rrhh_sabado_laboral from clinicas where id = p_clinica) c
  where extract(isodow from d) <> 7
    and (c.rrhh_sabado_laboral or extract(isodow from d) <> 6)
    and not exists (select 1 from festivos f where f.pais_id = c.pais_operacion_id and f.fecha = d::date);
$$;

-- Para mostrar en pantalla cuántos días hábiles suman unas fechas (la clínica de la sesión).
create or replace function fn_rrhh_contar_dias(p_desde date, p_hasta date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when clinica_actual() is null or p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then 0
    else fn_rrhh_dias_habiles(clinica_actual(), p_desde, p_hasta) end;
$$;

-- Saldo de vacaciones (Art. 186 CST: 1,25 días por mes completo desde el
-- inicio del contrato laboral) menos lo tomado y lo pendiente por aprobar.
create or replace function fn_rrhh_saldo_vacaciones(p_empleado uuid)
returns table (generados numeric, tomados numeric, pendientes numeric, disponibles numeric)
language sql
stable
security definer
set search_path = public
as $$
  with e as (select id, fecha_inicio_contrato, categoria_contrato from empleados where id = p_empleado),
  hoy as (select (now() at time zone 'America/Bogota')::date as d),
  meses as (
    select case when e.fecha_inicio_contrato is null or e.categoria_contrato is distinct from 'laboral' then 0
      else greatest(0, (extract(year from age(hoy.d, e.fecha_inicio_contrato)) * 12 + extract(month from age(hoy.d, e.fecha_inicio_contrato)))::int) end as n
    from e, hoy
  ),
  t as (select coalesce(sum(dias_tomados), 0)::numeric as v from vacaciones_empleado where empleado_id = p_empleado),
  p as (select coalesce(sum(dias), 0)::numeric as v from rrhh_solicitudes where empleado_id = p_empleado and tipo = 'vacaciones' and estado = 'pendiente')
  select round(meses.n * 1.25, 2), t.v, p.v, round(meses.n * 1.25 - t.v - p.v, 2)
  from meses, t, p;
$$;

-- Horas de permiso que se deben reponer, menos las reposiciones aprobadas.
create or replace function fn_rrhh_saldo_horas(p_empleado uuid)
returns table (por_reponer numeric, repuestas numeric, pendientes numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(horas) filter (where tipo = 'permiso' and estado = 'aprobada' and modalidad = 'se_repone'), 0),
    coalesce(sum(horas) filter (where tipo = 'reposicion' and estado = 'aprobada'), 0),
    coalesce(sum(horas) filter (where tipo = 'permiso' and estado = 'aprobada' and modalidad = 'se_repone'), 0)
      - coalesce(sum(horas) filter (where tipo = 'reposicion' and estado = 'aprobada'), 0)
  from rrhh_solicitudes where empleado_id = p_empleado;
$$;

-- Puede ver el saldo: el propio empleado o RRHH.
create or replace function fn_rrhh_puede_ver_empleado(p_empleado uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from empleados e
    where e.id = p_empleado and e.clinica_id = clinica_actual()
      and (e.usuario_id = auth.uid() or has_permission('rrhh', 'VIEW')));
$$;

create policy "rrhh_solicitudes_select" on rrhh_solicitudes
  for select to authenticated using (clinica_id = clinica_actual() and fn_rrhh_puede_ver_empleado(empleado_id));

create or replace function fn_rrhh_saldos(p_empleado uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_v record;
  v_h record;
  v_e empleados%rowtype;
begin
  if not fn_rrhh_puede_ver_empleado(p_empleado) then
    return null;
  end if;
  select * into v_e from empleados where id = p_empleado;
  select * into v_v from fn_rrhh_saldo_vacaciones(p_empleado);
  select * into v_h from fn_rrhh_saldo_horas(p_empleado);
  return jsonb_build_object(
    'laboral', v_e.categoria_contrato = 'laboral' and v_e.fecha_inicio_contrato is not null,
    'vacaciones', jsonb_build_object('generados', v_v.generados, 'tomados', v_v.tomados, 'pendientes', v_v.pendientes, 'disponibles', v_v.disponibles),
    'horas', jsonb_build_object('por_reponer', v_h.por_reponer, 'repuestas', v_h.repuestas, 'pendientes', v_h.pendientes));
end;
$$;

-- ============================================================
-- 4. Solicitar
-- ============================================================
-- p_empleado null = para mí mismo (el empleado vinculado a mi usuario).
create or replace function fn_rrhh_solicitar(
  p_empleado uuid, p_tipo text, p_fecha_inicio date, p_fecha_fin date,
  p_fecha date, p_hora_inicio time, p_hora_fin time, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_e empleados%rowtype;
  v_dias int;
  v_disponibles numeric;
  v_id uuid;
begin
  if v_clinica is null then
    raise exception 'Sesión inválida.';
  end if;
  if p_tipo not in ('vacaciones', 'permiso', 'reposicion') then
    raise exception 'Tipo de solicitud inválido.';
  end if;
  if p_empleado is null then
    select * into v_e from empleados where usuario_id = auth.uid() and clinica_id = v_clinica and activo limit 1;
    if not found then
      raise exception 'Tu usuario no está vinculado a un empleado activo: pídele a Recursos Humanos que lo vincule.';
    end if;
  else
    select * into v_e from empleados where id = p_empleado and clinica_id = v_clinica;
    if not found then
      raise exception 'El empleado no existe.';
    end if;
    if v_e.usuario_id is distinct from auth.uid() and not has_permission('rrhh', 'CREATE') then
      raise exception 'No tienes permiso para registrar solicitudes de otros empleados.';
    end if;
    if not v_e.activo then
      raise exception 'El empleado está inactivo.';
    end if;
  end if;
  if length(btrim(coalesce(p_motivo, ''))) > 500 then
    raise exception 'El motivo es demasiado largo.';
  end if;

  if p_tipo = 'vacaciones' then
    if v_e.categoria_contrato is distinct from 'laboral' then
      raise exception 'Un contrato por prestación de servicios no genera vacaciones.';
    end if;
    if p_fecha_inicio is null or p_fecha_fin is null or p_fecha_fin < p_fecha_inicio then
      raise exception 'Elige desde cuándo y hasta cuándo.';
    end if;
    if p_fecha_fin - p_fecha_inicio > 90 then
      raise exception 'Una solicitud de vacaciones no puede pasar de 90 días calendario.';
    end if;
    v_dias := fn_rrhh_dias_habiles(v_clinica, p_fecha_inicio, p_fecha_fin);
    if v_dias = 0 then
      raise exception 'En esas fechas no hay días hábiles (son domingos, festivos o sábados no laborales).';
    end if;
    if exists (
      select 1 from rrhh_solicitudes s where s.empleado_id = v_e.id and s.tipo = 'vacaciones' and s.estado in ('pendiente', 'aprobada')
        and daterange(s.fecha_inicio, s.fecha_fin, '[]') && daterange(p_fecha_inicio, p_fecha_fin, '[]')
    ) or exists (
      select 1 from vacaciones_empleado v where v.empleado_id = v_e.id
        and daterange(v.fecha_inicio, v.fecha_fin, '[]') && daterange(p_fecha_inicio, p_fecha_fin, '[]')
    ) then
      raise exception 'Ya hay vacaciones solicitadas o registradas en esas fechas.';
    end if;
    select disponibles into v_disponibles from fn_rrhh_saldo_vacaciones(v_e.id);
    insert into rrhh_solicitudes (clinica_id, empleado_id, tipo, fecha_inicio, fecha_fin, dias, excede_saldo, motivo, solicitado_por)
    values (v_clinica, v_e.id, 'vacaciones', p_fecha_inicio, p_fecha_fin, v_dias, v_dias > coalesce(v_disponibles, 0),
      nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid())
    returning id into v_id;
  else
    if p_fecha is null or p_hora_inicio is null or p_hora_fin is null or p_hora_fin <= p_hora_inicio then
      raise exception 'Elige el día y un rango de horas válido.';
    end if;
    if p_tipo = 'permiso' and length(btrim(coalesce(p_motivo, ''))) < 3 then
      raise exception 'Escribe el motivo del permiso.';
    end if;
    if exists (
      select 1 from rrhh_solicitudes s where s.empleado_id = v_e.id and s.tipo in ('permiso', 'reposicion') and s.estado in ('pendiente', 'aprobada')
        and s.fecha = p_fecha and s.hora_inicio < p_hora_fin and s.hora_fin > p_hora_inicio
    ) then
      raise exception 'Ya hay un permiso o una reposición en ese horario.';
    end if;
    insert into rrhh_solicitudes (clinica_id, empleado_id, tipo, fecha, hora_inicio, hora_fin, horas, motivo, solicitado_por)
    values (v_clinica, v_e.id, p_tipo, p_fecha, p_hora_inicio, p_hora_fin,
      round(extract(epoch from (p_hora_fin - p_hora_inicio)) / 3600.0, 2), nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ============================================================
-- 5. Aprobar, rechazar y cancelar
-- ============================================================
create or replace function fn_rrhh_resolver(p_solicitud uuid, p_aprobar boolean, p_modalidad text, p_comentario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_s rrhh_solicitudes%rowtype;
  v_vac uuid;
begin
  if v_clinica is null or not has_permission('rrhh', 'APPROVE') then
    raise exception 'No tienes permiso para aprobar solicitudes.';
  end if;
  select * into v_s from rrhh_solicitudes where id = p_solicitud and clinica_id = v_clinica for update;
  if not found then
    raise exception 'La solicitud no existe.';
  end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Esa solicitud ya se resolvió.';
  end if;
  if not es_admin() and exists (select 1 from empleados where id = v_s.empleado_id and usuario_id = auth.uid()) then
    raise exception 'Tu propia solicitud la aprueba otra persona.';
  end if;
  if not p_aprobar and length(btrim(coalesce(p_comentario, ''))) < 3 then
    raise exception 'Escribe por qué se rechaza.';
  end if;
  if p_aprobar and v_s.tipo = 'permiso' and coalesce(p_modalidad, '') not in ('se_repone', 'remunerado', 'no_remunerado') then
    raise exception 'Elige si el permiso se repone, es remunerado o no remunerado.';
  end if;

  if p_aprobar and v_s.tipo = 'vacaciones' then
    insert into vacaciones_empleado (clinica_id, empleado_id, fecha_inicio, fecha_fin, dias_tomados, created_by)
    values (v_clinica, v_s.empleado_id, v_s.fecha_inicio, v_s.fecha_fin, ceil(v_s.dias)::int, auth.uid())
    returning id into v_vac;
  end if;

  update rrhh_solicitudes set
    estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
    modalidad = case when p_aprobar and v_s.tipo = 'permiso' then p_modalidad end,
    comentario_resolucion = nullif(left(btrim(coalesce(p_comentario, '')), 500), ''),
    resuelto_por = auth.uid(), resuelto_en = now(), vacaciones_id = v_vac
  where id = p_solicitud;
end;
$$;

create or replace function fn_rrhh_cancelar(p_solicitud uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_s rrhh_solicitudes%rowtype;
begin
  select * into v_s from rrhh_solicitudes where id = p_solicitud and clinica_id = v_clinica for update;
  if not found then
    raise exception 'La solicitud no existe.';
  end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Solo se cancela una solicitud pendiente.';
  end if;
  if not has_permission('rrhh', 'CREATE')
     and not exists (select 1 from empleados where id = v_s.empleado_id and usuario_id = auth.uid()) then
    raise exception 'No puedes cancelar esta solicitud.';
  end if;
  update rrhh_solicitudes set estado = 'cancelada', resuelto_por = auth.uid(), resuelto_en = now() where id = p_solicitud;
end;
$$;

-- Sábado laboral: quien edita RRHH.
create or replace function fn_rrhh_config_sabado(p_laboral boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if clinica_actual() is null or not has_permission('rrhh', 'EDIT') then
    raise exception 'No tienes permiso para cambiar esta configuración.';
  end if;
  update clinicas set rrhh_sabado_laboral = coalesce(p_laboral, true) where id = clinica_actual();
end;
$$;

-- Correos de quienes aprueban (para avisarles): solo el servidor (service role).
create or replace function fn_rrhh_aprobadores(p_clinica uuid)
returns table (email text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct u.email, u.nombre
  from usuarios u
  join roles r on r.id = u.rol_id
  where u.clinica_id = p_clinica and u.activo and u.email is not null
    and (r.nivel = 1 or exists (
      select 1 from rol_modulo_permiso rmp
      join modulos m on m.id = rmp.modulo_id and m.codigo = 'rrhh'
      join permisos p on p.id = rmp.permiso_id and p.codigo = 'APPROVE'
      where rmp.rol_id = r.id and rmp.concedido));
$$;

revoke execute on function fn_rrhh_dias_habiles(uuid, date, date) from public, anon, authenticated;
revoke execute on function fn_rrhh_contar_dias(date, date) from public, anon;
grant execute on function fn_rrhh_contar_dias(date, date) to authenticated;
revoke execute on function fn_rrhh_saldo_vacaciones(uuid) from public, anon, authenticated;
revoke execute on function fn_rrhh_saldo_horas(uuid) from public, anon, authenticated;
revoke execute on function fn_rrhh_puede_ver_empleado(uuid) from public, anon;
grant execute on function fn_rrhh_puede_ver_empleado(uuid) to authenticated;
revoke execute on function fn_rrhh_saldos(uuid) from public, anon;
grant execute on function fn_rrhh_saldos(uuid) to authenticated;
revoke execute on function fn_rrhh_solicitar(uuid, text, date, date, date, time, time, text) from public, anon;
grant execute on function fn_rrhh_solicitar(uuid, text, date, date, date, time, time, text) to authenticated;
revoke execute on function fn_rrhh_resolver(uuid, boolean, text, text) from public, anon;
grant execute on function fn_rrhh_resolver(uuid, boolean, text, text) to authenticated;
revoke execute on function fn_rrhh_cancelar(uuid) from public, anon;
grant execute on function fn_rrhh_cancelar(uuid) to authenticated;
revoke execute on function fn_rrhh_config_sabado(boolean) from public, anon;
grant execute on function fn_rrhh_config_sabado(boolean) to authenticated;
revoke execute on function fn_rrhh_aprobadores(uuid) from public, anon, authenticated;
grant execute on function fn_rrhh_aprobadores(uuid) to service_role;
