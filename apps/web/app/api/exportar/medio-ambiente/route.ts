import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";

const COLUMNAS_TEMP: ColumnaXlsx[] = [
  { header: "Fecha", key: "fecha" },
  { header: "Hora", key: "hora" },
  { header: "Jornada", key: "jornada" },
  { header: "Ubicación", key: "ubicacion" },
  { header: "Temperatura (°C)", key: "temperatura" },
  { header: "Humedad (%)", key: "humedad" },
  { header: "Observaciones", key: "observaciones" },
];

const COLUMNAS_RESIDUOS: ColumnaXlsx[] = [
  { header: "Fecha", key: "fecha" },
  { header: "Hora", key: "hora" },
  { header: "Jornada", key: "jornada" },
  { header: "Sede", key: "sede" },
  { header: "Tipo de residuo", key: "tipo" },
  { header: "Peso (kg)", key: "peso" },
  { header: "Empleado", key: "empleado" },
  { header: "Observaciones", key: "observaciones" },
];

const COLUMNAS_EXTINTORES: ColumnaXlsx[] = [
  { header: "Sede", key: "sede" },
  { header: "Tipo", key: "tipo" },
  { header: "Ubicación", key: "ubicacion" },
  { header: "Número de serie", key: "numero_serie" },
  { header: "Capacidad", key: "capacidad" },
  { header: "Última recarga", key: "ultima_recarga" },
  { header: "Vencimiento", key: "vencimiento" },
  { header: "Activo", key: "activo" },
];

const COLUMNAS_LIMPIEZA: ColumnaXlsx[] = [
  { header: "Fecha", key: "fecha" },
  { header: "Hora", key: "hora" },
  { header: "Jornada", key: "jornada" },
  { header: "Sede", key: "sede" },
  { header: "Área", key: "area" },
  { header: "Empleado", key: "empleado" },
  { header: "Observaciones", key: "observaciones" },
];

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

  const [
    { data: tempConsultorio },
    { data: tempNevera },
    { data: residuos },
    { data: extintores },
    { data: limpiezas },
  ] = await Promise.all([
    supabase
      .from("registros_temperatura_consultorio")
      .select("fecha, hora, jornada, temperatura_celsius, humedad_porcentaje, observaciones, consultorios(nombre)")
      .order("fecha", { ascending: false }),
    supabase
      .from("registros_temperatura_nevera")
      .select("fecha, hora, jornada, temperatura_celsius, observaciones, neveras(nombre)")
      .order("fecha", { ascending: false }),
    supabase
      .from("registros_residuos")
      .select("fecha, hora, jornada, tipo_residuo, peso_kg, observaciones, sedes(nombre), empleados(nombre)")
      .order("fecha", { ascending: false }),
    supabase
      .from("extintores")
      .select(
        "ubicacion, numero_serie, capacidad, fecha_ultima_recarga, fecha_vencimiento, activo, sedes(nombre), tipos_extintor(nombre)",
      )
      .order("fecha_vencimiento", { ascending: true }),
    supabase
      .from("registros_limpieza")
      .select("fecha, hora, jornada, area_tipo, area_nombre, observaciones, sedes(nombre), empleados(nombre)")
      .order("fecha", { ascending: false }),
  ]);

  type Reg<T> = T & Record<string, unknown>;

  const filasTempConsultorio = ((tempConsultorio ?? []) as unknown as Reg<{
    fecha: string; hora: string | null; jornada: string | null; temperatura_celsius: number;
    humedad_porcentaje: number | null; observaciones: string | null; consultorios: { nombre: string } | null;
  }>[]).map((r) => ({
    fecha: r.fecha, hora: r.hora?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    ubicacion: r.consultorios?.nombre ?? "", temperatura: r.temperatura_celsius,
    humedad: r.humedad_porcentaje ?? "", observaciones: r.observaciones ?? "",
  }));

  const filasTempNevera = ((tempNevera ?? []) as unknown as Reg<{
    fecha: string; hora: string | null; jornada: string | null; temperatura_celsius: number;
    observaciones: string | null; neveras: { nombre: string } | null;
  }>[]).map((r) => ({
    fecha: r.fecha, hora: r.hora?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    ubicacion: r.neveras?.nombre ?? "", temperatura: r.temperatura_celsius,
    humedad: "", observaciones: r.observaciones ?? "",
  }));

  const filasResiduos = ((residuos ?? []) as unknown as Reg<{
    fecha: string; hora: string | null; jornada: string | null; tipo_residuo: string; peso_kg: number | null;
    observaciones: string | null; sedes: { nombre: string } | null; empleados: { nombre: string } | null;
  }>[]).map((r) => ({
    fecha: r.fecha, hora: r.hora?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    sede: r.sedes?.nombre ?? "", tipo: r.tipo_residuo, peso: r.peso_kg ?? "",
    empleado: r.empleados?.nombre ?? "", observaciones: r.observaciones ?? "",
  }));

  const filasExtintores = ((extintores ?? []) as unknown as Reg<{
    ubicacion: string | null; numero_serie: string | null; capacidad: string | null;
    fecha_ultima_recarga: string | null; fecha_vencimiento: string | null; activo: boolean;
    sedes: { nombre: string } | null; tipos_extintor: { nombre: string } | null;
  }>[]).map((r) => ({
    sede: r.sedes?.nombre ?? "", tipo: r.tipos_extintor?.nombre ?? "", ubicacion: r.ubicacion ?? "",
    numero_serie: r.numero_serie ?? "", capacidad: r.capacidad ?? "",
    ultima_recarga: r.fecha_ultima_recarga ?? "", vencimiento: r.fecha_vencimiento ?? "",
    activo: r.activo ? "Sí" : "No",
  }));

  const filasLimpieza = ((limpiezas ?? []) as unknown as Reg<{
    fecha: string; hora: string | null; jornada: string | null; area_tipo: string; area_nombre: string | null;
    observaciones: string | null; sedes: { nombre: string } | null; empleados: { nombre: string } | null;
  }>[]).map((r) => ({
    fecha: r.fecha, hora: r.hora?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    sede: r.sedes?.nombre ?? "", area: r.area_nombre || r.area_tipo,
    empleado: r.empleados?.nombre ?? "", observaciones: r.observaciones ?? "",
  }));

  const libro = construirLibroXlsx([
    { nombre: "Temp. consultorios", columnas: COLUMNAS_TEMP, filas: filasTempConsultorio },
    { nombre: "Temp. neveras", columnas: COLUMNAS_TEMP, filas: filasTempNevera },
    { nombre: "Residuos", columnas: COLUMNAS_RESIDUOS, filas: filasResiduos },
    { nombre: "Extintores", columnas: COLUMNAS_EXTINTORES, filas: filasExtintores },
    { nombre: "Limpieza", columnas: COLUMNAS_LIMPIEZA, filas: filasLimpieza },
  ]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("medio-ambiente")}"`,
    },
  });
}
