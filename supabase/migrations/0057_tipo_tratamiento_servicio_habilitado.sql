-- El código de habilitación de un tipo de tratamiento deja de ser texto
-- libre (0052) y pasa a elegirse de los servicios que la clínica ya
-- habilitó en Datos básicos (0055/0056) — pedido del usuario 2026-10-06.
-- Se guarda la referencia al servicio, no una copia del código: si el
-- admin corrige el código del servicio, todos sus tratamientos quedan al
-- día. `codigo_habilitacion` (texto) se deja sin uso en vez de borrarse
-- (estaba vacío en producción al momento de este cambio).
alter table tipos_tratamiento
  add column servicio_habilitado_id uuid references clinica_servicios_habilitados(id) on delete set null;

create index idx_tipos_tratamiento_servicio_habilitado on tipos_tratamiento(servicio_habilitado_id);

-- El RLS de tipos_tratamiento valida su propio clinica_id, pero no a qué
-- clínica pertenece el servicio referenciado — sin esto un id ajeno pasaría
-- la FK (misma clase de IDOR que tratamientos.cita_id).
create or replace function fn_tipo_tratamiento_servicio_misma_clinica()
returns trigger
language plpgsql
as $$
begin
  if new.servicio_habilitado_id is not null and not exists (
    select 1 from clinica_servicios_habilitados s
    where s.id = new.servicio_habilitado_id and s.clinica_id = new.clinica_id
  ) then
    raise exception 'El servicio habilitado no pertenece a esta clínica.';
  end if;
  return new;
end;
$$;

create trigger tipos_tratamiento_servicio_misma_clinica
  before insert or update of servicio_habilitado_id, clinica_id on tipos_tratamiento
  for each row execute function fn_tipo_tratamiento_servicio_misma_clinica();
