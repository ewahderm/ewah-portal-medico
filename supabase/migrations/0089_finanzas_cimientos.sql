-- ============================================================
-- 0089 · Flujo de caja FC1 · Cimientos
-- ============================================================
-- Diseño: docs/finanzas/etapa1-flujo-de-caja.md (HU-0, HU-1, HU-2 y §4/§5).
--   1. Módulo `finanzas` (todos los planes; sub-feature `gestion` solo Pro)
--      + backfill a Administradores.
--   2. fin_config: fecha de inicio del flujo de caja (configurable).
--   3. fin_categorias (global) con su actividad de flujo NIIF (operación,
--      inversión, financiación) y su cuenta PUC por defecto (oculta en la
--      Etapa 1: la usará la contabilidad) + fin_categorias_clinica
--      (renombrar, desactivar, crear propias).
--   4. fin_socios y fin_cuentas (banco, Nequi, Daviplata, efectivo COP/USD/
--      EUR, pasarela, tarjeta de crédito de socio) con saldo inicial a la
--      fecha de inicio. El saldo se calcula, no se guarda.
--   5. fn_fin_activar(): el asistente de arranque en una sola transacción
--      (invoker: las políticas RLS aplican igual).

-- ============================================================
-- 1. RBAC, plan y entitlement
-- ============================================================
insert into modulos (codigo, nombre, descripcion, ruta, orden, es_administrativo) values
  ('finanzas', 'Flujo de caja',
   'Cuentas, ingresos y egresos por categoría, pasarela de pagos, socios y cierre mensual de caja.',
   '/finanzas', 11, true)
on conflict (codigo) do nothing;

insert into plan_modulos (plan_id, modulo_id, incluido)
select p.id, m.id, true from planes p cross join modulos m where m.codigo = 'finanzas'
on conflict do nothing;

insert into plan_features (plan_id, modulo_id, feature_codigo, incluido)
select p.id, m.id, 'gestion', (p.codigo = 'pro') from planes p join modulos m on m.codigo = 'finanzas'
on conflict do nothing;

do $$
declare v record;
begin
  for v in select id from clinicas loop
    perform fn_sync_clinica_modulos(v.id);
  end loop;
end $$;

insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select r.id, m.id, p.id
from roles r cross join modulos m cross join permisos p
where r.nivel = 1 and m.codigo = 'finanzas'
  and p.codigo in ('VIEW', 'CREATE', 'EDIT', 'VOID', 'APPROVE', 'EXPORT')
on conflict do nothing;

-- ============================================================
-- 2. Configuración: fecha de inicio
-- ============================================================
create table fin_config (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null unique references clinicas(id) on delete cascade,
  -- Desde esta fecha la clínica lleva su caja en EWAH: los saldos iniciales
  -- de las cuentas son a esta fecha y nada anterior se registra.
  fecha_inicio date not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger fin_config_00_autor before insert or update on fin_config
  for each row execute function fn_hab_forzar_autor();
create trigger fin_config_fecha_no_futura before insert or update of fecha_inicio on fin_config
  for each row execute function fn_sst_fecha_no_futura('fecha_inicio');
create trigger fin_config_set_updated_at before update on fin_config
  for each row execute function set_updated_at();
create trigger fin_config_no_borrar before delete on fin_config
  for each row execute function fn_hab_inmutable('La configuración del flujo de caja no se borra.');
create trigger fin_config_auditoria after insert or update on fin_config
  for each row execute function fn_auditoria();

alter table fin_config enable row level security;
create policy "fin_config_select" on fin_config
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_config_insert" on fin_config
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'));
create policy "fin_config_update" on fin_config
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 3. Categorías
-- ============================================================
-- actividad: estructura del estado de flujos de efectivo (NIIF para Pymes,
-- Sección 7, método directo). puc_codigo_defecto: cuenta de 4 dígitos del
-- PUC (Dec. 2650/1993) que usará la etapa contable; el contador la confirma
-- (docs/finanzas/requerimientos-finanzas-contabilidad-activos.md §5).
create table fin_categorias (
  codigo text primary key check (codigo ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  nombre text not null,
  tipo text not null check (tipo in ('ingreso', 'egreso', 'transferencia', 'ambos')),
  actividad text not null check (actividad in ('operacion', 'inversion', 'financiacion')),
  puc_codigo_defecto text check (puc_codigo_defecto ~ '^[1-9][0-9]{3}$'),
  comportamiento text not null check (comportamiento in (
    'ingreso', 'gasto', 'inventario', 'activo_fijo', 'anticipo_impuesto',
    'prestamo_socio', 'aporte_socio', 'reembolso_socio', 'ajuste_caja')),
  -- Automáticas: las registra el sistema (tratamientos, Bold, reembolsos,
  -- cierre); el usuario no las elige ni las desactiva.
  automatica boolean not null default false,
  icono text not null,
  ayuda text not null,
  orden int not null
);

alter table fin_categorias enable row level security;
create policy "fin_categorias_select" on fin_categorias for select to authenticated using (true);

insert into fin_categorias (codigo, nombre, tipo, actividad, puc_codigo_defecto, comportamiento, automatica, icono, ayuda, orden) values
  -- Ingresos
  ('SERVICIOS_SALUD', 'Servicios de salud', 'ingreso', 'operacion', '4165', 'ingreso', true, 'stethoscope', 'Lo que pagan los pacientes por los tratamientos. Se registra solo desde cada tratamiento.', 10),
  ('OTROS_INGRESOS', 'Otros ingresos', 'ingreso', 'operacion', '4295', 'ingreso', false, 'coins', 'Entradas que no son por servicios: venta de un producto, una devolución de un proveedor…', 20),
  ('REINTEGROS', 'Reintegros recibidos', 'ingreso', 'operacion', '4250', 'ingreso', false, 'undo-2', 'Plata que te devuelven: una incapacidad que paga la EPS, un cobro que te reembolsan.', 30),
  ('PRESTAMO_DE_SOCIO', 'Préstamo de socio', 'ingreso', 'financiacion', '2355', 'prestamo_socio', false, 'hand-coins', 'Un socio le presta plata a la clínica. No es ingreso: la clínica se la debe devolver.', 40),
  ('APORTE_SOCIO', 'Aporte de socio', 'ingreso', 'financiacion', '3105', 'aporte_socio', false, 'piggy-bank', 'Un socio pone capital en la clínica sin que haya que devolverlo.', 50),
  -- Egresos
  ('COMPRA_INSUMOS', 'Compra Insumos', 'egreso', 'operacion', '1455', 'inventario', false, 'package', 'Toxina, rellenos, jeringas, guantes y demás insumos para los tratamientos.', 110),
  ('ARRENDAMIENTO', 'Arrendamiento', 'egreso', 'operacion', '5120', 'gasto', false, 'building-2', 'El arriendo del local o del consultorio.', 120),
  ('NOMINA', 'Nómina', 'egreso', 'operacion', '5105', 'gasto', false, 'users', 'Pago de salarios y prestaciones a los empleados.', 130),
  ('PLANILLA', 'Planilla', 'egreso', 'operacion', '2370', 'gasto', false, 'file-spreadsheet', 'Pago de la planilla de seguridad social (PILA): salud, pensión, ARL y parafiscales.', 140),
  ('SERVICIOS_PUBLICOS', 'Servicios Públicos', 'egreso', 'operacion', '5135', 'gasto', false, 'zap', 'Agua, luz, gas, teléfono e internet.', 150),
  ('PREPAGADA', 'Prepagada', 'egreso', 'operacion', '5105', 'gasto', false, 'heart-pulse', 'Medicina prepagada de los socios, que son empleados de la clínica.', 160),
  ('GASOLINA', 'Gasolina', 'egreso', 'operacion', '5195', 'gasto', false, 'fuel', 'Combustible de los vehículos de la clínica.', 170),
  ('IA_REDES', 'IA & Redes Sociales', 'egreso', 'operacion', '5235', 'gasto', false, 'sparkles', 'Pauta en redes, herramientas de inteligencia artificial y contenido.', 180),
  ('SOFTWARE_WEB', 'Software & Página WEB', 'egreso', 'operacion', '5135', 'gasto', false, 'monitor-smartphone', 'Suscripciones de software, dominio, hosting y página web.', 190),
  ('IMPUESTOS', 'Impuestos', 'egreso', 'operacion', '5115', 'gasto', false, 'landmark', 'ICA, predial, renta, 4 por mil y demás impuestos.', 200),
  ('CAMARA_COMERCIO', 'Cámara de Comercio', 'egreso', 'operacion', '5140', 'gasto', false, 'stamp', 'Renovación de la matrícula mercantil y certificados.', 210),
  ('CONTABILIDAD', 'Contabilidad', 'egreso', 'operacion', '5110', 'gasto', false, 'calculator', 'Honorarios del contador o la firma contable.', 220),
  ('HABILITACION_SGSST', 'Habilitación & SGSST', 'egreso', 'operacion', '5140', 'gasto', false, 'shield-check', 'Trámites, asesorías, mantenimientos y calibraciones para habilitación y SG-SST.', 230),
  ('COMPRA_ACTIVOS', 'Compra Activos', 'egreso', 'inversion', '1532', 'activo_fijo', false, 'armchair', 'Equipos biomédicos, muebles, computadores y obras que se usan por más de un año.', 240),
  ('PRESTAMO_A_SOCIO', 'Préstamo a socio', 'egreso', 'financiacion', '1325', 'prestamo_socio', false, 'hand-coins', 'La clínica le presta plata a un socio. No es gasto: el socio la debe devolver. Sin intereses.', 250),
  ('OTROS_GASTOS', 'Otros Gastos', 'egreso', 'operacion', '5195', 'gasto', false, 'ellipsis', 'Lo que no encaja en las demás categorías.', 260),
  -- Automáticas
  ('COMISION_PASARELA', 'Comisión pasarela', 'egreso', 'operacion', '5305', 'gasto', true, 'credit-card', 'Lo que cobra Bold (u otra pasarela) por cada pago con tarjeta. Se registra al liquidar.', 300),
  ('RETENCIONES_PRACTICADAS', 'Retenciones que nos practicaron', 'egreso', 'operacion', '1355', 'anticipo_impuesto', true, 'receipt', 'Lo que la pasarela retiene por impuestos. No es gasto: se descuenta en la declaración.', 310),
  ('REEMBOLSO_SOCIO', 'Reembolso a socio', 'transferencia', 'financiacion', '2355', 'reembolso_socio', true, 'arrow-left-right', 'Pago al socio de lo que se le debe por gastos hechos con su tarjeta.', 320),
  ('AJUSTE_CAJA', 'Sobrante o faltante de caja', 'ambos', 'operacion', '5195', 'ajuste_caja', true, 'scale', 'Diferencia entre lo contado y lo que dice el sistema al cerrar el mes.', 330);

create table fin_categorias_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  -- Personalización de una global (categoria_codigo) o categoría propia
  -- (nombre, tipo, actividad). Las propias quedan sin cuenta PUC hasta que
  -- el contador la asigne en la etapa contable.
  categoria_codigo text references fin_categorias(codigo),
  nombre text check (length(btrim(nombre)) between 3 and 60),
  tipo text check (tipo in ('ingreso', 'egreso')),
  actividad text check (actividad in ('operacion', 'inversion', 'financiacion')),
  activa boolean not null default true,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (clinica_id, categoria_codigo),
  constraint fin_categoria_propia_completa check (
    categoria_codigo is not null or (nombre is not null and tipo is not null and actividad is not null)
  )
);

create unique index fin_categorias_clinica_nombre_unico
  on fin_categorias_clinica (clinica_id, lower(btrim(nombre))) where nombre is not null;

create or replace function fn_fin_categoria_clinica_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.categoria_codigo is distinct from old.categoria_codigo
     or (old.categoria_codigo is null and (new.tipo <> old.tipo or new.actividad <> old.actividad))) then
    raise exception 'Una categoría no cambia de tipo ni de actividad: crea otra.';
  end if;
  if new.categoria_codigo is not null then
    if (select automatica from fin_categorias where codigo = new.categoria_codigo) then
      if not new.activa or new.nombre is not null then
        raise exception 'Las categorías automáticas no se renombran ni se desactivan.';
      end if;
    end if;
    -- La personalización de una global no redefine tipo ni actividad.
    new.tipo := null;
    new.actividad := null;
  end if;
  return new;
end;
$$;

create trigger fin_categorias_clinica_00_autor before insert or update on fin_categorias_clinica
  for each row execute function fn_hab_forzar_autor();
create trigger fin_categorias_clinica_proteger before insert or update on fin_categorias_clinica
  for each row execute function fn_fin_categoria_clinica_proteger();
create trigger fin_categorias_clinica_set_updated_at before update on fin_categorias_clinica
  for each row execute function set_updated_at();
create trigger fin_categorias_clinica_no_borrar before delete on fin_categorias_clinica
  for each row execute function fn_hab_inmutable('Una categoría no se borra: desactívala.');
create trigger fin_categorias_clinica_auditoria after insert or update on fin_categorias_clinica
  for each row execute function fn_auditoria();

alter table fin_categorias_clinica enable row level security;
create policy "fin_categorias_clinica_select" on fin_categorias_clinica
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_categorias_clinica_insert" on fin_categorias_clinica
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'));
create policy "fin_categorias_clinica_update" on fin_categorias_clinica
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- Categorías visibles para la clínica (globales + propias, con su
-- personalización). Invoker: respeta RLS.
create or replace view v_fin_categorias
with (security_invoker = true) as
select
  coalesce(g.codigo, 'PROPIA_' || c.id::text) as codigo,
  c.id as personalizacion_id,
  coalesce(c.nombre, g.nombre) as nombre,
  g.nombre as nombre_original,
  coalesce(g.tipo, c.tipo) as tipo,
  coalesce(g.actividad, c.actividad) as actividad,
  g.puc_codigo_defecto,
  coalesce(g.comportamiento, case c.tipo when 'ingreso' then 'ingreso' else 'gasto' end) as comportamiento,
  coalesce(g.automatica, false) as automatica,
  coalesce(c.activa, true) as activa,
  coalesce(g.icono, 'tag') as icono,
  coalesce(g.ayuda, 'Categoría propia de la clínica.') as ayuda,
  coalesce(g.orden, 1000) as orden,
  g.codigo is null as propia
from fin_categorias g
-- RLS deja ver solo las filas de la propia clínica.
full join fin_categorias_clinica c on c.categoria_codigo = g.codigo;

-- ============================================================
-- 4. Socios y cuentas de dinero
-- ============================================================
create table fin_socios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo_identificacion_id uuid references tipos_identificacion(id),
  numero_identificacion text not null check (numero_identificacion ~ '^[0-9A-Za-z-]{3,20}$'),
  nombre text not null check (length(btrim(nombre)) between 3 and 200),
  porcentaje_participacion numeric(5, 2) check (porcentaje_participacion > 0 and porcentaje_participacion <= 100),
  -- Los socios suelen ser empleados de la clínica (RRHH); opcional.
  empleado_id uuid references empleados(id) on delete set null,
  activo boolean not null default true,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (clinica_id, numero_identificacion)
);

create or replace function fn_fin_socios_participacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select coalesce(sum(porcentaje_participacion), 0) from fin_socios
      where clinica_id = new.clinica_id and activo and id <> new.id) + coalesce(case when new.activo then new.porcentaje_participacion end, 0) > 100 then
    raise exception 'La participación de los socios activos suma más del 100 %%.';
  end if;
  return new;
end;
$$;

create trigger fin_socios_00_autor before insert or update on fin_socios
  for each row execute function fn_hab_forzar_autor();
create trigger fin_socios_participacion before insert or update on fin_socios
  for each row execute function fn_fin_socios_participacion();
create trigger fin_socios_empleado_misma_clinica before insert or update of empleado_id, clinica_id on fin_socios
  for each row execute function fn_hab_misma_clinica('empleado_id', 'empleados', 'El empleado no pertenece a esta clínica.');
create trigger fin_socios_set_updated_at before update on fin_socios
  for each row execute function set_updated_at();
create trigger fin_socios_no_borrar before delete on fin_socios
  for each row execute function fn_hab_inmutable('Un socio no se borra: desactívalo.');
create trigger fin_socios_auditoria after insert or update on fin_socios
  for each row execute function fn_auditoria();

alter table fin_socios enable row level security;
create policy "fin_socios_select" on fin_socios
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_socios_insert" on fin_socios
  for insert to authenticated with check (
    clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT') and has_entitlement('finanzas', 'gestion'));
create policy "fin_socios_update" on fin_socios
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT') and has_entitlement('finanzas', 'gestion'))
  with check (clinica_id = clinica_actual());

create table fin_cuentas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 2 and 60),
  tipo text not null check (tipo in ('banco', 'nequi', 'daviplata', 'efectivo', 'pasarela', 'tarjeta_socio')),
  moneda text not null default 'COP' check (moneda in ('COP', 'USD', 'EUR')),
  socio_id uuid references fin_socios(id),
  banco_id uuid references bancos(id),
  ultimos_digitos text check (ultimos_digitos ~ '^[0-9]{4}$'),
  sede_id uuid references sedes(id),
  -- Saldo a la fecha de inicio. En la tarjeta del socio es lo que la
  -- clínica ya le debía (se guarda negativo: es un pasivo).
  saldo_inicial numeric(16, 2) not null default 0,
  activa boolean not null default true,
  orden int not null default 0,
  -- La pasarela (plata por abonar) y la tarjeta del socio (deuda) no son
  -- dinero disponible de la clínica.
  es_disponible boolean generated always as (tipo not in ('pasarela', 'tarjeta_socio')) stored,
  -- Cuenta PUC por defecto para la etapa contable.
  puc_codigo_defecto text generated always as (case tipo
    when 'efectivo' then '1105' when 'pasarela' then '1345' when 'tarjeta_socio' then '2355' else '1110' end) stored,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint fin_cuenta_socio check ((tipo = 'tarjeta_socio') = (socio_id is not null)),
  constraint fin_cuenta_moneda check (moneda = 'COP' or tipo = 'efectivo'),
  constraint fin_cuenta_saldo_signo check (
    (tipo <> 'tarjeta_socio' or saldo_inicial <= 0)
    and (tipo not in ('efectivo', 'pasarela', 'nequi', 'daviplata') or saldo_inicial >= 0))
);

create unique index fin_cuentas_nombre_unico on fin_cuentas (clinica_id, lower(btrim(nombre)));

create or replace function fn_fin_cuenta_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo in ('pasarela', 'tarjeta_socio') and current_user in ('authenticated', 'anon')
     and not has_entitlement('finanzas', 'gestion') then
    raise exception 'Las cuentas de pasarela y de tarjeta de socio están disponibles en el plan Pro.';
  end if;
  if tg_op = 'UPDATE' and (new.tipo <> old.tipo or new.moneda <> old.moneda or new.socio_id is distinct from old.socio_id) then
    raise exception 'Una cuenta no cambia de tipo, moneda ni socio: crea otra y desactiva esta.';
  end if;
  return new;
end;
$$;

create trigger fin_cuentas_00_autor before insert or update on fin_cuentas
  for each row execute function fn_hab_forzar_autor();
create trigger fin_cuentas_proteger before insert or update on fin_cuentas
  for each row execute function fn_fin_cuenta_proteger();
create trigger fin_cuentas_socio_misma_clinica before insert or update of socio_id, clinica_id on fin_cuentas
  for each row execute function fn_hab_misma_clinica('socio_id', 'fin_socios', 'El socio no pertenece a esta clínica.');
create trigger fin_cuentas_sede_misma_clinica before insert or update of sede_id, clinica_id on fin_cuentas
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');
create trigger fin_cuentas_set_updated_at before update on fin_cuentas
  for each row execute function set_updated_at();
create trigger fin_cuentas_no_borrar before delete on fin_cuentas
  for each row execute function fn_hab_inmutable('Una cuenta no se borra: desactívala.');
create trigger fin_cuentas_auditoria after insert or update on fin_cuentas
  for each row execute function fn_auditoria();

alter table fin_cuentas enable row level security;
create policy "fin_cuentas_select" on fin_cuentas
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'VIEW'));
create policy "fin_cuentas_insert" on fin_cuentas
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'));
create policy "fin_cuentas_update" on fin_cuentas
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('finanzas', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 5. Asistente de arranque (una transacción)
-- ============================================================
-- p_cuentas: [{ "nombre", "tipo", "moneda", "saldo_inicial", "socio_indice"? }]
-- p_socios:  [{ "nombre", "numero_identificacion", "tipo_identificacion_id"?, "porcentaje_participacion"? }]
-- socio_indice apunta a la posición (desde 0) del socio en p_socios, para
-- crear su tarjeta en la misma llamada. Invoker: cada insert pasa por RLS.
create or replace function fn_fin_activar(p_fecha_inicio date, p_cuentas jsonb, p_socios jsonb default '[]'::jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_socios uuid[] := '{}';
  v_id uuid;
  v_s jsonb;
  v_c jsonb;
  v_indice int;
begin
  if v_clinica is null or not has_permission('finanzas', 'EDIT') then
    raise exception 'No tienes permiso para configurar el flujo de caja.';
  end if;
  if exists (select 1 from fin_config where clinica_id = v_clinica) then
    raise exception 'El flujo de caja ya está activado.';
  end if;
  if jsonb_typeof(p_cuentas) <> 'array' or jsonb_array_length(p_cuentas) = 0 then
    raise exception 'Agrega al menos una cuenta.';
  end if;
  if jsonb_typeof(p_socios) <> 'array' or jsonb_array_length(p_socios) > 20 or jsonb_array_length(p_cuentas) > 30 then
    raise exception 'Datos del asistente inválidos.';
  end if;

  insert into fin_config (clinica_id, fecha_inicio) values (v_clinica, p_fecha_inicio);

  for v_s in select value from jsonb_array_elements(p_socios) loop
    insert into fin_socios (clinica_id, tipo_identificacion_id, numero_identificacion, nombre, porcentaje_participacion)
    values (v_clinica, nullif(v_s ->> 'tipo_identificacion_id', '')::uuid, btrim(v_s ->> 'numero_identificacion'),
            btrim(v_s ->> 'nombre'), nullif(v_s ->> 'porcentaje_participacion', '')::numeric)
    returning id into v_id;
    v_socios := v_socios || v_id;
  end loop;

  for v_c in select value from jsonb_array_elements(p_cuentas) loop
    v_indice := nullif(v_c ->> 'socio_indice', '')::int;
    if v_indice is not null and (v_indice < 0 or v_indice >= coalesce(array_length(v_socios, 1), 0)) then
      raise exception 'La tarjeta apunta a un socio que no existe.';
    end if;
    insert into fin_cuentas (clinica_id, nombre, tipo, moneda, saldo_inicial, socio_id, orden)
    values (v_clinica, btrim(v_c ->> 'nombre'), v_c ->> 'tipo', coalesce(v_c ->> 'moneda', 'COP'),
            coalesce((v_c ->> 'saldo_inicial')::numeric, 0),
            case when v_indice is not null then v_socios[v_indice + 1] end,
            coalesce((v_c ->> 'orden')::int, 0));
  end loop;
end;
$$;

revoke execute on function fn_fin_activar(date, jsonb, jsonb) from public, anon;
grant execute on function fn_fin_activar(date, jsonb, jsonb) to authenticated;
revoke execute on function fn_fin_categoria_clinica_proteger() from public, anon, authenticated;
revoke execute on function fn_fin_socios_participacion() from public, anon, authenticated;
revoke execute on function fn_fin_cuenta_proteger() from public, anon, authenticated;
