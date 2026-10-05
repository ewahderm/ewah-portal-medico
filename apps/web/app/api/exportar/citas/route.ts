import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";
import { nombreCompleto } from "@/lib/pacientes/nombre";

const ESTADO_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  atendida: "Atendida",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
  reprogramada: "Reprogramada",
};

const COLUMNAS: ColumnaXlsx[] = [
  { header: "Fecha", key: "fecha" },
  { header: "Hora inicio", key: "hora_inicio" },
  { header: "Hora fin", key: "hora_fin" },
  { header: "Paciente", key: "paciente" },
  { header: "Tratamiento", key: "tratamiento" },
  { header: "Profesional", key: "profesional" },
  { header: "Sede", key: "sede" },
  { header: "Consultorio", key: "consultorio" },
  { header: "Estado", key: "estado" },
  { header: "Motivo / observaciones", key: "motivo" },
];

type FilaCita = {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  es_bloqueo: boolean;
  motivo: string | null;
  pacientes: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  } | null;
  tipos_tratamiento: { nombre: string } | null;
  consultorios: { nombre: string; sedes: { nombre: string } | null } | null;
  profesional: { nombre: string } | null;
};

// Respeta el mismo rango de fecha/filtros que la vista de Agenda que el
// administrador tenía abierta (desde/hasta vienen ya calculados por
// día/semana/mes en el cliente) — exportar "todo lo que hay" no tiene un
// límite natural de tiempo igual que un listado paginado normal.
export async function GET(request: NextRequest) {
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  const params = request.nextUrl.searchParams;
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan los parámetros desde/hasta." }, { status: 400 });
  }

  const supabase = await createClient();
  const sedeId = params.get("sedeId");
  const profesionalId = params.get("profesionalId");

  const embedConsultorio = sedeId
    ? "consultorios!inner(nombre, sede_id, sedes(nombre))"
    : "consultorios(nombre, sede_id, sedes(nombre))";

  let query = supabase
    .from("citas")
    .select(
      `fecha, hora_inicio, hora_fin, estado, es_bloqueo, motivo,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       tipos_tratamiento(nombre),
       ${embedConsultorio},
       profesional:usuarios!citas_profesional_id_fkey(nombre)`,
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("hora_inicio");

  if (sedeId) query = query.eq("consultorios.sede_id", sedeId);
  if (profesionalId) query = query.eq("profesional_id", profesionalId);

  const { data } = await query;

  const filas = ((data ?? []) as unknown as FilaCita[]).map((c) => ({
    fecha: c.fecha,
    hora_inicio: c.hora_inicio?.slice(0, 5) ?? "",
    hora_fin: c.hora_fin?.slice(0, 5) ?? "",
    paciente: c.pacientes ? nombreCompleto(c.pacientes) : c.es_bloqueo ? "(Bloqueo de horario)" : "",
    tratamiento: c.tipos_tratamiento?.nombre ?? "",
    profesional: c.profesional?.nombre ?? "",
    sede: c.consultorios?.sedes?.nombre ?? "",
    consultorio: c.consultorios?.nombre ?? "",
    estado: c.es_bloqueo ? "Bloqueo" : (ESTADO_LABEL[c.estado] ?? c.estado),
    motivo: c.motivo ?? "",
  }));

  const libro = construirLibroXlsx([{ nombre: "Agenda", columnas: COLUMNAS, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("agenda")}"`,
    },
  });
}
