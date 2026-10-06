-- CUPS pasa de tabla vacía a ~10,000 códigos reales (archivo oficial que
-- compartió el usuario, importado aparte por script — ver
-- _scratch-import-cups.js, nunca commiteado). Con ese volumen:
--   1. Nunca tiene sentido listarlo plano en un <table> (motor genérico de
--      Parámetros) — se saca de CATALOGOS y pasa a una pestaña "a medida"
--      con buscador server-side.
--   2. El combobox de CUPS en Tipos de tratamiento mostraría un listado
--      interminable si ofreciera los 10,000 — el usuario pidió un flag de
--      "activo para mi clínica" para acotarlo a los que la clínica
--      realmente usa. Presencia en `clinica_cups` = activo (no se guarda
--      una fila con activo=false por cada código no usado — sería ~10,000
--      filas por clínica para casi nada).
alter table cups add column capitulo text;

create table clinica_cups (
  clinica_id uuid not null references clinicas(id) on delete cascade,
  cups_id uuid not null references cups(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references usuarios(id),
  primary key (clinica_id, cups_id)
);

create index idx_clinica_cups_clinica on clinica_cups(clinica_id);

alter table clinica_cups enable row level security;

create policy "clinica_cups_select" on clinica_cups for select to authenticated
  using (clinica_id = clinica_actual());

create policy "clinica_cups_insert" on clinica_cups for insert to authenticated
  with check (clinica_id = clinica_actual() and has_permission('parametros', 'EDIT'));

create policy "clinica_cups_delete" on clinica_cups for delete to authenticated
  using (clinica_id = clinica_actual() and has_permission('parametros', 'EDIT'));
