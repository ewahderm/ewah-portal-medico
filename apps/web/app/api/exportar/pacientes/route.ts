import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx } from "@/lib/exportar/xlsx";
import { COLUMNAS_PACIENTES, obtenerFilasExportPacientes } from "@/lib/pacientes/exportar";

export async function GET(request: NextRequest) {
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const supabase = await createClient();
  const filas = await obtenerFilasExportPacientes(supabase, q);
  const libro = construirLibroXlsx([{ nombre: "Pacientes", columnas: COLUMNAS_PACIENTES, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("pacientes")}"`,
    },
  });
}
