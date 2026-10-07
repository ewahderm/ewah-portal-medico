import { NextResponse } from "next/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";
import { accesoInvima } from "@/lib/reportes/acceso";
import { cargarReporteInvima } from "@/lib/reportes/consultas-regulatorias";

const COLUMNAS: ColumnaXlsx[] = [
  { header: "Código", key: "codigo" },
  { header: "Producto", key: "nombre" },
  { header: "Unidad de medida", key: "unidadMedida" },
  { header: "Registro sanitario", key: "registroSanitario" },
  { header: "Unidad del registro sanitario", key: "unidadRegistroSanitario" },
  { header: "Vencimiento del registro sanitario", key: "vencimientoRegistroSanitario" },
  { header: "Referencia reportada", key: "referenciaReportada" },
  { header: "Presentación comercial", key: "presentacionComercial" },
];

export async function GET() {
  // Exportar es exclusivo del Administrador (lib/exportar/acceso.ts), igual
  // que el resto de /api/exportar.
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  // El Administrador tiene todos los permisos, pero no todos los planes:
  // sin Inventario en el plan, tampoco hay reporte INVIMA.
  const check = await accesoInvima();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 403 });
  }

  let filas;
  try {
    filas = await cargarReporteInvima(check.usuario.clinica_id);
  } catch (error) {
    console.error("[reportes] exportar INVIMA", error);
    return NextResponse.json({ error: "No se pudo exportar el reporte INVIMA." }, { status: 500 });
  }

  const libro = construirLibroXlsx([{ nombre: "Reporte INVIMA", columnas: COLUMNAS, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("reporte-invima")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
