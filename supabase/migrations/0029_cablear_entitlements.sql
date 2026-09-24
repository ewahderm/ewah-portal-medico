-- EWAH Tech Platform — Cablear has_entitlement() en las políticas reales
-- Aplicar con: npx supabase db push --linked
--
-- 0028 creó has_entitlement() pero todavía no lo exige en ninguna RLS —
-- hasta esta migración, una clínica en plan Gratis con clinica_modulos
-- desactivado para 'inventario' seguía pudiendo insertar movimientos e
-- ítems de Anexos si el rol tenía el has_permission correspondiente,
-- porque has_permission() no mira el plan (ver 0028, punto 3).
--
-- Riesgo puntual identificado al revisar movimientos_insumos_insert_entrada_salida
-- (0020, líneas ~119-128): esa policy exige has_permission('inventario', ...)
-- para CUALQUIER motivo_movimiento, incluidos 'consumo_tratamiento' y
-- 'reverso_consumo' — que son el registro de qué insumo/lote se le aplicó a
-- un paciente (InsumosDialog, ver lib/inventario/actions.ts
-- registrarConsumo/revertirConsumo). Ese registro es trazabilidad clínica y
-- evidencia legal, no una feature de control de stock/costeo — el split de
-- 0028 lo declaró gratis a propósito. Por eso 'consumo_tratamiento' y
-- 'reverso_consumo' NO llevan has_entitlement aquí: si se le agregara, una
-- clínica en plan Gratis dejaría de poder registrar qué se le aplicó a un
-- paciente, que es exactamente lo que NO se quiere cobrar. Cualquier otro
-- movimiento (entrada, salida que no sea consumo/reverso, ajuste) sí es
-- control de inventario real y por lo tanto exige el entitlement del
-- módulo completo, además del has_permission que ya exigía.

-- ============================================================
-- 1. movimientos_insumos: gatear por entitlement todo lo que NO sea
--    consumo/reverso de tratamiento
-- ============================================================
drop policy "movimientos_insumos_insert_entrada_salida" on movimientos_insumos;
create policy "movimientos_insumos_insert_entrada_salida" on movimientos_insumos
  for insert with check (
    clinica_id = clinica_actual()
    and (
      -- Consumo/reverso de tratamiento: gratis en todos los planes, solo RBAC.
      (motivo_movimiento = 'reverso_consumo' and has_permission('inventario', 'VOID'))
      or (
        motivo_movimiento = 'consumo_tratamiento'
        and tipo = 'salida'
        and has_permission('inventario', 'CREATE')
      )
      -- Cualquier otro movimiento de inventario (entradas de stock, salidas
      -- que no sean consumo, traslados, etc.) es control de inventario real
      -- y exige que el plan de la clínica lo tenga incluido.
      or (
        tipo in ('entrada', 'salida')
        and motivo_movimiento is distinct from 'reverso_consumo'
        and motivo_movimiento is distinct from 'consumo_tratamiento'
        and has_permission('inventario', 'CREATE')
        and has_entitlement('inventario')
      )
      or (
        tipo = 'ajuste'
        and has_permission('inventario', 'VOID')
        and has_entitlement('inventario')
      )
    )
  );

-- ============================================================
-- 2. tratamiento_anexos: Anexos es una sub-feature de pago dentro de
--    Tratamientos (que en sí es gratis)
-- ============================================================
drop policy "tratamiento_anexos_insert_con_permiso" on tratamiento_anexos;
create policy "tratamiento_anexos_insert_con_permiso" on tratamiento_anexos
  for insert with check (
    clinica_id = clinica_actual()
    and has_permission('tratamientos', 'CREATE')
    and has_entitlement('tratamientos', 'anexos')
  );

-- ============================================================
-- 3. Storage del bucket tratamiento-anexos: mismo check también aquí —
--    si solo se protegiera la tabla, el archivo ya habría quedado subido
--    (huérfano) al bucket antes de que el insert en la tabla fallara.
-- ============================================================
drop policy "tratamiento_anexos_storage_insert" on storage.objects;
create policy "tratamiento_anexos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'tratamiento-anexos'
    and (storage.foldername(name))[1] = clinica_actual()::text
    and has_permission('tratamientos', 'CREATE')
    and has_entitlement('tratamientos', 'anexos')
  );
