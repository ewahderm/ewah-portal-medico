-- EWAH Tech Platform — Anular un tratamiento revierte automáticamente su
-- consumo de insumos; revertir una anulación queda restringido a Admin.
-- Aplicar con: npx supabase db push --linked
--
-- Decisiones acordadas con el usuario:
--  - Al anular un tratamiento, cualquier consumo de insumo asociado que
--    todavía no estuviera revertido se revierte automáticamente (misma
--    mecánica que revertirConsumo() de Inventario: un movimiento de
--    entrada con motivo_movimiento='reverso_consumo' que referencia al
--    consumo original vía revierte_movimiento_id) — se eligió sobre la
--    alternativa de solo advertir, para no dejar el inventario
--    desincronizado del estado clínico real.
--  - Se implementa como trigger (security definer, mismo patrón que
--    fn_actualizar_stock_lote()) en vez de hacerlo desde la acción de
--    la aplicación, para que no dependa de que quien anula el
--    tratamiento (permiso tratamientos:VOID) tenga también permiso
--    sobre Inventario — el trigger corre con privilegios elevados,
--    igual que el resto de la automatización de stock.
--  - "Revertir una anulación" (poner anulado de vuelta en false) ya era
--    técnicamente posible a nivel de RLS para cualquiera con permiso
--    VOID sobre tratamientos, porque fn_tratamientos_solo_anular() nunca
--    restringió esa columna. Se endurece para exigir es_admin() —
--    deshacer una anulación es más sensible que anularlo la primera vez.

-- ============================================================
-- 1. Revertir automáticamente el consumo de insumos al anular
-- ============================================================
create or replace function fn_anular_tratamiento_revierte_insumos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumo record;
begin
  if new.anulado = true and old.anulado = false then
    for v_consumo in
      select mi.id, mi.lote_id, mi.cantidad, mi.clinica_id
      from movimientos_insumos mi
      where mi.tratamiento_id = new.id
        and mi.motivo_movimiento = 'consumo_tratamiento'
        and not exists (
          select 1 from movimientos_insumos r where r.revierte_movimiento_id = mi.id
        )
    loop
      insert into movimientos_insumos (
        clinica_id, lote_id, tipo, motivo_movimiento, cantidad,
        tratamiento_id, revierte_movimiento_id, motivo, created_by
      ) values (
        v_consumo.clinica_id, v_consumo.lote_id, 'entrada', 'reverso_consumo', v_consumo.cantidad,
        new.id, v_consumo.id,
        'Reversado automáticamente al anular el tratamiento' ||
          case when new.anulado_motivo is not null then ': ' || new.anulado_motivo else '' end,
        new.anulado_por
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger tratamientos_revertir_insumos_al_anular
  after update on tratamientos
  for each row execute function fn_anular_tratamiento_revierte_insumos();

-- ============================================================
-- 2. Revertir una anulación exige ser Administrador
-- ============================================================
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
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;

  if old.anulado = true and new.anulado = false and not es_admin() then
    raise exception 'Solo un administrador puede revertir la anulación de un tratamiento.';
  end if;

  return new;
end;
$$;
