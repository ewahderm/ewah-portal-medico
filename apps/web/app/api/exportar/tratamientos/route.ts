import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { formatoMoneda } from "@/lib/format";

const COLUMNAS: ColumnaXlsx[] = [
  { header: "Fecha", key: "fecha" },
  { header: "Paciente", key: "paciente" },
  { header: "Tratamiento", key: "tratamiento" },
  { header: "Sede", key: "sede" },
  { header: "Profesional", key: "profesional" },
  { header: "Precio", key: "valor" },
  { header: "Valor cobrado", key: "cobrado" },
  { header: "Observaciones", key: "notas" },
  { header: "Anulado", key: "anulado" },
  { header: "Motivo de anulación", key: "anulado_motivo" },
];

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
  const supabase = await createClient();

  // Mismos filtros que /tratamientos (ver filtros-tratamientos.tsx) — el
  // Administrador ya ve anulados en la pantalla, así que el export los
  // incluye siempre (es la única persona que puede exportar).
  let query = supabase
    .from("tratamientos")
    .select(
      `fecha, costo, valor_cobrado, notas, anulado, anulado_motivo,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       tipos_tratamiento(nombre),
       sedes(nombre),
       profesional:usuarios!tratamientos_profesional_id_fkey(nombre)`,
    )
    .order("fecha", { ascending: false });

  const profesionalId = params.get("profesionalId");
  const sedeId = params.get("sedeId");
  const pacienteId = params.get("pacienteId");
  const tipoTratamientoId = params.get("tipoTratamientoId");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  if (profesionalId) query = query.eq("profesional_id", profesionalId);
  if (sedeId) query = query.eq("sede_id", sedeId);
  if (pacienteId) query = query.eq("paciente_id", pacienteId);
  if (tipoTratamientoId) query = query.eq("tipo_tratamiento_id", tipoTratamientoId);
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);

  const { data } = await query;

  type FilaTratamiento = {
    fecha: string;
    costo: number | null;
    valor_cobrado: number | null;
    notas: string | null;
    anulado: boolean;
    anulado_motivo: string | null;
    pacientes: {
      primer_nombre: string;
      segundo_nombre: string | null;
      primer_apellido: string;
      segundo_apellido: string | null;
    } | null;
    tipos_tratamiento: { nombre: string } | null;
    sedes: { nombre: string } | null;
    profesional: { nombre: string } | null;
  };

  const filas = ((data ?? []) as unknown as FilaTratamiento[]).map((t) => ({
    fecha: t.fecha,
    paciente: t.pacientes ? nombreCompleto(t.pacientes) : "",
    tratamiento: t.tipos_tratamiento?.nombre ?? "",
    sede: t.sedes?.nombre ?? "",
    profesional: t.profesional?.nombre ?? "",
    valor: t.costo ? formatoMoneda(t.costo) : "",
    cobrado: t.valor_cobrado !== null ? formatoMoneda(t.valor_cobrado) : "",
    notas: t.notas ?? "",
    anulado: t.anulado ? "Sí" : "No",
    anulado_motivo: t.anulado_motivo ?? "",
  }));

  const libro = construirLibroXlsx([{ nombre: "Tratamientos", columnas: COLUMNAS, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("tratamientos")}"`,
    },
  });
}
