// Los motivos seleccionables desde un dropdown (compra, obsequio_proveedor,
// saldo_inicial, desecho, obsequio_paciente) ya NO viven aquí — son un
// catálogo real y editable (tabla motivos_movimiento_inventario, ver
// lib/catalogos.ts#getMotivosMovimientoActivos). Esto queda solo con los 3
// motivos que dispara el propio sistema (nunca aparecen en un dropdown, así
// que no tiene sentido que el usuario los administre desde Parámetros):
// Tratamientos registra "consumo_tratamiento", el diálogo de traslado
// registra "traslado", y revertir un consumo registra "reverso_consumo".
export const MOTIVO_LABEL_SISTEMA: Record<string, string> = {
  consumo_tratamiento: "Consumo en tratamiento",
  traslado: "Traslado entre sedes",
  reverso_consumo: "Reversa de consumo",
};
