import { NextResponse } from "next/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirPlantillaXlsx, nombreArchivoXlsx } from "@/lib/exportar/xlsx";
import { COLUMNAS_PACIENTES } from "@/lib/pacientes/exportar";

export async function GET() {
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  const libro = construirPlantillaXlsx("Pacientes", COLUMNAS_PACIENTES);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("plantilla-pacientes")}"`,
    },
  });
}
