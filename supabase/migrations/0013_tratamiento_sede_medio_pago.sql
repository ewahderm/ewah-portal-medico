-- EWAH Tech Platform — Tratamientos: Sede, Medio de Pago y CUFE
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
--
-- El usuario compartió una captura del sistema legado: el formulario de
-- Tratamiento pedía Sede, Tipo de Tratamiento, Medio de Pago y Valor como
-- obligatorios (con *), más Observaciones y CUFE (código de facturación
-- electrónica DIAN) opcionales. Ya teníamos Tipo de Tratamiento y Costo
-- (~Valor); faltaban Sede, Medio de Pago y CUFE.
--
-- Decisiones confirmadas con el usuario:
--  - Sede y Medio de Pago quedan OBLIGATORIOS, igual que en el legado.
--  - "Medio de Pago" es un catálogo POR CLÍNICA (como Tipos de Tratamiento,
--    Consultorios y Sedes) — cada clínica tiene sus propios acuerdos de
--    pago/datáfono.
--  - CUFE es texto libre opcional (lo genera el software de facturación
--    electrónica, no algo que la plataforma calcule).

-- ============================================================
-- Catálogo por-clínica: Medios de pago (vía Parámetros)
-- ============================================================
create table medios_pago (
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

create trigger medios_pago_set_updated_at
  before update on medios_pago
  for each row execute function set_updated_at();

create index medios_pago_clinica_id_idx on medios_pago(clinica_id);

alter table medios_pago enable row level security;

create policy "medios_pago_select_propia_clinica" on medios_pago
  for select using (clinica_id = clinica_actual());

create policy "medios_pago_insert_con_permiso" on medios_pago
  for insert with check (
    clinica_id = clinica_actual() and has_permission('parametros', 'CREATE')
  );

create policy "medios_pago_update_con_permiso" on medios_pago
  for update using (
    clinica_id = clinica_actual() and has_permission('parametros', 'EDIT')
  )
  with check (clinica_id = clinica_actual());

-- Semilla solo para EWAH S.A.S.
insert into medios_pago (clinica_id, codigo, nombre, orden)
select c.id, seed.codigo, seed.nombre, seed.orden
from clinicas c
cross join (values
  ('EFECTIVO', 'Efectivo', 1),
  ('TARJETA_DEBITO', 'Tarjeta débito', 2),
  ('TARJETA_CREDITO', 'Tarjeta crédito', 3),
  ('TRANSFERENCIA', 'Transferencia', 4),
  ('PSE', 'PSE', 5),
  ('OTRO', 'Otro', 99)
) as seed(codigo, nombre, orden)
where c.nit = '901759965';

-- ============================================================
-- Tratamientos: agregar sede_id, medio_pago_id, cufe
-- ============================================================
alter table tratamientos add column sede_id uuid references sedes(id);
alter table tratamientos add column medio_pago_id uuid references medios_pago(id);
alter table tratamientos add column cufe text;

-- Backfill defensivo por si ya hay tratamientos de prueba sin estos
-- datos, antes de poder exigirlos con not null.
update tratamientos t
set sede_id = (
  select s.id from sedes s where s.clinica_id = t.clinica_id order by s.orden limit 1
)
where t.sede_id is null;

update tratamientos t
set medio_pago_id = (
  select m.id from medios_pago m where m.clinica_id = t.clinica_id order by m.orden limit 1
)
where t.medio_pago_id is null;

alter table tratamientos alter column sede_id set not null;
alter table tratamientos alter column medio_pago_id set not null;

-- El trigger de inmutabilidad (0008) debe conocer las columnas nuevas o
-- se podrían editar después de guardado sin que el constraint lo note.
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
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;
  return new;
end;
$$;
