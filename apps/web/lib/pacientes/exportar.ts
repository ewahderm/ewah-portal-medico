import { createClient } from "@/lib/supabase/server";
import { normalizarBusqueda } from "@/lib/texto";
import type { ColumnaXlsx } from "@/lib/exportar/xlsx";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const COLUMNAS_PACIENTES: ColumnaXlsx[] = [
  { header: "Tipo de identificación", key: "tipo_identificacion" },
  { header: "Número de identificación", key: "numero_identificacion" },
  { header: "Primer nombre", key: "primer_nombre" },
  { header: "Segundo nombre", key: "segundo_nombre" },
  { header: "Primer apellido", key: "primer_apellido" },
  { header: "Segundo apellido", key: "segundo_apellido" },
  { header: "Fecha de nacimiento (AAAA-MM-DD)", key: "fecha_nacimiento" },
  { header: "Género", key: "genero" },
  { header: "Nacionalidad", key: "nacionalidad" },
  { header: "País de residencia", key: "pais_residencia" },
  { header: "¿Cómo nos conoció?", key: "canal_captacion" },
  { header: "Correo", key: "email" },
  { header: "Teléfono principal", key: "telefono1" },
  { header: "Teléfono alterno", key: "telefono2" },
  { header: "Dirección", key: "direccion" },
  { header: "Contacto de emergencia - nombre", key: "contacto_emergencia_nombre" },
  { header: "Contacto de emergencia - teléfono", key: "contacto_emergencia_telefono" },
];

// Mapas id→nombre de TODO el catálogo (no solo activos) — un paciente
// puede seguir referenciando una EPS o un género que luego se desactivó, y
// el export tiene que mostrar igual el nombre que tenía en ese momento.
async function mapaCatalogo(supabase: Supabase, tabla: string) {
  const { data } = await supabase.from(tabla).select("id, nombre");
  return new Map((data ?? []).map((f) => [f.id as string, f.nombre as string]));
}

export async function obtenerFilasExportPacientes(supabase: Supabase, q?: string) {
  const [tiposIdentificacion, generos, paises, canalesCaptacion] = await Promise.all([
    mapaCatalogo(supabase, "tipos_identificacion"),
    mapaCatalogo(supabase, "generos"),
    mapaCatalogo(supabase, "paises"),
    mapaCatalogo(supabase, "canales_captacion"),
  ]);

  let query = supabase
    .from("pacientes")
    .select(
      "tipo_identificacion_id, numero_identificacion, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, genero_id, nacionalidad_id, pais_residencia_id, canal_captacion_id, email, telefono1, telefono2, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono",
    )
    .order("primer_apellido");

  if (q) query = query.ilike("busqueda", `%${normalizarBusqueda(q)}%`);

  const { data } = await query;

  return (data ?? []).map((p) => ({
    tipo_identificacion: tiposIdentificacion.get(p.tipo_identificacion_id) ?? "",
    numero_identificacion: p.numero_identificacion,
    primer_nombre: p.primer_nombre,
    segundo_nombre: p.segundo_nombre ?? "",
    primer_apellido: p.primer_apellido,
    segundo_apellido: p.segundo_apellido ?? "",
    fecha_nacimiento: p.fecha_nacimiento ?? "",
    genero: p.genero_id ? (generos.get(p.genero_id) ?? "") : "",
    nacionalidad: p.nacionalidad_id ? (paises.get(p.nacionalidad_id) ?? "") : "",
    pais_residencia: p.pais_residencia_id ? (paises.get(p.pais_residencia_id) ?? "") : "",
    canal_captacion: p.canal_captacion_id ? (canalesCaptacion.get(p.canal_captacion_id) ?? "") : "",
    email: p.email ?? "",
    telefono1: p.telefono1 ?? "",
    telefono2: p.telefono2 ?? "",
    direccion: p.direccion ?? "",
    contacto_emergencia_nombre: p.contacto_emergencia_nombre ?? "",
    contacto_emergencia_telefono: p.contacto_emergencia_telefono ?? "",
  }));
}
