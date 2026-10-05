-- EWAH Tech Platform — Entidad Atención (visitas con y sin cita)
-- Aplicar con: npx supabase db push --linked
--
-- Hasta hoy lo clínico solo colgaba de `citas` (agenda) o de un
-- `tratamiento` suelto, con evoluciones_paciente/anamnesis_paciente
-- enlazadas a cita_id directamente. Eso se queda corto en un caso real: un
-- paciente llega SIN cita agendada y se le atiende igual — no había ningún
-- lugar donde esa visita quedara como una unidad, y si en la misma visita
-- se hacía un tratamiento y además una evolución, quedaban como dos hechos
-- sueltos sin nada que los agrupara.
--
-- Atención es esa unidad: la visita real del paciente (con o sin cita
-- previa), de la cual cuelgan 1+ tratamientos y, opcionalmente, una
-- evolución, una epicrisis de esa atención, o una epicrisis de todo el
-- historial del paciente. También es una mejora regulatoria real: RIPS
-- reporta por "atención"/servicio prestado con fecha y profesional — esa
-- unidad no existía explícitamente en el modelo hasta ahora.
--
-- Verificado contra los datos reales ANTES de escribir esta migración
-- (npx supabase db ... de solo lectura): tratamientos tiene 5163 filas con
-- cita_id en 0 de ellas; citas, evoluciones_paciente y anamnesis_paciente
-- están vacías en producción (0 filas cada una). Por eso solo tratamientos
-- necesita un backfill real (una atención sintética 1:1 por fila
-- existente) — las otras tres tablas se migran sin ningún dato que mover.

-- ============================================================
-- 1. Tabla atenciones
-- ============================================================
create table atenciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id),
  cita_id uuid references citas(id),
  profesional_id uuid not null references usuarios(id),
  fecha date not null default current_date,
  motivo text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);

-- Una cita no puede tener más de una atención — "Atender" se vuelve
-- idempotente: si ya existe, se reabre su detalle en vez de duplicar.
create unique index atenciones_cita_id_unique on atenciones(cita_id) where cita_id is not null;
create index atenciones_paciente_id_idx on atenciones(paciente_id, fecha desc);

alter table atenciones enable row level security;

create policy "atenciones_select_propia_clinica" on atenciones
  for select using (clinica_id = clinica_actual());

create policy "atenciones_insert_con_permiso" on atenciones
  for insert with check (
    clinica_id = clinica_actual() and has_permission('tratamientos', 'CREATE')
  );

-- Sin policy de update/delete — append-only real, igual que
-- evoluciones_paciente/anamnesis_paciente. Por el mismo motivo esas dos
-- tablas tampoco llevan el trigger fn_auditoria() (es para tablas que
-- pueden mutar; aquí el INSERT con created_by/created_at ya es el único
-- evento posible).

-- ============================================================
-- 2. tratamientos: cita_id → atencion_id (con backfill real)
-- ============================================================
alter table tratamientos add column atencion_id uuid references atenciones(id);

-- Backfill: una atención sintética 1:1 por cada tratamiento existente
-- (mismo paciente/profesional/fecha/created_by/created_at, sin cita_id —
-- el legado no tiene forma de saber qué tratamientos ocurrieron en la
-- misma visita física). Tabla temporal para correlacionar el id nuevo de
-- cada atención con su tratamiento de origen antes del UPDATE.
create temporary table _map_legado as
select t.id as tratamiento_id, gen_random_uuid() as atencion_id,
       t.clinica_id, t.paciente_id, t.profesional_id, t.fecha,
       t.created_by, t.created_at
from tratamientos t;

insert into atenciones (id, clinica_id, paciente_id, profesional_id, fecha, created_by, created_at)
select atencion_id, clinica_id, paciente_id, profesional_id, fecha, created_by, created_at
from _map_legado;

update tratamientos t set atencion_id = m.atencion_id
from _map_legado m
where t.id = m.tratamiento_id;

drop table _map_legado;

alter table tratamientos alter column atencion_id set not null;
create index tratamientos_atencion_id_idx on tratamientos(atencion_id);

alter table tratamientos drop column cita_id;

-- El trigger de inmutabilidad debe vigilar atencion_id en vez de cita_id
-- (mismo criterio: una vez que un tratamiento queda enlazado a una
-- atención, ese enlace es parte del registro histórico, append-only).
create or replace function fn_tratamientos_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if new.clinica_id is distinct from old.clinica_id
    or new.paciente_id is distinct from old.paciente_id
    or new.tipo_tratamiento_id is distinct from old.tipo_tratamiento_id
    or new.profesional_id is distinct from old.profesional_id
    or new.fecha is distinct from old.fecha
    or new.edad_paciente is distinct from old.edad_paciente
    or new.costo is distinct from old.costo
    or new.notas is distinct from old.notas
    or new.corrige_a is distinct from old.corrige_a
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.sede_id is distinct from old.sede_id
    or new.medio_pago_id is distinct from old.medio_pago_id
    or new.cufe is distinct from old.cufe
    or new.atencion_id is distinct from old.atencion_id
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;

  if old.anulado = true and new.anulado = false and not es_admin() then
    raise exception 'Solo un administrador puede revertir la anulación de un tratamiento.';
  end if;

  return new;
end;
$$;

-- ============================================================
-- 3. evoluciones_paciente: cita_id → atencion_id (tabla vacía, sin backfill)
-- ============================================================
alter table evoluciones_paciente add column atencion_id uuid references atenciones(id);
alter table evoluciones_paciente alter column atencion_id set not null;
create index evoluciones_paciente_atencion_id_idx on evoluciones_paciente(atencion_id);
drop index if exists evoluciones_paciente_cita_id_idx;
alter table evoluciones_paciente drop column cita_id;

-- "epicrisis" se separa en epicrisis de la atención vs. de todo el
-- historial del paciente — decisión del usuario, no todas las atenciones
-- requieren epicrisis y una epicrisis general no es lo mismo que cerrar
-- solo la atención en la que se escribió.
alter table evoluciones_paciente drop constraint if exists evoluciones_paciente_tipo_check;
alter table evoluciones_paciente add constraint evoluciones_paciente_tipo_check
  check (tipo in ('seguimiento', 'epicrisis_atencion', 'epicrisis_general'));

-- ============================================================
-- 4. anamnesis_paciente: cita_id → atencion_id (tabla vacía, sin backfill)
-- ============================================================
alter table anamnesis_paciente add column atencion_id uuid references atenciones(id);
alter table anamnesis_paciente alter column atencion_id set not null;
create index anamnesis_paciente_atencion_id_idx on anamnesis_paciente(atencion_id);
drop index if exists anamnesis_paciente_cita_id_idx;
alter table anamnesis_paciente drop column cita_id;
