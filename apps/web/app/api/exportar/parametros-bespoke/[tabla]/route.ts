import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";

// Los 4 catálogos "a medida" de Parámetros (ver page.tsx `bespoke`) salen
// del motor genérico porque cada uno tiene columnas propias — este export
// es la whitelist equivalente a registry.ts para esos, nunca se acepta
// `tabla` del cliente sin pasar por este mapa.
const CONFIG: Record<
  string,
  {
    nombre: string;
    select: string;
    columnas: ColumnaXlsx[];
    mapear: (fila: Record<string, unknown>) => Record<string, unknown>;
  }
> = {
  consultorios: {
    nombre: "Consultorios",
    select: "codigo, nombre, activo, sedes(nombre)",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Código", key: "codigo" },
      { header: "Sede", key: "sede" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => ({
      nombre: f.nombre,
      codigo: f.codigo ?? "",
      sede: (f.sedes as { nombre: string } | null)?.nombre ?? "",
      activo: f.activo ? "Sí" : "No",
    }),
  },
  neveras: {
    nombre: "Neveras",
    select: "codigo, nombre, activo, sedes(nombre)",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Código", key: "codigo" },
      { header: "Sede", key: "sede" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => ({
      nombre: f.nombre,
      codigo: f.codigo ?? "",
      sede: (f.sedes as { nombre: string } | null)?.nombre ?? "",
      activo: f.activo ? "Sí" : "No",
    }),
  },
  insumos: {
    nombre: "Insumos",
    select: "codigo, nombre, unidad_medida, registro_sanitario, activo, proveedores(nombre)",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Código", key: "codigo" },
      { header: "Unidad de medida", key: "unidad_medida" },
      { header: "Proveedor", key: "proveedor" },
      { header: "Registro sanitario", key: "registro_sanitario" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => ({
      nombre: f.nombre,
      codigo: f.codigo ?? "",
      unidad_medida: f.unidad_medida ?? "",
      proveedor: (f.proveedores as { nombre: string } | null)?.nombre ?? "",
      registro_sanitario: f.registro_sanitario ?? "",
      activo: f.activo ? "Sí" : "No",
    }),
  },
  proveedores: {
    nombre: "Proveedores",
    select: "nombre, numero_identificacion, observaciones, activo, tipos_identificacion(nombre)",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Tipo de identificación", key: "tipo_identificacion" },
      { header: "Número de identificación", key: "numero_identificacion" },
      { header: "Observaciones", key: "observaciones" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => ({
      nombre: f.nombre,
      tipo_identificacion: (f.tipos_identificacion as { nombre: string } | null)?.nombre ?? "",
      numero_identificacion: f.numero_identificacion ?? "",
      observaciones: f.observaciones ?? "",
      activo: f.activo ? "Sí" : "No",
    }),
  },
  motivos_movimiento_inventario: {
    nombre: "Motivos de movimiento",
    select: "codigo, nombre, categoria, activo",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Código", key: "codigo" },
      { header: "Categoría", key: "categoria" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => ({
      nombre: f.nombre,
      codigo: f.codigo ?? "",
      categoria: f.categoria === "entrada" ? "Entrada" : "Salida",
      activo: f.activo ? "Sí" : "No",
    }),
  },
};

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
  const config = CONFIG[tabla];
  if (!config) {
    return NextResponse.json({ error: "Catálogo inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.from(tabla).select(config.select).order("orden");
  const filas = (data ?? []).map((f) => config.mapear(f as unknown as Record<string, unknown>));

  const libro = construirLibroXlsx([{ nombre: config.nombre, columnas: config.columnas, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx(tabla)}"`,
    },
  });
}
