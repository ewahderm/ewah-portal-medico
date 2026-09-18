-- EWAH Tech Platform — Inventario v2: motivos de movimiento, traslados entre
-- sedes y número de lote obligatorio.
-- Aplicar con: npx supabase db push --linked
--
-- Decisiones acordadas con el usuario:
--  - "tipo" se queda como la categoría amplia que controla el signo del
--    stock (entrada=+, salida=-, ajuste=+/-) y NUNCA vuelve a cambiar de
--    valores — eso es lo que usa fn_actualizar_stock_lote(). El motivo
--    específico (compra, obsequio, desecho, traslado, consumo...) vive en
--    la nueva columna "motivo_movimiento": así se pueden agregar razones
--    nuevas en el futuro sin tocar el trigger ni las políticas RLS.
--    "salida_consumo" se renombra a "salida" + motivo_movimiento =
--    'consumo_tratamiento' (mismo significado, ahora expresado con el
--    patrón categoría+motivo en vez de un tipo dedicado).
--  - Traslado entre sedes = un movimiento de salida en el lote de origen y
--    uno de entrada en el lote de destino (mismo insumo/número de
--    lote/vencimiento, se busca o se crea el lote gemelo en la sede
--    destino), ambos con motivo_movimiento='traslado' y unidos por
--    "traslado_id" para poder rastrear el par. No se mueve el sede_id de
--    un lote existente — un lote siempre pertenece a la misma sede desde
--    que se crea, evita reescribir historia.
--  - Número de lote pasa a ser obligatorio (antes opcional). Los lotes ya
--    existentes sin número se marcan como 'SIN-NUMERO' — decisión
--    explícita del usuario, no un valor inventado por la aplicación.

-- ============================================================
-- Lotes: número de lote obligatorio
-- ============================================================
update lotes set numero_lote = 'SIN-NUMERO' where numero_lote is null or numero_lote = '';
alter table lotes alter column numero_lote set not null;

-- ============================================================
-- Movimientos: categoría (tipo) + motivo específico (motivo_movimiento)
-- ============================================================
alter table movimientos_insumos add column motivo_movimiento text;
alter table movimientos_insumos add column traslado_id uuid;

-- Backfill de datos existentes antes de endurecer las reglas nuevas.
update movimientos_insumos set motivo_movimiento = 'consumo_tratamiento' where tipo = 'salida_consumo';
update movimientos_insumos set tipo = 'salida' where tipo = 'salida_consumo';
update movimientos_insumos set motivo_movimiento = 'saldo_inicial' where tipo = 'entrada' and motivo_movimiento is null;

alter table movimientos_insumos drop constraint movimientos_insumos_tipo_check;
alter table movimientos_insumos add constraint movimientos_insumos_tipo_check
  check (tipo in ('entrada', 'salida', 'ajuste'));

alter table movimientos_insumos add constraint movimientos_insumos_motivo_check
  check (
    tipo = 'ajuste'
    or motivo_movimiento in (
      'compra', 'obsequio_proveedor', 'saldo_inicial', 'traslado',
      'consumo_tratamiento', 'desecho', 'obsequio_paciente'
    )
  );

-- El check original de "tipo <> 'salida_consumo' or cantidad > 0" y
-- "... or tratamiento_id is not null" quedaron con el nombre viejo tras el
-- rename de columna — se recrean con el nombre de tipo nuevo.
alter table movimientos_insumos drop constraint movimientos_insumos_check1;
alter table movimientos_insumos drop constraint movimientos_insumos_check2;
alter table movimientos_insumos add constraint movimientos_insumos_salida_positiva_check
  check (tipo <> 'salida' or cantidad > 0);
alter table movimientos_insumos add constraint movimientos_insumos_consumo_con_tratamiento_check
  check (motivo_movimiento <> 'consumo_tratamiento' or tratamiento_id is not null);

create index movimientos_insumos_traslado_id_idx on movimientos_insumos(traslado_id) where traslado_id is not null;

-- El trigger de stock solo lee "tipo" (entrada/salida/ajuste) — no cambia
-- de comportamiento con el rename, se recrea únicamente por claridad de
-- que 'salida_consumo' ya no existe.
create or replace function fn_actualizar_stock_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'entrada' then
    update lotes set cantidad_actual = cantidad_actual + new.cantidad where id = new.lote_id;
  elsif new.tipo = 'salida' then
    update lotes set cantidad_actual = cantidad_actual - new.cantidad where id = new.lote_id;
  elsif new.tipo = 'ajuste' then
    update lotes set cantidad_actual = cantidad_actual + new.cantidad where id = new.lote_id;
  end if;
  return new;
end;
$$;

-- La política de inserción ya usaba "tipo in ('entrada','salida_consumo')"
-- para CREATE y 'ajuste' para VOID — se recrea con 'salida' en vez de
-- 'salida_consumo' (traslado también es entrada/salida normales, así que
-- sigue gateado por CREATE, igual que antes).
drop policy "movimientos_insumos_insert_entrada_consumo" on movimientos_insumos;
create policy "movimientos_insumos_insert_entrada_salida" on movimientos_insumos
  for insert with check (
    clinica_id = clinica_actual()
    and (
      (tipo in ('entrada', 'salida') and has_permission('inventario', 'CREATE'))
      or (tipo = 'ajuste' and has_permission('inventario', 'VOID'))
    )
  );
