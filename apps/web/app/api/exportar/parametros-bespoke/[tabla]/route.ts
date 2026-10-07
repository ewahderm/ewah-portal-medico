import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";
import { describirCodigosPorSede, type CodigoPorSede } from "@/lib/clinicas/servicios-habilitados-tipos";

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
    // Columna de orden — "orden" salvo tablas que no la tienen.
    ordenarPor?: string;
  }
> = {
  cargos: {
    nombre: "Cargos",
    select: "codigo, nombre, activo, clases_riesgo(nombre, tarifa_arl)",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Código", key: "codigo" },
      { header: "Clase de riesgo", key: "clase" },
      { header: "Aporte ARL empleador (%)", key: "tarifa" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => {
      const clase = f.clases_riesgo as { nombre: string; tarifa_arl: number | null } | null;
      return {
        nombre: f.nombre,
        codigo: f.codigo ?? "",
        clase: clase?.nombre ?? "",
        tarifa: clase?.tarifa_arl != null ? Number(clase.tarifa_arl) * 100 : "",
        activo: f.activo ? "Sí" : "No",
      };
    },
  },
  valores_legales_pais: {
    nombre: "Valores legales por año",
    select: "anio, smlv, auxilio_transporte, norma, paises(nombre)",
    ordenarPor: "anio",
    columnas: [
      { header: "País", key: "pais" },
      { header: "Año", key: "anio" },
      { header: "Salario mínimo", key: "smlv" },
      { header: "Auxilio de transporte", key: "auxilio" },
      { header: "Norma", key: "norma" },
    ],
    mapear: (f) => ({
      pais: (f.paises as { nombre: string } | null)?.nombre ?? "",
      anio: f.anio,
      smlv: f.smlv ?? "",
      auxilio: f.auxilio_transporte ?? "",
      norma: f.norma ?? "",
    }),
  },
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
    select: "nombre, numero_identificacion, observaciones, activo, tipos_identificacion(nombre), tipos_persona(nombre)",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Tipo de identificación", key: "tipo_identificacion" },
      { header: "Número de identificación", key: "numero_identificacion" },
      { header: "Tipo de persona", key: "tipo_persona" },
      { header: "Observaciones", key: "observaciones" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => ({
      nombre: f.nombre,
      tipo_identificacion: (f.tipos_identificacion as { nombre: string } | null)?.nombre ?? "",
      numero_identificacion: f.numero_identificacion ?? "",
      tipo_persona: (f.tipos_persona as { nombre: string } | null)?.nombre ?? "",
      observaciones: f.observaciones ?? "",
      activo: f.activo ? "Sí" : "No",
    }),
  },
  cups: {
    nombre: "CUPS (catálogo oficial completo)",
    select: "codigo, descripcion, capitulo",
    columnas: [
      { header: "Código", key: "codigo" },
      { header: "Descripción", key: "descripcion" },
      { header: "Capítulo", key: "capitulo" },
    ],
    mapear: (f) => ({
      codigo: f.codigo,
      descripcion: f.descripcion,
      capitulo: f.capitulo ?? "",
    }),
  },
  tipos_tratamiento: {
    nombre: "Tipos de tratamiento",
    select:
      "codigo, nombre, activo, cups(codigo, descripcion), practicas_medicas(nombre, clinica_servicios_habilitados(codigo_habilitacion, sedes(nombre)))",
    columnas: [
      { header: "Nombre", key: "nombre" },
      { header: "Código", key: "codigo" },
      { header: "Servicio habilitado", key: "servicio" },
      { header: "Código de habilitación por sede", key: "codigo_habilitacion" },
      { header: "CUPS", key: "cups" },
      { header: "Activo", key: "activo" },
    ],
    mapear: (f) => {
      const cups = f.cups as { codigo: string; descripcion: string } | null;
      // Desde 0061 el tipo apunta a la práctica; el código depende de la sede.
      const servicio = f.practicas_medicas as {
        nombre: string;
        clinica_servicios_habilitados: CodigoPorSede[];
      } | null;
      return {
        nombre: f.nombre,
        codigo: f.codigo ?? "",
        servicio: servicio?.nombre ?? "",
        codigo_habilitacion: describirCodigosPorSede(servicio?.clinica_servicios_habilitados),
        cups: cups ? `${cups.codigo} — ${cups.descripcion}` : "",
        activo: f.activo ? "Sí" : "No",
      };
    },
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
  const { data } = await supabase.from(tabla).select(config.select).order(config.ordenarPor ?? "orden");
  const filas = (data ?? []).map((f) => config.mapear(f as unknown as Record<string, unknown>));

  const libro = construirLibroXlsx([{ nombre: config.nombre, columnas: config.columnas, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx(tabla)}"`,
    },
  });
}
