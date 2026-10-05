import { NextResponse } from "next/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirPlantillaXlsx, nombreArchivoXlsx } from "@/lib/exportar/xlsx";
import { COLUMNAS_CATALOGO } from "@/lib/parametros/exportar";
import { getCatalogo } from "@/lib/parametros/registry";

export async function GET(_request: Request, { params }: { params: Promise<{ tabla: string }> }) {
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  const { tabla } = await params;
  const catalogo = getCatalogo(tabla);
  if (!catalogo) {
    return NextResponse.json({ error: "Catálogo inválido." }, { status: 400 });
  }
  if (catalogo.esGlobal) {
    return NextResponse.json({ error: "Este catálogo lo administra EWAH Tech, no se importa." }, { status: 400 });
  }

  const libro = construirPlantillaXlsx(catalogo.nombre, COLUMNAS_CATALOGO);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx(`plantilla-${tabla}`)}"`,
    },
  });
}
