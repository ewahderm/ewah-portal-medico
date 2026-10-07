// Arma el listado de insumos para el reporte al INVIMA. La selección la
// decide la casilla "reporte regulatorio" del catálogo de Insumos, no si el
// insumo está activo: un producto retirado pudo haberse usado en el periodo
// y el ente regulador igual lo pide. Función pura para poder probarla sin BD.

export type InsumoRegulatorioFuente = {
  codigo: string | null;
  nombre: string;
  unidad_medida: string | null;
  registro_sanitario: string | null;
  unidad_medida_registro_sanitario: string | null;
  fecha_vencimiento_registro_sanitario: string | null;
  referencia_reportada: string | null;
  presentacion_comercial_reportada: string | null;
  reporte_regulatorio: boolean;
  activo: boolean;
};

export type InsumoInvima = {
  codigo: string;
  nombre: string;
  unidadMedida: string;
  registroSanitario: string;
  unidadRegistroSanitario: string;
  vencimientoRegistroSanitario: string;
  referenciaReportada: string;
  presentacionComercial: string;
};

export function construirReporteInvima(filas: readonly InsumoRegulatorioFuente[]): InsumoInvima[] {
  return filas
    .filter((fila) => fila.reporte_regulatorio)
    .map((fila) => ({
      codigo: fila.codigo ?? "",
      nombre: fila.nombre,
      unidadMedida: fila.unidad_medida ?? "",
      registroSanitario: fila.registro_sanitario ?? "",
      unidadRegistroSanitario: fila.unidad_medida_registro_sanitario ?? "",
      vencimientoRegistroSanitario: fila.fecha_vencimiento_registro_sanitario ?? "",
      referenciaReportada: fila.referencia_reportada ?? "",
      presentacionComercial: fila.presentacion_comercial_reportada ?? "",
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
