-- ============================================================
-- 0072 · SG-SST F1 · Cimientos
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md §3 y fila F1 de §4.
--   1. Módulo `sst` en RBAC y planes (activo en todos; sub-feature
--      `gestion` solo Pro) + backfill a Administradores.
--   2. sst_perfil (1:1 con la clínica): modo empleador / independiente,
--      código de actividad del Dec. 768/2022, otros trabajadores que RRHH
--      no registra, exclusión justificada de contratistas y responsable
--      del SG-SST.
--   3. fn_sst_conteo_trabajadores(): conteos y clases de riesgo desde RRHH
--      SIN exponer filas de empleados (quien gestiona SST puede no tener
--      permiso de RRHH). El grupo de estándares (7/21/60) lo calcula
--      lib/sst/grupo.ts sobre estos números.

-- ============================================================
-- 1. RBAC, plan y entitlement
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('sst', 'SG-SST',
   'Sistema de Gestión de Seguridad y Salud en el Trabajo: estándares mínimos, accidentes, documentos y calendario.',
   '/sst', 13, true);

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true from planes p cross join modulos m where m.codigo = 'sst';

insert into plan_features (plan_id, modulo_id, feature_codigo, incluido)
select p.id, m.id, 'gestion', (p.codigo = 'pro') from planes p join modulos m on m.codigo = 'sst';

do $$
declare v record;
begin
  for v in select id from clinicas loop
    perform fn_sync_clinica_modulos(v.id);
  end loop;
end $$;

-- Las clínicas nuevas: bootstrap_clinica() ya sincroniza clinica_modulos
-- desde el plan y el Administrador (nivel 1) pasa has_permission() sin
-- filas en rol_modulo_permiso; el backfill es para que la matriz de
-- permisos lo muestre marcado en las clínicas existentes.
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r cross join modulos m cross join permisos p
where r.nivel = 1 and m.codigo = 'sst'
  and p.codigo in ('VIEW', 'CREATE', 'EDIT', 'VOID', 'APPROVE', 'EXPORT')
on conflict do nothing;

-- ============================================================
-- 2. Perfil SST de la clínica
-- ============================================================
create table sst_perfil (
  -- id propio: fn_auditoria registra por id de fila.
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null unique references clinicas(id) on delete cascade,
  -- independiente = profesional que trabaja solo (sin trabajadores a cargo):
  -- no le aplican los estándares de la Res. 0312, sí la afiliación, el
  -- autocuidado y lo que le exija su contratante (Dec. 723/2013).
  modo text not null default 'empleador' check (modo in ('empleador', 'independiente')),
  -- Código de 7 dígitos de la tabla del Dec. 768/2022 (el de la afiliación
  -- a la ARL): el primer dígito es la clase de riesgo, luego el CIIU y la
  -- sub-actividad. Se guarda completo: la clase no se infiere del CIIU.
  codigo_actividad text check (codigo_actividad ~ '^[1-5][0-9]{6}$'),
  -- Personas que cuentan para el tamaño y RRHH no registra: cooperados,
  -- trabajadores en misión, estudiantes afiliados.
  otros_trabajadores int not null default 0 check (otros_trabajadores between 0 and 100000),
  otros_trabajadores_detalle text check (length(otros_trabajadores_detalle) <= 500),
  -- Por defecto los contratistas cuentan (campo de aplicación de la Res.
  -- 0312); excluirlos exige decir por qué (queda el rastro).
  excluye_contratistas boolean not null default false,
  justificacion_exclusion text check (justificacion_exclusion is null or length(btrim(justificacion_exclusion)) between 10 and 2000),
  -- Responsable del SG-SST.
  responsable_nombre text check (length(btrim(responsable_nombre)) between 3 and 200),
  responsable_formacion text check (responsable_formacion in ('tecnico', 'tecnologo', 'profesional', 'especialista')),
  responsable_licencia text check (length(responsable_licencia) <= 100),
  responsable_licencia_vence date,
  responsable_curso_50h date,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sst_perfil_exclusion_justificada check (not excluye_contratistas or justificacion_exclusion is not null)
);

create trigger sst_00_autor before insert or update on sst_perfil
  for each row execute function fn_hab_forzar_autor();
create trigger sst_perfil_set_updated_at before update on sst_perfil
  for each row execute function set_updated_at();
create trigger sst_perfil_auditoria after insert or update on sst_perfil
  for each row execute function fn_auditoria();

alter table sst_perfil enable row level security;

create policy "sst_perfil_select" on sst_perfil
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_perfil_insert" on sst_perfil
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('sst', 'EDIT'));
create policy "sst_perfil_update" on sst_perfil
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 3. Conteo de trabajadores y clases de riesgo (solo agregados)
-- ============================================================
-- Cargo vigente = el de fecha_inicio más reciente del historial. Clases
-- como código romano (I–V) para que la app las compare sin otra consulta.
create or replace function fn_sst_conteo_trabajadores()
returns table (
  dependientes int,
  contratistas int,
  sin_categoria int,
  clase_clinica text,
  clase_cargos_max text,
  con_cargo int,
  cargos_sin_clase int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
begin
  if v_clinica is null or not has_permission('sst', 'VIEW') then
    raise exception 'No tienes permiso para ver el diagnóstico del SG-SST.';
  end if;
  return query
  with activos as (
    select e.id, e.categoria_contrato,
      (select h.cargo_id from historial_cargos_empleado h
        where h.empleado_id = e.id order by h.fecha_inicio desc, h.created_at desc limit 1) as cargo_id
    from empleados e
    where e.clinica_id = v_clinica and e.activo
  )
  select
    count(*) filter (where a.categoria_contrato = 'laboral')::int,
    count(*) filter (where a.categoria_contrato = 'servicios')::int,
    count(*) filter (where a.categoria_contrato is null)::int,
    (select cr.codigo from clinicas c join clases_riesgo cr on cr.id = c.clase_riesgo_id where c.id = v_clinica),
    (select max(cr.codigo) from activos x join cargos cg on cg.id = x.cargo_id join clases_riesgo cr on cr.id = cg.clase_riesgo_id),
    count(a.cargo_id)::int,
    (select count(*)::int from activos x join cargos cg on cg.id = x.cargo_id where cg.clase_riesgo_id is null)
  from activos a;
end;
$$;

comment on function fn_sst_conteo_trabajadores() is
  'SG-SST F1: trabajadores activos por categoría de contrato y clases de riesgo (clínica y cargos vigentes), solo agregados. Exige sst/VIEW.';

revoke execute on function fn_sst_conteo_trabajadores() from public, anon;
grant execute on function fn_sst_conteo_trabajadores() to authenticated;
