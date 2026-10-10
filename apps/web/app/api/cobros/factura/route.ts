import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUsuario } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descarga del PDF o XML de la factura de un cobro: un enlace directo (sin
// ventanas emergentes, que Safari bloquea si se abren tras esperar una
// respuesta). Lee la ruta con la sesión del usuario (RLS del cobro y del
// bucket) y redirige a una URL firmada de corta duración.
export async function GET(request: NextRequest) {
  const cobro = request.nextUrl.searchParams.get("cobro") ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo");
  if (!UUID.test(cobro) || (tipo !== "pdf" && tipo !== "xml")) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const usuario = await getCurrentUsuario();
  if (!usuario) return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("cobros_atencion")
    .select("factura_pdf_path, factura_xml_path")
    .eq("id", cobro)
    .eq("clinica_id", usuario.clinica_id)
    .maybeSingle();
  const path = tipo === "pdf" ? data?.factura_pdf_path : data?.factura_xml_path;
  if (!path) return NextResponse.json({ error: "El cobro no tiene ese archivo." }, { status: 404 });

  const { data: firmada } = await supabase.storage.from("cobro-facturas").createSignedUrl(path, 60, { download: true });
  if (!firmada?.signedUrl) return NextResponse.json({ error: "No se pudo descargar el archivo." }, { status: 403 });
  return NextResponse.redirect(firmada.signedUrl);
}
