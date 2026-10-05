import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";

const COLUMNAS: ColumnaXlsx[] = [
  { header: "Nombre", key: "nombre" },
  { header: "Correo", key: "email" },
  { header: "Rol", key: "rol" },
  { header: "Estado", key: "estado" },
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
    .from("usuarios")
    .select("nombre, email, activo, bloqueado, roles(nombre)")
    .order("nombre");

  type FilaUsuario = { nombre: string; email: string; activo: boolean; bloqueado: boolean; roles: { nombre: string } | null };

  const filas = ((data ?? []) as unknown as FilaUsuario[]).map((u) => ({
    nombre: u.nombre,
    email: u.email,
    rol: u.roles?.nombre ?? "",
    estado: u.bloqueado ? "Bloqueado" : u.activo ? "Activo" : "Desactivado",
  }));

  const libro = construirLibroXlsx([{ nombre: "Usuarios", columnas: COLUMNAS, filas }]);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("usuarios")}"`,
    },
  });
}
