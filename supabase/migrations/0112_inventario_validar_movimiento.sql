-- ============================================================
-- 0112 · Inventario: cada movimiento valida su lote y su tratamiento
-- ============================================================
-- Encontrado en la prueba de inventario (2026-10-10): la política de
-- inserción de movimientos_insumos solo exige clinica_id = clinica_actual(),
-- pero no que el LOTE sea de esa clínica. Como el disparador de stock es
-- security definer, una clínica podía mover el stock de un lote ajeno
-- conociendo su id (que es justo lo que va en el QR de la etiqueta).
-- Verificado en local: la clínica A bajó de 100 a 60 un lote de la B.
--
-- Además, el consumo en un tratamiento solo se filtraba en pantalla: la BD
-- aceptaba un tratamiento anulado o un lote de otra sede.
--
-- Solo afecta movimientos nuevos; los existentes no se tocan.

create or replace function fn_movimiento_insumo_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote lotes%rowtype;
  v_t tratamientos%rowtype;
begin
  select * into v_lote from lotes where id = new.lote_id;
  if not found or v_lote.clinica_id <> new.clinica_id then
    raise exception 'El lote no pertenece a esta clínica.';
  end if;

  if new.tratamiento_id is not null then
    select * into v_t from tratamientos where id = new.tratamiento_id;
    if not found or v_t.clinica_id <> new.clinica_id then
      raise exception 'El tratamiento no pertenece a esta clínica.';
    end if;
    if new.motivo_movimiento = 'consumo_tratamiento' then
      if v_t.anulado then
        raise exception 'El tratamiento está anulado: no se le registran insumos.';
      end if;
      if v_t.sede_id is distinct from v_lote.sede_id then
        raise exception 'El lote es de otra sede: usa un lote de la sede donde se hizo el tratamiento.';
      end if;
    end if;
  end if;

  if new.revierte_movimiento_id is not null and not exists (
    select 1 from movimientos_insumos o
    where o.id = new.revierte_movimiento_id and o.clinica_id = new.clinica_id and o.lote_id = new.lote_id
  ) then
    raise exception 'El consumo que se revierte no corresponde a este lote.';
  end if;

  return new;
end;
$$;

revoke execute on function fn_movimiento_insumo_validar() from public, anon, authenticated;

-- Antes del disparador de stock (que es AFTER INSERT).
create trigger movimientos_insumos_00_validar before insert on movimientos_insumos
  for each row execute function fn_movimiento_insumo_validar();
