-- EWAH Tech Platform — Reversa de consumo de insumos
-- Aplicar con: npx supabase db push --linked
--
-- Decisión acordada con el usuario: "eliminar" un insumo ya registrado
-- en un tratamiento nunca borra la fila (movimientos_insumos es
-- append-only, igual que el resto de la plataforma) — en su lugar se
-- inserta un movimiento de entrada que compensa el consumo original y
-- lo referencia por id, para poder mostrar en la UI cuál consumo quedó
-- revertido sin perder el registro de que realmente se usó ese insumo.

alter table movimientos_insumos add column revierte_movimiento_id uuid references movimientos_insumos(id);
create index movimientos_insumos_revierte_movimiento_id_idx on movimientos_insumos(revierte_movimiento_id) where revierte_movimiento_id is not null;

alter table movimientos_insumos drop constraint movimientos_insumos_motivo_check;
alter table movimientos_insumos add constraint movimientos_insumos_motivo_check
  check (
    tipo = 'ajuste'
    or motivo_movimiento in (
      'compra', 'obsequio_proveedor', 'saldo_inicial', 'traslado',
      'consumo_tratamiento', 'desecho', 'obsequio_paciente', 'reverso_consumo'
    )
  );

-- Una reversa también debe quedar ligada al tratamiento, igual que el
-- consumo que revierte.
alter table movimientos_insumos drop constraint movimientos_insumos_consumo_con_tratamiento_check;
alter table movimientos_insumos add constraint movimientos_insumos_consumo_con_tratamiento_check
  check (motivo_movimiento not in ('consumo_tratamiento', 'reverso_consumo') or tratamiento_id is not null);
