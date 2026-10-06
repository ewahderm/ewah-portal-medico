-- EWAH Tech Platform — Nómina colombiana completa (pedido del usuario 2026-10-06):
-- valores anuales con su norma, Fondo de Solidaridad Pensional, salario
-- integral, liquidación de prestaciones sociales y NIT editable.
-- Aplicar con: npx supabase db push --linked
--
-- Todo valor legal de esta migración se verificó en vivo contra la fuente
-- oficial el 2026-10-06 (regla del proyecto: nada regulatorio desde memoria):
--   - SMLMV / auxilio de transporte: Decretos 2292 y 2293 de 2023 (2024),
--     1572 y 1573 de 2024 (2025), 1469 y 1470 de 2025 (2026). El 1469 fue
--     suspendido provisionalmente por el Consejo de Estado (12-feb-2026) y
--     reemplazado por el Decreto 0159 de 2026 (transitorio, mismo valor
--     $1.750.905, sin efectos retroactivos). El auxilio (Decreto 1470) no
--     fue afectado.
--   - Fondo de Solidaridad Pensional: Ley 100/1993 art. 20 modificado por
--     Ley 797/2003 art. 7 (texto en funcionpublica.gov.co): 1% desde 4
--     SMLMV, + 0,2 a 1 punto adicional de 16 a más de 20 SMLMV. La reforma
--     pensional (Ley 2381/2024) cambia estos porcentajes pero entra a regir
--     el 1-abr-2027 — por eso los tramos llevan vigencia y la reforma se
--     carga después como filas nuevas, sin tocar código.
--   - Salario integral: CST art. 132 + guía UGPP 2026 — mínimo 13 SMLMV
--     (10 + 30% prestacional), aportes y parafiscales sobre el 70%, sin
--     exoneración del art. 114-1 ET, no causa prima/cesantías/intereses.
--   - Tope del IBC: 25 SMLMV (Ley 797/2003 art. 5).
--   - Prima (CST art. 306), cesantías (CST art. 249), intereses 12% anual
--     (Ley 52/1975).

-- ============================================================
-- 1. Valores legales anuales: norma de origen + 2024 y 2025
-- ============================================================
alter table valores_legales_pais add column norma text;

insert into valores_legales_pais (pais_id, anio, smlv, auxilio_transporte, norma)
select id, v.anio, v.smlv, v.aux, v.norma
from paises, (values
  (2024, 1300000, 162000, 'Decreto 2292 de 2023 (SMLMV) · Decreto 2293 de 2023 (auxilio de transporte)'),
  (2025, 1423500, 200000, 'Decreto 1572 de 2024 (SMLMV) · Decreto 1573 de 2024 (auxilio de transporte)')
) as v(anio, smlv, aux, norma)
where paises.codigo = 'CO'
on conflict (pais_id, anio) do nothing;

update valores_legales_pais
set norma = 'Decreto 0159 de 2026, transitorio (reemplaza al 1469 de 2025, suspendido por el Consejo de Estado) · Decreto 1470 de 2025 (auxilio de transporte)'
where anio = 2026 and pais_id = (select id from paises where codigo = 'CO');

-- ============================================================
-- 2. Tramos del Fondo de Solidaridad Pensional, con vigencia
-- ============================================================
create table fondo_solidaridad_tramos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  vigente_desde date not null,
  vigente_hasta date,
  desde_smlv numeric(6,2) not null,
  hasta_smlv numeric(6,2),
  porcentaje numeric(6,4) not null,
  norma text not null,
  created_at timestamptz not null default now()
);

alter table fondo_solidaridad_tramos enable row level security;

create policy "fondo_solidaridad_tramos_select_all" on fondo_solidaridad_tramos
  for select to authenticated using (true);

create policy "fondo_solidaridad_tramos_write_super_admin" on fondo_solidaridad_tramos
  for all using (es_super_admin()) with check (es_super_admin());

-- `desde` inclusivo, `hasta` exclusivo (ingreso >= desde y < hasta). Total
-- a cargo del trabajador = 1% base + adicional de subsistencia.
insert into fondo_solidaridad_tramos (pais_id, vigente_desde, desde_smlv, hasta_smlv, porcentaje, norma)
select id, date '2003-01-29', v.desde, v.hasta, v.pct, 'Ley 100 de 1993 art. 20, modificado por Ley 797 de 2003 art. 7'
from paises, (values
  (4::numeric, 16::numeric, 0.0100::numeric),
  (16, 17, 0.0120),
  (17, 18, 0.0140),
  (18, 19, 0.0160),
  (19, 20, 0.0180),
  (20, null, 0.0200)
) as v(desde, hasta, pct)
where paises.codigo = 'CO';

-- ============================================================
-- 3. Salario integral en el historial de salario
-- ============================================================
alter table historial_salarios_empleado
  add column tipo_salario text not null default 'ordinario'
  check (tipo_salario in ('ordinario', 'integral'));

-- ============================================================
-- 4. Comprobante de nómina: FSP + marca de salario integral
-- ============================================================
alter table comprobantes_nomina
  add column deduccion_fsp numeric(12,2) not null default 0,
  add column salario_integral boolean not null default false;

create or replace function fn_comprobantes_nomina_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if old.aprobado = true then
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.tipo_periodo is distinct from old.tipo_periodo
      or new.fecha_inicio is distinct from old.fecha_inicio
      or new.fecha_fin is distinct from old.fecha_fin
      or new.salario_base is distinct from old.salario_base
      or new.auxilio_transporte is distinct from old.auxilio_transporte
      or new.comisiones is distinct from old.comisiones
      or new.comisiones_incluidas_ibc is distinct from old.comisiones_incluidas_ibc
      or new.deduccion_salud is distinct from old.deduccion_salud
      or new.deduccion_pension is distinct from old.deduccion_pension
      or new.deduccion_fsp is distinct from old.deduccion_fsp
      or new.salario_integral is distinct from old.salario_integral
      or new.aporte_patronal_salud is distinct from old.aporte_patronal_salud
      or new.aporte_patronal_pension is distinct from old.aporte_patronal_pension
      or new.aporte_arl is distinct from old.aporte_arl
      or new.aporte_parafiscales is distinct from old.aporte_parafiscales
      or new.exonerado_aportes is distinct from old.exonerado_aportes
      or new.retencion_fuente is distinct from old.retencion_fuente
      or new.otras_deducciones is distinct from old.otras_deducciones
      or new.neto_pagar is distinct from old.neto_pagar
      or new.aprobado is distinct from old.aprobado
      or new.aprobado_en is distinct from old.aprobado_en
      or new.aprobado_por is distinct from old.aprobado_por
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Un comprobante de nómina aprobado no se puede editar, solo anular.';
    end if;
  else
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'No se puede cambiar la identidad de un comprobante de nómina.';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 5. Liquidación de prestaciones sociales (recibo propio, decisión del
--    usuario): prima 1er semestre, o fin de año = prima 2º semestre +
--    cesantías + intereses. Mismo flujo borrador → aprobado → anulado que
--    comprobantes_nomina (0051). Las cesantías se CONSIGNAN al fondo, no se
--    pagan al trabajador — por eso dos totales separados.
-- ============================================================
create table comprobantes_prestaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  empleado_id uuid not null references empleados(id),
  tipo text not null check (tipo in ('prima_primer_semestre', 'fin_de_anio')),
  anio int not null,
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  base_prima numeric(12,2) not null default 0,
  dias_prima int not null default 0,
  valor_prima numeric(12,2) not null default 0,
  base_cesantias numeric(12,2) not null default 0,
  dias_cesantias int not null default 0,
  valor_cesantias numeric(12,2) not null default 0,
  valor_intereses_cesantias numeric(12,2) not null default 0,
  total_pagar_trabajador numeric(12,2) not null,
  total_consignar_fondo numeric(12,2) not null default 0,
  aprobado boolean not null default false,
  aprobado_en timestamptz,
  aprobado_por uuid references usuarios(id),
  anulado boolean not null default false,
  anulado_motivo text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index comprobantes_prestaciones_empleado_idx on comprobantes_prestaciones(empleado_id, anio desc);

-- Una sola liquidación vigente por empleado/año/tipo — anular libera el
-- cupo para generar la corregida.
create unique index comprobantes_prestaciones_unica_vigente
  on comprobantes_prestaciones(empleado_id, anio, tipo) where not anulado;

create or replace function fn_comprobantes_prestaciones_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if old.aprobado = true then
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.tipo is distinct from old.tipo
      or new.anio is distinct from old.anio
      or new.fecha_inicio is distinct from old.fecha_inicio
      or new.fecha_fin is distinct from old.fecha_fin
      or new.base_prima is distinct from old.base_prima
      or new.dias_prima is distinct from old.dias_prima
      or new.valor_prima is distinct from old.valor_prima
      or new.base_cesantias is distinct from old.base_cesantias
      or new.dias_cesantias is distinct from old.dias_cesantias
      or new.valor_cesantias is distinct from old.valor_cesantias
      or new.valor_intereses_cesantias is distinct from old.valor_intereses_cesantias
      or new.total_pagar_trabajador is distinct from old.total_pagar_trabajador
      or new.total_consignar_fondo is distinct from old.total_consignar_fondo
      or new.aprobado is distinct from old.aprobado
      or new.aprobado_en is distinct from old.aprobado_en
      or new.aprobado_por is distinct from old.aprobado_por
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Una liquidación de prestaciones aprobada no se puede editar, solo anular.';
    end if;
  else
    if new.clinica_id is distinct from old.clinica_id
      or new.empleado_id is distinct from old.empleado_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'No se puede cambiar la identidad de una liquidación de prestaciones.';
    end if;
  end if;
  return new;
end;
$$;

create trigger comprobantes_prestaciones_solo_anular
  before update on comprobantes_prestaciones
  for each row execute function fn_comprobantes_prestaciones_solo_anular();

create trigger comprobantes_prestaciones_auditoria
  after insert or update or delete on comprobantes_prestaciones
  for each row execute function fn_auditoria();

alter table comprobantes_prestaciones enable row level security;

create policy "comprobantes_prestaciones_select_con_permiso" on comprobantes_prestaciones
  for select using (clinica_id = clinica_actual() and has_permission('nomina', 'VIEW'));

create policy "comprobantes_prestaciones_insert_con_permiso" on comprobantes_prestaciones
  for insert with check (clinica_id = clinica_actual() and has_permission('nomina', 'CREATE') and aprobado = false);

create policy "comprobantes_prestaciones_editar_borrador" on comprobantes_prestaciones
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'EDIT') and aprobado = false)
  with check (clinica_id = clinica_actual());

create policy "comprobantes_prestaciones_anular_aprobado" on comprobantes_prestaciones
  for update using (clinica_id = clinica_actual() and has_permission('nomina', 'VOID') and aprobado = true)
  with check (clinica_id = clinica_actual());

create policy "comprobantes_prestaciones_eliminar_borrador" on comprobantes_prestaciones
  for delete using (clinica_id = clinica_actual() and has_permission('nomina', 'EDIT') and aprobado = false);

-- ============================================================
-- 6. NIT editable desde Datos básicos — función aparte (no se cambia la
--    firma de fn_actualizar_datos_basicos_clinica). clinicas no tiene
--    policy UPDATE para authenticated: security definer + es_admin() es la
--    única puerta, igual que 0052.
-- ============================================================
create or replace function fn_actualizar_nit_clinica(p_nit text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_nit text := nullif(trim(p_nit), '');
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar esta configuración.';
  end if;
  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if v_nit is null then
    raise exception 'El número de identificación es obligatorio.';
  end if;
  if exists (select 1 from clinicas where nit = v_nit and id <> v_clinica_id) then
    raise exception 'Ya existe otra clínica registrada con ese número de identificación.';
  end if;
  update clinicas set nit = v_nit where id = v_clinica_id;
end;
$$;

revoke all on function fn_actualizar_nit_clinica from public, anon, authenticated;
grant execute on function fn_actualizar_nit_clinica to authenticated;
