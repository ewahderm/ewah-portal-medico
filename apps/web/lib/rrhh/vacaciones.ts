"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { esAdministrador } from "@/lib/auth/session";

function requirePermiso() {
  return requirePermisoBase("rrhh", "CREATE");
}

export async function crearVacaciones(empleadoId: string, formData: FormData) {
  const fechaInicio = String(formData.get("fechaInicio") ?? "");
  const fechaFin = String(formData.get("fechaFin") ?? "");
  const diasTomados = Number(formData.get("diasTomados"));
  if (!fechaInicio || !fechaFin) throw new Error("Las fechas son obligatorias.");
  if (fechaFin < fechaInicio) throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  if (!Number.isFinite(diasTomados) || diasTomados <= 0) {
    throw new Error("Los días tomados deben ser mayores a cero.");
  }

  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();

  let cartaStoragePath: string | null = null;
  const carta = formData.get("cartaSolicitud");
  if (carta instanceof File && carta.size > 0) {
    if (carta.size > 10 * 1024 * 1024) throw new Error("La carta no puede pesar más de 10 MB.");
    const extension = carta.name.split(".").pop() ?? "pdf";
    const path = `${check.usuario.clinica_id}/empleados/${empleadoId}/vacaciones-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("documentos-rrhh")
      .upload(path, carta, { contentType: carta.type });
    if (uploadError) throw new Error("No se pudo subir la carta de solicitud.");
    cartaStoragePath = path;
  }

  const { error } = await supabase.from("vacaciones_empleado").insert({
    clinica_id: check.usuario.clinica_id,
    empleado_id: empleadoId,
    carta_solicitud_storage_path: cartaStoragePath,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    dias_tomados: diasTomados,
    created_by: check.usuario.id,
  });
  if (error) {
    // El trigger fn_vacaciones_solo_laboral levanta esta excepción si el
    // contrato es "por servicios" — se traduce a un mensaje claro en vez
    // del texto crudo de Postgres.
    if (error.message.includes("prestación de servicios")) {
      throw new Error("Un contrato por prestación de servicios no genera vacaciones.");
    }
    throw new Error("No se pudo registrar las vacaciones.");
  }

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function eliminarVacaciones(id: string, empleadoId: string) {
  const check = await requirePermiso();
  if (!check.ok) throw new Error(check.error);
  if (!esAdministrador(check.usuario)) throw new Error("Solo un administrador puede eliminar este registro.");

  const supabase = await createClient();
  const { error } = await supabase.from("vacaciones_empleado").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el registro.");

  revalidatePath(`/rrhh/${empleadoId}`);
}

export async function listarVacacionesEmpleado(empleadoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vacaciones_empleado")
    .select("id, fecha_inicio, fecha_fin, dias_tomados, carta_solicitud_storage_path")
    .eq("empleado_id", empleadoId)
    .order("fecha_inicio", { ascending: false });
  return data ?? [];
}

// Días acumulados (Art. 186 CST): 1.25 días por mes completo trabajado
// desde el inicio del contrato, menos los días ya tomados. Solo tiene
// sentido para contratos "laborales" — el llamador (la página del
// empleado) ya no muestra esta sección para "servicios".
export async function calcularDiasAcumuladosVacaciones(empleadoId: string) {
  const supabase = await createClient();
  const { data: empleado } = await supabase
    .from("empleados")
    .select("fecha_inicio_contrato, categoria_contrato")
    .eq("id", empleadoId)
    .maybeSingle();

  if (!empleado?.fecha_inicio_contrato || empleado.categoria_contrato !== "laboral") {
    return null;
  }

  // `fecha_inicio_contrato` es un string "yyyy-MM-dd" — se parsea a mano en
  // vez de con `new Date(...)`, que lo interpretaría como medianoche UTC y
  // correría la fecha un día hacia atrás en huso horario de Colombia
  // (UTC-5) justo el día en que empieza el mes (mismo gotcha corregido en
  // lib/rrhh/nomina.ts).
  const [anioInicio, mesInicio, diaInicio] = empleado.fecha_inicio_contrato.split("-").map(Number);
  const hoy = new Date();
  const mesesCompletos = Math.max(
    0,
    (hoy.getFullYear() - anioInicio) * 12 +
      (hoy.getMonth() + 1 - mesInicio) -
      (hoy.getDate() < diaInicio ? 1 : 0),
  );
  const diasGenerados = mesesCompletos * 1.25;

  const { data: tomadas } = await supabase
    .from("vacaciones_empleado")
    .select("dias_tomados")
    .eq("empleado_id", empleadoId);
  const diasTomados = (tomadas ?? []).reduce((acc, v) => acc + v.dias_tomados, 0);

  return { diasGenerados: Math.round(diasGenerados * 100) / 100, diasTomados, diasDisponibles: Math.round((diasGenerados - diasTomados) * 100) / 100 };
}
