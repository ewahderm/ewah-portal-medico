import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx } from "@/lib/exportar/xlsx";
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
  // Whitelist de registry.ts — nunca se acepta `tabla` del cliente sin
  // pasar por acá (mismo criterio que el resto del motor genérico).
  const catalogo = getCatalogo(tabla);
  if (!catalogo) {
    return NextResponse.json({ error: "Catálogo inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.from(tabla).select("codigo, nombre").order("orden");
  const filas = (data ?? []).map((f) => ({ codigo: f.codigo ?? "", nombre: f.nombre }));

  const libro = construirLibroXlsx([{ nombre: catalogo.nombre, columnas: COLUMNAS_CATALOGO, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx(tabla)}"`,
    },
  });
}
