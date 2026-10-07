-- ============================================================
-- 0082 · Medio Ambiente · PGIRASA: catálogo y declaraciones de cero
-- ============================================================
-- Diseño: docs/reportes/SPEC-pgirasa-pesos.md. Resolución conjunta 0591 de
-- 2024 (Manual PGIRASA): la categoría del generador sale del promedio de
-- residuos peligrosos de seis meses calendario, y un mes sin peligrosos
-- debe declararse expresamente como 0 kg (un mes vacío NO es cero).
--   1. Catálogo de tipos de residuo con las características químicas por
--      separado; "quimico" queda solo como dato histórico sin clasificar.
--   2. fn_residuo_es_peligroso(): única lista SQL de tipos peligrosos (la
--      de TS en lib/medio-ambiente/constantes.ts se verifica contra esta en
--      lib/medio-ambiente/__tests__/residuos.test.ts).
--   3. pgirasa_ceros_mensuales: declaraciones de 0 kg por sede y mes,
--      auditables; corregir = revocar con motivo (nunca se borran).
--   4. fn_confirmar_cero_pgirasa / fn_revocar_cero_pgirasa y el trigger
--      que impide un pesaje peligroso en un mes declarado en cero. Ambos
--      lados toman el mismo advisory lock (clínica+sede+mes) para que una
--      confirmación y un pesaje concurrentes no pasen los dos.

-- ============================================================
-- 1. Catálogo
-- ============================================================
alter table registros_residuos
  drop constraint if exists registros_residuos_tipo_residuo_check;

alter table registros_residuos
  add constraint registros_residuos_tipo_residuo_check
  check (
    tipo_residuo in (
      'aprovechable', 'no_aprovechable', 'organico',
      'biosanitario', 'anatomopatologico', 'cortopunzante', 'animal_infectado',
      'quimico_corrosivo', 'quimico_reactivo', 'quimico_explosivo',
      'quimico_toxico', 'quimico_inflamable', 'radioactivo', 'otros_peligrosos',
      'quimico'
    )
  );

-- ============================================================
-- 2. Tipos peligrosos (una sola definición)
-- ============================================================
create or replace function fn_residuo_es_peligroso(p_tipo text)
returns boolean
language sql
immutable
as $$
  select p_tipo in (
    'biosanitario', 'anatomopatologico', 'cortopunzante', 'animal_infectado',
    'quimico_corrosivo', 'quimico_reactivo', 'quimico_explosivo',
    'quimico_toxico', 'quimico_inflamable', 'radioactivo', 'otros_peligrosos',
    'quimico'
  );
$$;

comment on function fn_residuo_es_peligroso(text) is
  'true si el tipo de residuo cuenta como peligroso para el promedio PGIRASA; debe coincidir con TIPOS_RESIDUO_PELIGROSOS en TS.';

-- ============================================================
-- 3. Declaraciones de cero
-- ============================================================
create index registros_residuos_pg_mensual_idx
  on registros_residuos (clinica_id, sede_id, fecha, tipo_residuo);

create table pgirasa_ceros_mensuales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  mes date not null check (mes = date_trunc('month', mes)::date),
  confirmado_por uuid not null references usuarios(id),
  confirmado_en timestamptz not null default now(),
  revocada_por uuid references usuarios(id),
  revocada_en timestamptz,
  motivo_revocacion text,
  check (
    (revocada_por is null and revocada_en is null and motivo_revocacion is null)
    or
    (revocada_por is not null and revocada_en is not null and motivo_revocacion is not null)
  )
);

create unique index pgirasa_ceros_mensuales_vigente_idx
  on pgirasa_ceros_mensuales (clinica_id, sede_id, mes)
  where revocada_en is null;
create index pgirasa_ceros_mensuales_consulta_idx
  on pgirasa_ceros_mensuales (clinica_id, sede_id, mes desc);

comment on table pgirasa_ceros_mensuales is
  'Confirmaciones auditables de 0 kg de residuos peligrosos por sede y mes completo; una revocación conserva el antecedente.';

create trigger pgirasa_ceros_mensuales_auditoria
  after insert or update on pgirasa_ceros_mensuales
  for each row execute function fn_auditoria();

alter table pgirasa_ceros_mensuales enable row level security;
revoke all on table pgirasa_ceros_mensuales from public, anon, authenticated;
grant select on table pgirasa_ceros_mensuales to authenticated;

create policy pgirasa_ceros_mensuales_select_propia_clinica
  on pgirasa_ceros_mensuales
  for select to authenticated
  using (clinica_id = clinica_actual() and has_permission('medio_ambiente', 'VIEW'));

-- ============================================================
-- 4. Confirmar / revocar y validación de pesajes
-- ============================================================
-- security definer: pgirasa_ceros_mensuales no tiene policy de INSERT
-- para authenticated (solo SELECT); esta función es la única puerta y
-- valida has_permission CREATE, la clínica de sesión y la sede.
create or replace function fn_confirmar_cero_pgirasa(p_sede_id uuid, p_mes date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_id uuid;
begin
  if not has_permission('medio_ambiente', 'CREATE') then
    raise exception 'No tienes permiso para confirmar el consolidado PGIRASA.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null or auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  if p_sede_id is null or not exists (
    select 1 from sedes s
    where s.id = p_sede_id and s.clinica_id = v_clinica_id
  ) then
    raise exception 'La sede no pertenece a tu clínica.';
  end if;
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'El mes debe ser el primer día del mes que se confirma.';
  end if;
  if p_mes >= date_trunc('month', now() at time zone 'America/Bogota')::date then
    raise exception 'Solo se pueden confirmar meses ya cerrados.';
  end if;

  -- Mismo lock que fn_validar_registro_pgirasa: serializa esta
  -- confirmación con un pesaje peligroso concurrente del mismo mes y sede
  -- (si no, ambos verían "no hay del otro" y quedarían los dos).
  perform pg_advisory_xact_lock(
    hashtextextended(v_clinica_id::text || p_sede_id::text || to_char(p_mes, 'YYYY-MM'), 0)
  );

  if exists (
    select 1 from registros_residuos r
    where r.clinica_id = v_clinica_id
      and r.sede_id = p_sede_id
      and r.fecha >= p_mes
      and r.fecha < (p_mes + interval '1 month')::date
      and fn_residuo_es_peligroso(r.tipo_residuo)
  ) then
    raise exception 'Este mes ya tiene pesajes de residuos peligrosos; no se puede declarar 0 kg.';
  end if;

  insert into pgirasa_ceros_mensuales (clinica_id, sede_id, mes, confirmado_por)
  values (v_clinica_id, p_sede_id, p_mes, auth.uid())
  on conflict (clinica_id, sede_id, mes) where revocada_en is null
  do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Ya existe una confirmación de cero activa para esa sede y mes.';
  end if;
  return v_id;
end;
$$;

-- security definer: no hay policy de UPDATE para authenticated; revocar
-- solo llena los campos de revocación (nunca borra) tras validar
-- has_permission EDIT y la clínica de sesión.
create or replace function fn_revocar_cero_pgirasa(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_motivo text := nullif(trim(p_motivo), '');
  v_actualizadas integer;
begin
  if not has_permission('medio_ambiente', 'EDIT') then
    raise exception 'No tienes permiso para corregir declaraciones PGIRASA.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null or auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  if p_id is null or v_motivo is null or length(v_motivo) < 5 or length(v_motivo) > 500 then
    raise exception 'Indica un motivo de corrección entre 5 y 500 caracteres.';
  end if;

  update pgirasa_ceros_mensuales
  set revocada_por = auth.uid(),
      revocada_en = now(),
      motivo_revocacion = v_motivo
  where id = p_id
    and clinica_id = v_clinica_id
    and revocada_en is null;

  get diagnostics v_actualizadas = row_count;
  if v_actualizadas <> 1 then
    raise exception 'No se encontró una confirmación activa de tu clínica.';
  end if;
end;
$$;

-- security definer: el trigger debe ver las declaraciones de cero aunque
-- quien registra el pesaje no tenga el permiso VIEW que exige la policy
-- de pgirasa_ceros_mensuales.
create or replace function fn_validar_registro_pgirasa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sedes s
    where s.id = new.sede_id and s.clinica_id = new.clinica_id
  ) then
    raise exception 'La sede del pesaje no pertenece a la clínica.';
  end if;

  if not fn_residuo_es_peligroso(new.tipo_residuo) then
    return new;
  end if;

  -- Mismo lock (y misma clave clínica+sede+aaaa-mm) que
  -- fn_confirmar_cero_pgirasa. to_char y no ::text para no depender de
  -- DateStyle.
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.clinica_id::text || new.sede_id::text || to_char(new.fecha, 'YYYY-MM'),
      0
    )
  );

  if exists (
    select 1 from pgirasa_ceros_mensuales z
    where z.clinica_id = new.clinica_id
      and z.sede_id = new.sede_id
      and z.mes = date_trunc('month', new.fecha)::date
      and z.revocada_en is null
  ) then
    raise exception 'Hay una confirmación de cero para ese mes; revócala con motivo antes de registrar un pesaje peligroso.';
  end if;

  return new;
end;
$$;

create trigger registros_residuos_validar_pg
  before insert on registros_residuos
  for each row execute function fn_validar_registro_pgirasa();

revoke all on function fn_confirmar_cero_pgirasa(uuid, date)
  from public, anon, authenticated;
grant execute on function fn_confirmar_cero_pgirasa(uuid, date)
  to authenticated;

revoke all on function fn_revocar_cero_pgirasa(uuid, text)
  from public, anon, authenticated;
grant execute on function fn_revocar_cero_pgirasa(uuid, text)
  to authenticated;

revoke all on function fn_validar_registro_pgirasa()
  from public, anon, authenticated;
