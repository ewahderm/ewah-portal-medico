-- EWAH Tech Platform — Auditoría de cambios a datos clínicos
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
--
-- Por qué: log_acceso (0001) audita intentos de login, no cambios a los
-- datos. Para historia clínica se necesita trazabilidad de quién cambió
-- qué y con qué valores — es requisito médico-legal, no solo buena
-- práctica. Este es un trigger genérico reutilizable: se activa una vez
-- por tabla ("create trigger ... execute function fn_auditoria()") y
-- funciona para cualquier tabla que tenga columnas `id` y `clinica_id`
-- (pacientes hoy, tratamientos y las que sigan más adelante).

create table auditoria (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tabla text not null,
  registro_id uuid not null,
  usuario_id uuid references usuarios(id) on delete set null,
  accion text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  fecha timestamptz not null default now()
);

create index auditoria_clinica_tabla_registro_idx
  on auditoria(clinica_id, tabla, registro_id, fecha desc);
create index auditoria_clinica_fecha_idx on auditoria(clinica_id, fecha desc);

alter table auditoria enable row level security;

-- Solo lectura para admins de la propia clínica. No hay policy de
-- insert/update/delete a propósito: la única vía de escritura es el
-- trigger de abajo, que corre security definer (bypassa RLS igual que
-- has_permission()/clinica_actual() en 0001).
create policy "auditoria_select_admin" on auditoria
  for select using (clinica_id = clinica_actual() and es_admin());

create or replace function fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_registro_id uuid;
begin
  if tg_op = 'DELETE' then
    v_clinica_id := old.clinica_id;
    v_registro_id := old.id;
  else
    v_clinica_id := new.clinica_id;
    v_registro_id := new.id;
  end if;

  insert into auditoria (clinica_id, tabla, registro_id, usuario_id, accion, datos_anteriores, datos_nuevos)
  values (
    v_clinica_id,
    tg_table_name,
    v_registro_id,
    auth.uid(),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger pacientes_auditoria
  after insert or update or delete on pacientes
  for each row execute function fn_auditoria();
