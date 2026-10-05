import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";
import { listarFunnelCampana } from "@/lib/campanas/actions";
import { formatoMoneda } from "@/lib/format";

const COLUMNAS: ColumnaXlsx[] = [
  { header: "Campaña", key: "nombre" },
  { header: "Canal", key: "canal" },
  { header: "Fecha inicio", key: "fecha_inicio" },
  { header: "Fecha fin", key: "fecha_fin" },
  { header: "Presupuesto", key: "presupuesto" },
  { header: "Objetivo", key: "objetivo" },
  { header: "Activa", key: "activa" },
  { header: "Leads", key: "leads" },
  { header: "Contactados", key: "contactados" },
  { header: "Agendaron cita", key: "agendaron_cita" },
  { header: "Convertidos", key: "convertidos" },
  { header: "Ingresos", key: "ingresos" },
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
  const { data } = await supabase
    .from("campanas")
    .select(
      "id, nombre, canal_captacion_id, fecha_inicio, fecha_fin, presupuesto, objetivo, activo, canales_captacion(nombre)",
    )
    .order("created_at", { ascending: false });

  type FilaCampana = {
    id: string;
    nombre: string;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    presupuesto: number | null;
    objetivo: string | null;
    activo: boolean;
    canales_captacion: { nombre: string } | null;
  };

  const campanas = (data ?? []) as unknown as FilaCampana[];
  const funnels = await Promise.all(campanas.map((c) => listarFunnelCampana(c.id)));

  const filas = campanas.map((c, i) => ({
    nombre: c.nombre,
    canal: c.canales_captacion?.nombre ?? "",
    fecha_inicio: c.fecha_inicio ?? "",
    fecha_fin: c.fecha_fin ?? "",
    presupuesto: c.presupuesto ? formatoMoneda(c.presupuesto) : "",
    objetivo: c.objetivo ?? "",
    activa: c.activo ? "Sí" : "No",
    leads: funnels[i].leads,
    contactados: funnels[i].contactados,
    agendaron_cita: funnels[i].agendaronCita,
    convertidos: funnels[i].convertidos,
    ingresos: formatoMoneda(funnels[i].ingresos),
  }));

  const libro = construirLibroXlsx([{ nombre: "Campañas", columnas: COLUMNAS, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("campanas")}"`,
    },
  });
}
