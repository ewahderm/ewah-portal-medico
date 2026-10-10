-- EWAH Tech Platform — La atención ocurre en un consultorio de una sede
-- Aplicar con: npx supabase db push --linked
--
-- Una atención (visita) se hace en un consultorio, y todo consultorio
-- pertenece a una sede. Los tratamientos de esa atención ocurren en el
-- mismo lugar, así que no tiene sentido volver a pedir la sede en cada uno:
-- la heredan de su atención. Pero se SIGUEN guardando en la fila del
-- tratamiento (sede_id ya existía, consultorio_id es nuevo): los reportes
-- leen el tratamiento directamente y los datos migrados del legado no
-- tienen atención con lugar.
--
-- 1. atenciones.sede_id / consultorio_id (opcionales: el legado no los
--    tiene). Al insertar, la sede se deduce del consultorio.
-- 2. tratamientos.consultorio_id (opcional).
-- 3. Al insertar un tratamiento, si su atención tiene lugar, el
--    tratamiento lo hereda (gana sobre lo que mande el formulario). Si la
--    atención no tiene lugar (legado), se respeta la sede del formulario.
-- 4. Backfill: atenciones con cita toman el consultorio de la cita; sus
--    tratamientos toman el consultorio. Atenciones sin cita toman la sede
--    de sus tratamientos cuando todos coinciden.
-- 5. consultorio_id entra a la lista de columnas inmutables del tratamiento.

-- ============================================================
-- 1 y 2. Columnas
-- ============================================================
alter table atenciones add column sede_id uuid references sedes(id);
alter table atenciones add column consultorio_id uuid references consultorios(id);
alter table tratamientos add column consultorio_id uuid references consultorios(id);

create index atenciones_sede_id_idx on atenciones(sede_id);
create index tratamientos_consultorio_id_idx on tratamientos(consultorio_id);

-- La sede de una atención sale de su consultorio (y el consultorio debe
-- ser de la misma clínica: el formulario manda un id, no se confía en él).
create or replace function fn_atenciones_lugar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sede uuid;
begin
  if new.consultorio_id is not null then
    select c.sede_id into v_sede
    from consultorios c
    where c.id = new.consultorio_id and c.clinica_id = new.clinica_id;
    if v_sede is null then
      raise exception 'El consultorio indicado no es válido.';
    end if;
    new.sede_id := v_sede;
  elsif new.sede_id is not null
    and not exists (select 1 from sedes s where s.id = new.sede_id and s.clinica_id = new.clinica_id) then
    raise exception 'La sede indicada no es válida.';
  end if;
  return new;
end;
$$;

revoke execute on function fn_atenciones_lugar() from public, anon, authenticated;

create trigger atenciones_lugar
  before insert on atenciones
  for each row execute function fn_atenciones_lugar();

-- ============================================================
-- 3. El tratamiento hereda el lugar de su atención
-- ============================================================
create or replace function fn_tratamientos_hereda_lugar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sede uuid;
  v_consultorio uuid;
begin
  select a.sede_id, a.consultorio_id into v_sede, v_consultorio
  from atenciones a
  where a.id = new.atencion_id;

  if v_sede is not null then
    new.sede_id := v_sede;
    new.consultorio_id := v_consultorio;
  end if;
  return new;
end;
$$;

revoke execute on function fn_tratamientos_hereda_lugar() from public, anon, authenticated;

create trigger tratamientos_hereda_lugar
  before insert on tratamientos
  for each row execute function fn_tratamientos_hereda_lugar();

-- ============================================================
-- 4. Backfill
-- ============================================================
-- Atenciones que vienen de una cita: el consultorio de la cita.
update atenciones a
set consultorio_id = c.consultorio_id, sede_id = co.sede_id
from citas c
join consultorios co on co.id = c.consultorio_id
where a.cita_id = c.id and a.consultorio_id is null;

-- Atenciones sin lugar todavía: la sede de sus tratamientos, solo si
-- todos coinciden (no se adivina cuando hay más de una).
update atenciones a
set sede_id = t.sede_id
from (
  select atencion_id, min(sede_id::text)::uuid as sede_id
  from tratamientos
  where sede_id is not null
  group by atencion_id
  having count(distinct sede_id) = 1
) t
where a.id = t.atencion_id and a.sede_id is null;

-- Tratamientos de atenciones con consultorio (aún no es inmutable: el
-- trigger de abajo se reemplaza después de este update).
update tratamientos t
set consultorio_id = a.consultorio_id
from atenciones a
where t.atencion_id = a.id
  and a.consultorio_id is not null
  and t.consultorio_id is null
  and t.sede_id is not distinct from a.sede_id;

-- ============================================================
-- 5. consultorio_id también es inmutable
-- ============================================================
create or replace function fn_tratamientos_solo_anular()
returns trigger
language plpgsql
set search_path = public
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
    or new.consultorio_id is distinct from old.consultorio_id
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
