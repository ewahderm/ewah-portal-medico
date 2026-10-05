import type { ColumnaXlsx } from "@/lib/exportar/xlsx";

// El motor genérico de catálogos (ver registry.ts) solo maneja código+
// nombre — es lo único que crearValorCatalogo() ya sabe insertar. Sedes
// tiene además una `dirección` que ni el formulario de crear la toca hoy;
// no se agrega acá para no abrir un camino de edición que el resto de la
// pantalla de Parámetros no tiene.
export const COLUMNAS_CATALOGO: ColumnaXlsx[] = [
  { header: "Código", key: "codigo" },
  { header: "Nombre", key: "nombre" },
];
