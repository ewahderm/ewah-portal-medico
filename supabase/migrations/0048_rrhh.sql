-- EWAH Tech Platform — Módulo Recursos Humanos (RRHH) + Nómina
-- Aplicar con: npx supabase db push --linked
--
-- Ver el requerimiento completo (investigación de legislación colombiana,
-- decisiones confirmadas con el usuario) en el plan de diseño de esta
-- sesión. Resumen de las decisiones que más afectan este esquema:
--
-- 1. Dos módulos RBAC, no uno con permisos inventados: `rrhh` (empleados,
--    documentos, historial, incapacidades, vacaciones, accidentes,
--    protocolos) y `nomina` (comprobantes de nómina y honorarios) — ambos
--    con los permisos estándar ya existentes (VIEW/CREATE/EDIT/VOID),
--    nunca un código nuevo. Así un rol puede gestionar RRHH sin ver
--    salarios, o ambos.
-- 2. `empleados` (creada en 0037 para Medio Ambiente, solo nombre+código)
--    se amplía aquí con todo el maestro de RRHH — se restringe su SELECT a
--    has_permission('rrhh','VIEW') y se agrega fn_empleados_picker() para
--    que Medio Ambiente (que solo necesita id+nombre para su selector de
--    "quién limpió/pesó") siga funcionando sin necesitar permiso de RRHH.
-- 3. Catálogos de seguridad social (EPS ya existente, fondos de pensión,
--    fondos de cesantías, ARL, bancos, clases de riesgo) ganan `pais_id` —
--    son generalidades universales de RRHH, no exclusivas de Colombia; solo
--    se siembran entidades colombianas hoy, el día de mañana se agregan
--    filas para otro país sin migrar nada.
-- 4. `valores_legales_pais` y la tarifa de `clases_riesgo` SÍ son cálculo
--    legal exclusivamente colombiano — mantenidos centralmente por EWAH
--    Tech (solo es_super_admin() escribe), igual que `planes`.
-- 5. `accidentes_trabajo` y `documentos_normativos` se nombran SIN prefijo
--    de módulo a propósito — son tablas compartidas que el futuro módulo
--    SG-SST reusará agregando una condición OR a sus policies, nunca
--    duplicándolas.
-- 6. Contrato "por servicios" nunca genera vacaciones — enforced con un
--    trigger (`fn_vacaciones_solo_laboral`), no solo en la aplicación.
-- 7. `comprobantes_nomina`/`comprobantes_honorarios` son append-only con el
--    mismo patrón de `fn_tratamientos_solo_anular`: la única actualización
--    permitida es anular.

-- ============================================================
-- 0. País de operación y exoneración de aportes, a nivel de clínica
-- ============================================================
alter table clinicas
  add column pais_operacion_id uuid references paises(id),
  add column exoneracion_aportes_salud_parafiscales boolean not null default false;

update clinicas set pais_operacion_id = (select id from paises where codigo = 'CO');
alter table clinicas alter column pais_operacion_id set not null;

-- Igual patrón que fn_actualizar_marca_propia_clinica (0046): `clinicas` no
-- tiene policy de UPDATE para authenticated, esta función security definer
-- es la única puerta, limitada a la propia clínica y solo para admin.
create or replace function fn_actualizar_pais_y_exoneracion_clinica(
  p_pais_operacion_id uuid,
  p_exoneracion_aportes boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar esta configuración.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  if not exists (select 1 from paises where id = p_pais_operacion_id) then
    raise exception 'País inválido.';
  end if;

  update clinicas
  set pais_operacion_id = p_pais_operacion_id,
      exoneracion_aportes_salud_parafiscales = p_exoneracion_aportes
  where id = v_clinica_id;
end;
$$;

-- ============================================================
-- 1. Catálogos de seguridad social, por país (generalidad universal)
-- ============================================================
alter table eps add column pais_id uuid references paises(id);
update eps set pais_id = (select id from paises where codigo = 'CO');
alter table eps alter column pais_id set not null;

create table fondos_pension (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create table fondos_cesantias (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create table arls (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create table bancos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

-- Generalidad "nivel de riesgo del cargo" — la tarifa (`tarifa_arl`) es
-- cálculo legal exclusivamente colombiano (Decreto 1607/2002), nullable
-- para cualquier otro país que todavía no tenga una tarifa verificada.
create table clases_riesgo (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  codigo text,
  nombre text not null,
  tarifa_arl numeric(6,4),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create trigger fondos_pension_set_updated_at before update on fondos_pension for each row execute function set_updated_at();
create trigger fondos_cesantias_set_updated_at before update on fondos_cesantias for each row execute function set_updated_at();
create trigger arls_set_updated_at before update on arls for each row execute function set_updated_at();
create trigger bancos_set_updated_at before update on bancos for each row execute function set_updated_at();
create trigger clases_riesgo_set_updated_at before update on clases_riesgo for each row execute function set_updated_at();

alter table fondos_pension enable row level security;
alter table fondos_cesantias enable row level security;
alter table arls enable row level security;
alter table bancos enable row level security;
alter table clases_riesgo enable row level security;

create policy "fondos_pension_select_all" on fondos_pension for select to authenticated using (true);
create policy "fondos_cesantias_select_all" on fondos_cesantias for select to authenticated using (true);
create policy "arls_select_all" on arls for select to authenticated using (true);
create policy "bancos_select_all" on bancos for select to authenticated using (true);
create policy "clases_riesgo_select_all" on clases_riesgo for select to authenticated using (true);

-- ============================================================
-- 2. Valores legales por país y año — SMLV/auxilio de transporte/UVT.
--    Cálculo legal colombiano, mantenido centralmente por EWAH Tech.
-- ============================================================
create table valores_legales_pais (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  anio int not null,
  smlv numeric(12,2),
  auxilio_transporte numeric(12,2),
  uvt numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pais_id, anio)
);

create trigger valores_legales_pais_set_updated_at before update on valores_legales_pais for each row execute function set_updated_at();

alter table valores_legales_pais enable row level security;

create policy "valores_legales_pais_select_all" on valores_legales_pais for select to authenticated using (true);

create policy "valores_legales_pais_write_super_admin" on valores_legales_pais
  for all using (es_super_admin())
  with check (es_super_admin());

-- ============================================================
-- 3. Catálogos globales universales (sin país — generalidad de RRHH)
-- ============================================================
create table tipos_contrato (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  categoria text not null check (categoria in ('laboral', 'servicios')),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tipos_examen_ocupacional (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tipos_cuenta_bancaria (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `categoria` clasifica el documento para el futuro SG-SST/Habilitación —
-- hoy todo vive bajo RRHH porque esos módulos no existen todavía, pero la
-- columna ya deja listo el reclasificado sin tocar filas.
create table tipos_documento_normativo (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  categoria text not null default 'rrhh' check (categoria in ('rrhh', 'sgsst', 'habilitacion')),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tipos_contrato_set_updated_at before update on tipos_contrato for each row execute function set_updated_at();
create trigger tipos_examen_ocupacional_set_updated_at before update on tipos_examen_ocupacional for each row execute function set_updated_at();
create trigger tipos_cuenta_bancaria_set_updated_at before update on tipos_cuenta_bancaria for each row execute function set_updated_at();
create trigger tipos_documento_normativo_set_updated_at before update on tipos_documento_normativo for each row execute function set_updated_at();

alter table tipos_contrato enable row level security;
alter table tipos_examen_ocupacional enable row level security;
alter table tipos_cuenta_bancaria enable row level security;
alter table tipos_documento_normativo enable row level security;

create policy "tipos_contrato_select_all" on tipos_contrato for select to authenticated using (true);
create policy "tipos_examen_ocupacional_select_all" on tipos_examen_ocupacional for select to authenticated using (true);
create policy "tipos_cuenta_bancaria_select_all" on tipos_cuenta_bancaria for select to authenticated using (true);
create policy "tipos_documento_normativo_select_all" on tipos_documento_normativo for select to authenticated using (true);

-- ============================================================
-- 4. Catálogos por clínica
-- ============================================================
create table tipos_vacuna (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

-- `clase_riesgo_id` hace que este catálogo se gradúe del motor genérico de
-- Parámetros (igual que Consultorios/Insumos/Proveedores/Neveras) — un
-- cargo necesita más que nombre+código.
create table cargos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  clase_riesgo_id uuid references clases_riesgo(id),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, codigo)
);

create trigger tipos_vacuna_set_updated_at before update on tipos_vacuna for each row execute function set_updated_at();
create trigger cargos_set_updated_at before update on cargos for each row execute function set_updated_at();

alter table tipos_vacuna enable row level security;
alter table cargos enable row level security;

create policy "tipos_vacuna_select_propia_clinica" on tipos_vacuna
  for select using (clinica_id = clinica_actual());
create policy "tipos_vacuna_insert_con_permiso" on tipos_vacuna
  for insert with check (clinica_id = clinica_actual() and has_permission('parametros', 'CREATE'));
create policy "tipos_vacuna_update_con_permiso" on tipos_vacuna
  for update using (clinica_id = clinica_actual() and has_permission('parametros', 'EDIT'))
  with check (clinica_id = clinica_actual());

create policy "cargos_select_propia_clinica" on cargos
  for select using (clinica_id = clinica_actual());
create policy "cargos_insert_con_permiso" on cargos
  for insert with check (clinica_id = clinica_actual() and has_permission('parametros', 'CREATE'));
create policy "cargos_update_con_permiso" on cargos
  for update using (clinica_id = clinica_actual() and has_permission('parametros', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 5. empleados — ampliación del catálogo liviano de Medio Ambiente (0037)
--    al maestro completo de RRHH.
-- ============================================================
alter table empleados
  add column fecha_nacimiento date,
  add column celular text,
  add column email text,
  add column tipo_identificacion_id uuid references tipos_identificacion(id),
  add column numero_identificacion text,
  add column tipo_contrato_id uuid references tipos_contrato(id),
  add column categoria_contrato text check (categoria_contrato in ('laboral', 'servicios')),
  add column fecha_inicio_contrato date,
  add column fecha_fin_contrato date,
  add column eps_id uuid references eps(id),
  add column fondo_pension_id uuid references fondos_pension(id),
  add column fondo_cesantias_id uuid references fondos_cesantias(id),
  add column arl_id uuid references arls(id),
  add column numero_tarjeta_profesional text,
  add column preferencia_pago text check (preferencia_pago in ('quincenal', 'mensual')),
  add column tipo_cuenta_bancaria_id uuid references tipos_cuenta_bancaria(id),
  add column numero_cuenta text,
  add column banco_id uuid references bancos(id),
  add column declarante_renta boolean,
  add column usuario_id uuid references usuarios(id);

-- categoria_contrato nunca se confía al cliente ni a la acción del
-- servidor que pueda olvidarlo — se deriva siempre del tipo de contrato
-- elegido, que es quien de verdad define si aplica nómina laboral u
-- honorarios (ver fn_vacaciones_solo_laboral más abajo, que depende de
-- este campo).
create or replace function fn_empleados_sync_categoria_contrato()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_contrato_id is not null then
    select categoria into new.categoria_contrato from tipos_contrato where id = new.tipo_contrato_id;
  else
    new.categoria_contrato := null;
  end if;
  return new;
end;
$$;

create trigger empleados_sync_categoria_contrato
  before insert or update on empleados
  for each row execute function fn_empleados_sync_categoria_contrato();

create trigger empleados_auditoria
  after insert or update or delete on empleados
  for each row execute function fn_auditoria();

-- Restringe el acceso de lectura/escritura de empleados a quien tenga
-- permiso de RRHH — antes (0037) cualquiera de la clínica podía verlos
-- (tenía sentido cuando solo era nombre+código para un selector de Medio
-- Ambiente; ya no, ahora incluye identificación/EPS/banco/contrato).
drop policy if exists "empleados_select_propia_clinica" on empleados;
drop policy if exists "empleados_insert_con_permiso" on empleados;
drop policy if exists "empleados_update_con_permiso" on empleados;

create policy "empleados_select_con_permiso" on empleados
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "empleados_insert_con_permiso" on empleados
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));
create policy "empleados_update_con_permiso" on empleados
  for update using (clinica_id = clinica_actual() and has_permission('rrhh', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- Picker de solo id+nombre para quien NO tiene permiso de RRHH (ej. Medio
-- Ambiente, que solo necesita elegir "quién limpió/pesó") — mismo criterio
-- de exposición mínima que fn_conteo_pacientes_por_clinica (0047): nunca
-- expone una columna sensible, solo lo estrictamente necesario para el
-- selector.
create or replace function fn_empleados_picker()
returns table(id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nombre
  from empleados e
  where e.clinica_id = clinica_actual() and e.activo = true
  order by e.orden;
$$;

-- ============================================================
-- 6. Documentación del empleado (identidad, vacunas, exámenes,
--    currículum, certificados, cuenta bancaria)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documentos-rrhh', 'documentos-rrhh', false)
on conflict (id) do nothing;

-- Ruta: "<clinica_id>/..." — el primer segmento aísla por clínica, igual
-- que el resto de buckets privados del proyecto. Un solo bucket para todo
-- lo documental de RRHH/Nómina (empleados, actas, cartas, soportes,
-- planilla, protocolos) — más simple que uno por sub-área, y la policy ya
-- cubre ambos módulos con el OR de abajo.
create policy "documentos_rrhh_storage_select" on storage.objects
  for select using (
    bucket_id = 'documentos-rrhh'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and (has_permission('rrhh', 'VIEW') or has_permission('nomina', 'VIEW'))
  );

create policy "documentos_rrhh_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'documentos-rrhh'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and (has_permission('rrhh', 'CREATE') or has_permission('nomina', 'CREATE'))
  );

create policy "documentos_rrhh_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'documentos-rrhh'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and es_admin()
  );

create table documentos_empleado (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  tipo text not null check (tipo in (
    'identidad', 'tarjeta_profesional', 'contrato_trabajo', 'certificado_bancario',
    'vacuna', 'examen_ocupacional', 'certificado_laboral', 'acta_diploma', 'otro_certificado'
  )),
  tipo_vacuna_id uuid references tipos_vacuna(id),
  tipo_examen_id uuid references tipos_examen_ocupacional(id),
  nombre_personalizado text,
  storage_path text not null,
  nombre_archivo text not null,
  fecha_evento date,
  fecha_vencimiento date,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index documentos_empleado_empleado_id_idx on documentos_empleado(empleado_id);

alter table documentos_empleado enable row level security;

create policy "documentos_empleado_select_con_permiso" on documentos_empleado
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "documentos_empleado_insert_con_permiso" on documentos_empleado
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));
create policy "documentos_empleado_delete_admin" on documentos_empleado
  for delete using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- 7. Historial de cargo y salario — puro append-only (sin fecha_fin
--    guardada): el período vigente es el de fecha_inicio más reciente, el
--    "fin" de un período anterior se calcula como un día antes del
--    siguiente, nunca se actualiza una fila ya insertada.
-- ============================================================
create table historial_cargos_empleado (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  cargo_id uuid not null references cargos(id),
  fecha_inicio date not null,
  acta_storage_path text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create table historial_salarios_empleado (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  salario numeric(12,2) not null check (salario > 0),
  fecha_inicio date not null,
  acta_storage_path text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index historial_cargos_empleado_empleado_idx on historial_cargos_empleado(empleado_id, fecha_inicio desc);
create index historial_salarios_empleado_empleado_idx on historial_salarios_empleado(empleado_id, fecha_inicio desc);

alter table historial_cargos_empleado enable row level security;
alter table historial_salarios_empleado enable row level security;

create policy "historial_cargos_select_con_permiso" on historial_cargos_empleado
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "historial_cargos_insert_con_permiso" on historial_cargos_empleado
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));

create policy "historial_salarios_select_con_permiso" on historial_salarios_empleado
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "historial_salarios_insert_con_permiso" on historial_salarios_empleado
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));

-- ============================================================
-- 8. Incapacidades y vacaciones
-- ============================================================
create table incapacidades_empleado (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  fecha_inicio date not null,
  dias int not null check (dias > 0),
  origen text not null check (origen in ('enfermedad_general', 'laboral')),
  accidente_trabajo_id uuid,
  gestionada_eps boolean not null default false,
  eps_pago boolean not null default false,
  fecha_pago date,
  soporte_storage_path text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create table vacaciones_empleado (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  carta_solicitud_storage_path text,
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  dias_tomados int not null check (dias_tomados > 0),
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index incapacidades_empleado_empleado_idx on incapacidades_empleado(empleado_id, fecha_inicio desc);
create index vacaciones_empleado_empleado_idx on vacaciones_empleado(empleado_id, fecha_inicio desc);

-- Un contrato "por servicios" no genera vacaciones por ley (no es relación
-- laboral) — se bloquea a nivel de base de datos, no solo en la app.
create or replace function fn_vacaciones_solo_laboral()
returns trigger
language plpgsql
as $$
declare
  v_categoria text;
begin
  select categoria_contrato into v_categoria from empleados where id = new.empleado_id;
  if v_categoria is distinct from 'laboral' then
    raise exception 'Un contrato por prestación de servicios no genera vacaciones — solo aplica a contratos laborales.';
  end if;
  return new;
end;
$$;

create trigger vacaciones_empleado_solo_laboral
  before insert on vacaciones_empleado
  for each row execute function fn_vacaciones_solo_laboral();

alter table incapacidades_empleado enable row level security;
alter table vacaciones_empleado enable row level security;

create policy "incapacidades_select_con_permiso" on incapacidades_empleado
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "incapacidades_insert_con_permiso" on incapacidades_empleado
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));
create policy "incapacidades_delete_admin" on incapacidades_empleado
  for delete using (clinica_id = clinica_actual() and es_admin());

create policy "vacaciones_select_con_permiso" on vacaciones_empleado
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "vacaciones_insert_con_permiso" on vacaciones_empleado
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));
create policy "vacaciones_delete_admin" on vacaciones_empleado
  for delete using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- 9. Accidentes laborales — tabla COMPARTIDA con el futuro SG-SST, sin
--    prefijo de módulo en el nombre a propósito. Cuando se construya
--    SG-SST, su migración solo agrega una condición OR a estas policies
--    (has_permission('sgsst', ...)), nunca las reemplaza.
-- ============================================================
create table accidentes_trabajo (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  fecha date not null,
  resumen text not null,
  causa text,
  acciones_correctivas text,
  reportado_centro_trabajo boolean not null default false,
  fecha_reporte_centro_trabajo date,
  reportado_arl boolean not null default false,
  fecha_reporte_arl date,
  en_investigacion boolean not null default false,
  plan_accion_correctivo boolean not null default false,
  cerrado boolean not null default false,
  genera_incapacidad boolean not null default false,
  fecha_cierre date,
  resumen_cierre text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table incapacidades_empleado
  add constraint incapacidades_accidente_trabajo_fkey
  foreign key (accidente_trabajo_id) references accidentes_trabajo(id);

create index accidentes_trabajo_empleado_idx on accidentes_trabajo(empleado_id, fecha desc);
create index accidentes_trabajo_clinica_idx on accidentes_trabajo(clinica_id, fecha desc);

create trigger accidentes_trabajo_set_updated_at before update on accidentes_trabajo for each row execute function set_updated_at();
create trigger accidentes_trabajo_auditoria
  after insert or update or delete on accidentes_trabajo
  for each row execute function fn_auditoria();

alter table accidentes_trabajo enable row level security;

create policy "accidentes_trabajo_select_con_permiso" on accidentes_trabajo
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "accidentes_trabajo_insert_con_permiso" on accidentes_trabajo
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));
create policy "accidentes_trabajo_update_con_permiso" on accidentes_trabajo
  for update using (clinica_id = clinica_actual() and has_permission('rrhh', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 10. Protocolos y documentos normativos — tabla COMPARTIDA, versionada
--     (nueva fila = nueva versión, nunca se sobreescribe la anterior).
-- ============================================================
create table documentos_normativos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo_documento_id uuid not null references tipos_documento_normativo(id),
  version int not null,
  storage_path text not null,
  nombre_archivo text not null,
  vigente_desde date not null default current_date,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  unique (clinica_id, tipo_documento_id, version)
);

create index documentos_normativos_clinica_tipo_idx on documentos_normativos(clinica_id, tipo_documento_id, version desc);

alter table documentos_normativos enable row level security;

create policy "documentos_normativos_select_con_permiso" on documentos_normativos
  for select using (clinica_id = clinica_actual() and has_permission('rrhh', 'VIEW'));
create policy "documentos_normativos_insert_con_permiso" on documentos_normativos
  for insert with check (clinica_id = clinica_actual() and has_permission('rrhh', 'CREATE'));
create policy "documentos_normativos_delete_admin" on documentos_normativos
  for delete using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- 11. Comprobante de pago de planilla (PILA) de la clínica
-- ============================================================
create table comprobantes_planilla_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  periodo_anio int not null,
  periodo_mes int not null check (periodo_mes between 1 and 12),
  storage_path text not null,
  nombre_archivo text not null,
  fecha_pago date,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  unique (clinica_id, periodo_anio, periodo_mes)
);

alter table comprobantes_planilla_clinica enable row level security;

create policy "comprobantes_planilla_select_con_permiso" on comprobantes_planilla_clinica
  for select using (clinica_id = clinica_actual() and has_permission('nomina', 'VIEW'));
create policy "comprobantes_planilla_insert_con_permiso" on comprobantes_planilla_clinica
  for insert with check (clinica_id = clinica_actual() and has_permission('nomina', 'CREATE'));
create policy "comprobantes_planilla_delete_admin" on comprobantes_planilla_clinica
  for delete using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- 12. Nómina (categoría "laboral") y honorarios (categoría "servicios") —
--     dos flujos separados a propósito, nunca uno solo con una bandera
--     (ver fn_vacaciones_solo_laboral arriba para la misma razón legal).
--     Append-only: la única actualización permitida es anular.
-- ============================================================
create table comprobantes_nomina (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id),
  tipo_periodo text not null check (tipo_periodo in ('quincenal', 'mensual')),
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  salario_base numeric(12,2) not null,
  auxilio_transporte numeric(12,2) not null default 0,
  comisiones numeric(12,2) not null default 0,
  comisiones_incluidas_ibc boolean not null default false,
  deduccion_salud numeric(12,2) not null default 0,
  deduccion_pension numeric(12,2) not null default 0,
  aporte_patronal_salud numeric(12,2) not null default 0,
  aporte_patronal_pension numeric(12,2) not null default 0,
  aporte_arl numeric(12,2) not null default 0,
  aporte_parafiscales numeric(12,2) not null default 0,
  exonerado_aportes boolean not null default false,
  retencion_fuente numeric(12,2) not null default 0,
  otras_deducciones numeric(12,2) not null default 0,
  neto_pagar numeric(12,2) not null,
  anulado boolean not null default false,
  anulado_motivo text,
  storage_path text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create table comprobantes_honorarios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id),
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  valor_bruto numeric(12,2) not null check (valor_bruto > 0),
  declarante_renta boolean not null,
  tarifa_retencion numeric(5,2) not null,
  retencion_fuente numeric(12,2) not null,
  neto_pagar numeric(12,2) not null,
  requiere_factura_electronica boolean not null default false,
  soporte_seguridad_social_storage_path text,
  anulado boolean not null default false,
  anulado_motivo text,
  storage_path text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index comprobantes_nomina_empleado_idx on comprobantes_nomina(empleado_id, fecha_inicio desc);
create index comprobantes_honorarios_empleado_idx on comprobantes_honorarios(empleado_id, fecha_inicio desc);

-- Mismo patrón que fn_tratamientos_solo_anular (0008): la única columna
-- que un UPDATE puede tocar es anulado/anulado_motivo.
create or replace function fn_comprobantes_nomina_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if new.clinica_id is distinct from old.clinica_id
    or new.empleado_id is distinct from old.empleado_id
    or new.tipo_periodo is distinct from old.tipo_periodo
    or new.fecha_inicio is distinct from old.fecha_inicio
    or new.fecha_fin is distinct from old.fecha_fin
    or new.salario_base is distinct from old.salario_base
    or new.auxilio_transporte is distinct from old.auxilio_transporte
    or new.comisiones is distinct from old.comisiones
    or new.neto_pagar is distinct from old.neto_pagar
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Un comprobante de nómina no se puede editar, solo anular. Para corregir un error, anúlalo y genera uno nuevo.';
  end if;
  return new;
end;
$$;

create or replace function fn_comprobantes_honorarios_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if new.clinica_id is distinct from old.clinica_id
    or new.empleado_id is distinct from old.empleado_id
    or new.fecha_inicio is distinct from old.fecha_inicio
    or new.fecha_fin is distinct from old.fecha_fin
    or new.valor_bruto is distinct from old.valor_bruto
    or new.retencion_fuente is distinct from old.retencion_fuente
    or new.neto_pagar is distinct from old.neto_pagar
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Un comprobante de honorarios no se puede editar, solo anular. Para corregir un error, anúlalo y genera uno nuevo.';
  end if;
  return new;
end;
$$;

create trigger comprobantes_nomina_solo_anular
  before update on comprobantes_nomina
  for each row execute function fn_comprobantes_nomina_solo_anular();

create trigger comprobantes_honorarios_solo_anular
  before update on comprobantes_honorarios
  for each row execute function fn_comprobantes_honorarios_solo_anular();

create trigger comprobantes_nomina_auditoria
  after insert or update or delete on comprobantes_nomina
  for each row execute function fn_auditoria();

create trigger comprobantes_honorarios_auditoria
  after insert or update or delete on comprobantes_honorarios
  for each row execute function fn_auditoria();

alter table comprobantes_nomina enable row level security;
alter table comprobantes_honorarios enable row level security;

create policy "comprobantes_nomina_select_con_permiso" on comprobantes_nomina
  for select using (clinica_id = clinica_actual() and has_permission('nomina', 'VIEW'));
create policy "comprobantes_nomina_insert_con_permiso" on comprobantes_nomina
  for insert with check (clinica_id = clinica_actual() and has_permission('nomina', 'CREATE'));
create policy "comprobantes_nomina_anular_con_permiso" on comprobantes_nomina
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'VOID'))
  with check (clinica_id = clinica_actual());

create policy "comprobantes_honorarios_select_con_permiso" on comprobantes_honorarios
  for select using (clinica_id = clinica_actual() and has_permission('nomina', 'VIEW'));
create policy "comprobantes_honorarios_insert_con_permiso" on comprobantes_honorarios
  for insert with check (clinica_id = clinica_actual() and has_permission('nomina', 'CREATE'));
create policy "comprobantes_honorarios_anular_con_permiso" on comprobantes_honorarios
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'VOID'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 13. Seed — catálogos globales (Colombia) y valores legales 2026
-- ============================================================
insert into fondos_pension (pais_id, codigo, nombre, orden)
select id, v.codigo, v.nombre, v.orden
from paises, (values
  ('COLPENSIONES', 'Colpensiones', 1),
  ('PORVENIR', 'Porvenir', 2),
  ('PROTECCION', 'Protección', 3),
  ('COLFONDOS', 'Colfondos', 4),
  ('SKANDIA', 'Skandia', 5)
) as v(codigo, nombre, orden)
where paises.codigo = 'CO';

insert into fondos_cesantias (pais_id, codigo, nombre, orden)
select id, v.codigo, v.nombre, v.orden
from paises, (values
  ('PORVENIR', 'Porvenir', 1),
  ('PROTECCION', 'Protección', 2),
  ('COLFONDOS', 'Colfondos', 3),
  ('SKANDIA', 'Skandia', 4),
  ('FNA', 'Fondo Nacional del Ahorro', 5)
) as v(codigo, nombre, orden)
where paises.codigo = 'CO';

insert into arls (pais_id, codigo, nombre, orden)
select id, v.codigo, v.nombre, v.orden
from paises, (values
  ('SURA', 'ARL Sura', 1),
  ('POSITIVA', 'Positiva Compañía de Seguros', 2),
  ('COLMENA', 'Colmena Seguros', 3),
  ('BOLIVAR', 'Seguros Bolívar', 4),
  ('AXA_COLPATRIA', 'Colpatria Seguros (AXA)', 5),
  ('EQUIDAD', 'La Equidad Seguros', 6),
  ('OTRA', 'Otra', 99)
) as v(codigo, nombre, orden)
where paises.codigo = 'CO';

insert into bancos (pais_id, codigo, nombre, orden)
select id, v.codigo, v.nombre, v.orden
from paises, (values
  ('BANCOLOMBIA', 'Bancolombia', 1),
  ('DAVIVIENDA', 'Davivienda', 2),
  ('BBVA', 'BBVA Colombia', 3),
  ('BOGOTA', 'Banco de Bogotá', 4),
  ('OCCIDENTE', 'Banco de Occidente', 5),
  ('POPULAR', 'Banco Popular', 6),
  ('CAJA_SOCIAL', 'Banco Caja Social', 7),
  ('AV_VILLAS', 'Banco AV Villas', 8),
  ('SCOTIABANK_COLPATRIA', 'Scotiabank Colpatria', 9),
  ('NEQUI', 'Nequi', 10),
  ('DAVIPLATA', 'Daviplata', 11),
  ('OTRO', 'Otro', 99)
) as v(codigo, nombre, orden)
where paises.codigo = 'CO';

-- Tarifas iniciales por clase de riesgo (Decreto 1607/2002, tabla
-- vigente) — editables, confirmado con el usuario que estos porcentajes
-- pueden variar por resolución futura.
insert into clases_riesgo (pais_id, codigo, nombre, tarifa_arl, orden)
select id, v.codigo, v.nombre, v.tarifa, v.orden
from paises, (values
  ('I', 'Riesgo I — Mínimo', 0.00522, 1),
  ('II', 'Riesgo II — Bajo', 0.01044, 2),
  ('III', 'Riesgo III — Medio', 0.02436, 3),
  ('IV', 'Riesgo IV — Alto', 0.04350, 4),
  ('V', 'Riesgo V — Máximo', 0.06960, 5)
) as v(codigo, nombre, tarifa, orden)
where paises.codigo = 'CO';

insert into valores_legales_pais (pais_id, anio, smlv, auxilio_transporte, uvt)
select id, 2026, 1750905, 249095, 52374
from paises where codigo = 'CO';

insert into tipos_contrato (codigo, nombre, categoria, orden) values
  ('TERMINO_FIJO', 'Término fijo', 'laboral', 1),
  ('TERMINO_INDEFINIDO', 'Término indefinido', 'laboral', 2),
  ('OBRA_LABOR', 'Obra o labor', 'laboral', 3),
  ('APRENDIZAJE', 'Contrato de aprendizaje (SENA)', 'laboral', 4),
  ('PRESTACION_SERVICIOS', 'Prestación de servicios', 'servicios', 5);

insert into tipos_examen_ocupacional (codigo, nombre, orden) values
  ('INGRESO', 'Ingreso', 1),
  ('PERIODICO', 'Periódico', 2),
  ('RETIRO', 'Retiro', 3);

insert into tipos_cuenta_bancaria (codigo, nombre, orden) values
  ('AHORROS', 'Ahorros', 1),
  ('CORRIENTE', 'Corriente', 2);

insert into tipos_documento_normativo (codigo, nombre, categoria, orden) values
  ('PROTOCOLO_CONTRATACION', 'Protocolo de contratación', 'rrhh', 1),
  ('MANUAL_FUNCIONES', 'Manual de funciones', 'rrhh', 2),
  ('PROTOCOLO_ACOSO_SEXUAL', 'Protocolo de atención de acoso sexual', 'rrhh', 3),
  ('PROTOCOLO_ACOSO_LABORAL', 'Protocolo de atención de acoso laboral', 'rrhh', 4),
  ('REGLAMENTO_COMITE_CONVIVENCIA', 'Reglamento del Comité de Convivencia Laboral', 'rrhh', 5),
  ('PROTOCOLO_VACACIONES', 'Protocolo de solicitud de vacaciones', 'rrhh', 6),
  ('PROTOCOLO_REPORTE_ACCIDENTES', 'Protocolo de reporte de accidentes de trabajo', 'rrhh', 7),
  ('REGLAMENTO_INTERNO_TRABAJO', 'Reglamento Interno de Trabajo', 'rrhh', 8),
  ('POLITICA_SST', 'Política de Seguridad y Salud en el Trabajo', 'sgsst', 9);

-- ============================================================
-- 14. Registrar los módulos en RBAC — incluidos en TODOS los planes
--     (es_administrativo=true, mismo criterio que Usuarios/Parámetros/
--     Suscripción/Medio Ambiente: requisito legal de la clínica, no una
--     feature de plan).
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('rrhh', 'Recursos Humanos', 'Empleados, documentación, historial de cargo/salario, incapacidades, vacaciones, accidentes de trabajo y protocolos.', '/rrhh', 9, true),
  ('nomina', 'Nómina', 'Comprobantes de pago de nómina (empleados) y honorarios (contratos por servicios).', null, 10, true);

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true
from planes p
cross join modulos m
where m.codigo in ('rrhh', 'nomina');

do $$
declare
  v_clinica record;
begin
  for v_clinica in select id from clinicas loop
    perform fn_sync_clinica_modulos(v_clinica.id);
  end loop;
end;
$$;

-- Backfill deliberadamente restringido a Administrador (nivel=1) en
-- clínicas ya existentes — a diferencia de Medio Ambiente (operativo, sin
-- datos sensibles), RRHH/Nómina manejan salarios: el admin de cada clínica
-- decide después, vía la matriz de permisos, si delega esto a otro rol.
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where r.nivel = 1 and m.codigo = 'rrhh' and p.codigo in ('VIEW', 'CREATE', 'EDIT', 'VOID')
on conflict do nothing;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r
cross join modulos m
cross join permisos p
where r.nivel = 1 and m.codigo = 'nomina' and p.codigo in ('VIEW', 'CREATE', 'VOID')
on conflict do nothing;

-- Generaliza bootstrap_clinica() (misma versión que dejó la migración
-- 0038, se agregan los 2 módulos nuevos) para que las clínicas nuevas
-- también reciban permiso de rol sobre RRHH y Nómina.
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

  insert into clinicas (nombre, nit, plan, plan_id)
  values (p_nombre_clinica, p_nit, 'trial', v_plan_gratis_id)
  returning id into v_clinica_id;

  update clinicas set pais_operacion_id = (select id from paises where codigo = 'CO') where id = v_clinica_id;

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
    'inventario', 'campanas', 'suscripcion', 'medio_ambiente', 'rrhh', 'nomina'
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
