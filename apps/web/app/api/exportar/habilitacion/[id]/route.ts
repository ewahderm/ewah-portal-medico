import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { construirLibroXlsx } from "@/lib/exportar/xlsx";
import { getAutoevaluacion, getDetalleAutoevaluacion, getUsuariosClinica } from "@/lib/habilitacion/consultas";
import { construirPdfAutoevaluacion, hojasXlsx } from "@/lib/habilitacion/exportar";
import { fechaColombiaDe } from "@/lib/habilitacion/ruta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Excel o PDF de una autoevaluación cerrada (F10). Solo el administrador
// exporta (regla del proyecto, lib/exportar/acceso.ts); la lectura va con
// el cliente de sesión, así que RLS sigue filtrando por clínica.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let usuario;
  try {
    usuario = await requireAdminExport();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No autorizado." }, { status: 403 });
  }
  // Habilitación con gestión (plan Pro): sin ella no hay autoevaluaciones que exportar.
  const gestion = await requireEntitlement("habilitacion", "gestion");
  if (!gestion.ok) return NextResponse.json({ error: gestion.error }, { status: 403 });

  const { id } = await params;
  const formato = new URL(request.url).searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
  if (!UUID.test(id)) return NextResponse.json({ error: "Autoevaluación inválida." }, { status: 400 });

  const supabase = await createClient();
  const [autoevaluacion, detalle, usuarios, { data: clinica }] = await Promise.all([
    getAutoevaluacion(supabase, id),
    getDetalleAutoevaluacion(supabase, id, true),
    getUsuariosClinica(supabase),
    // Por id: un super admin ve todas las clínicas y .maybeSingle() sin filtro fallaría.
    supabase.from("clinicas").select("nombre, nombre_comercial, nit").eq("id", usuario.clinica_id).maybeSingle(),
  ]);
  if (!autoevaluacion) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

  const datos = {
    clinica: { nombre: clinica?.nombre_comercial || clinica?.nombre || "Clínica", nit: clinica?.nit ?? null },
    autoevaluacion,
    detalle,
    nombres: Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])),
  };
  const base = `autoevaluacion-${fechaColombiaDe(autoevaluacion.fecha_cierre)}`;

  if (formato === "pdf") {
    const bytes = await construirPdfAutoevaluacion(datos);
    return new NextResponse(new Blob([new Uint8Array(bytes)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
      },
    });
  }
  return new NextResponse(construirLibroXlsx(hojasXlsx(datos)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
