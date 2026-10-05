import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";

const COLUMNAS_LOTES: ColumnaXlsx[] = [
  { header: "Insumo", key: "insumo" },
  { header: "Sede", key: "sede" },
  { header: "Número de lote", key: "numero_lote" },
  { header: "Vencimiento", key: "vencimiento" },
  { header: "Cantidad actual", key: "cantidad" },
  { header: "Costo unitario", key: "costo_unitario" },
  { header: "Activo", key: "activo" },
];

const COLUMNAS_MOVIMIENTOS: ColumnaXlsx[] = [
  { header: "Fecha", key: "fecha" },
  { header: "Insumo", key: "insumo" },
  { header: "Sede", key: "sede" },
  { header: "Lote", key: "lote" },
  { header: "Tipo", key: "tipo" },
  { header: "Cantidad", key: "cantidad" },
  { header: "Motivo", key: "motivo" },
  { header: "Sitio anatómico", key: "sitio" },
];

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  salida_consumo: "Salida (consumo)",
  ajuste: "Ajuste",
};

type FilaLote = {
  numero_lote: string;
  fecha_vencimiento: string | null;
  cantidad_actual: number;
  costo_unitario: number | null;
  activo: boolean;
  insumos: { nombre: string } | null;
  sedes: { nombre: string } | null;
};

type FilaMovimiento = {
  created_at: string;
  tipo: string;
  cantidad: number;
  motivo: string | null;
  sitio_anatomico: string | null;
  lotes: { numero_lote: string; insumos: { nombre: string } | null; sedes: { nombre: string } | null } | null;
};

export async function GET() {
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const [{ data: lotesData }, { data: movimientosData }] = await Promise.all([
    supabase
      .from("lotes")
      .select("numero_lote, fecha_vencimiento, cantidad_actual, costo_unitario, activo, insumos(nombre), sedes(nombre)")
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
    supabase
      .from("movimientos_insumos")
      .select("created_at, tipo, cantidad, motivo, sitio_anatomico, lotes(numero_lote, insumos(nombre), sedes(nombre))")
      .order("created_at", { ascending: false }),
  ]);

  const filasLotes = ((lotesData ?? []) as unknown as FilaLote[]).map((l) => ({
    insumo: l.insumos?.nombre ?? "",
    sede: l.sedes?.nombre ?? "",
    numero_lote: l.numero_lote,
    vencimiento: l.fecha_vencimiento ?? "",
    cantidad: l.cantidad_actual,
    costo_unitario: l.costo_unitario ?? "",
    activo: l.activo ? "Sí" : "No",
  }));

  const filasMovimientos = ((movimientosData ?? []) as unknown as FilaMovimiento[]).map((m) => ({
    fecha: m.created_at?.slice(0, 10) ?? "",
    insumo: m.lotes?.insumos?.nombre ?? "",
    sede: m.lotes?.sedes?.nombre ?? "",
    lote: m.lotes?.numero_lote ?? "",
    tipo: TIPO_LABEL[m.tipo] ?? m.tipo,
    cantidad: m.cantidad,
    motivo: m.motivo ?? "",
    sitio: m.sitio_anatomico ?? "",
  }));

  const libro = construirLibroXlsx([
    { nombre: "Inventario actual", columnas: COLUMNAS_LOTES, filas: filasLotes },
    { nombre: "Movimientos", columnas: COLUMNAS_MOVIMIENTOS, filas: filasMovimientos },
  ]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("inventario")}"`,
    },
  });
}
