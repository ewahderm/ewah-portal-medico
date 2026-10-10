"use server";

// Solicitudes de vacaciones, permisos y reposiciones (0107). La BD decide
// quién puede qué (el propio empleado, quien registra en RRHH, quien
// aprueba) y vuelve a validar todo; aquí se valida la forma, se llama a la
// función y se avisa por correo.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsuario } from "@/lib/auth/session";
import { siteUrl } from "@/lib/site-url";
import { avisarSolicitudNueva, avisarSolicitudResuelta } from "@/lib/email/rrhhCorreo";
import type { ResultadoAccion } from "@/lib/forms/resultado";
import { mensajeError } from "@/lib/habilitacion/servidor";
import {
  formatoDias,
  formatoHoras,
  MODALIDADES,
  tituloTipo,
  validarSolicitud,
  type EntradaSolicitud,
  type ModalidadPermiso,
  type SaldosEmpleado,
  type SolicitudFila,
} from "@/lib/rrhh/solicitudes-tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_SOLICITUD = `id, empleado_id, tipo, fecha_inicio, fecha_fin, dias, excede_saldo, fecha, hora_inicio, hora_fin, horas, motivo,
  estado, modalidad, comentario_resolucion, created_at, resuelto_en, empleado:empleados(nombre),
  solicitante:usuarios!rrhh_solicitudes_solicitado_por_fkey(nombre), resolutor:usuarios!rrhh_solicitudes_resuelto_por_fkey(nombre)`;

const numeros = (s: SolicitudFila): SolicitudFila => ({
  ...s,
  dias: s.dias === null ? null : Number(s.dias),
  horas: s.horas === null ? null : Number(s.horas),
  hora_inicio: s.hora_inicio?.slice(0, 5) ?? null,
  hora_fin: s.hora_fin?.slice(0, 5) ?? null,
});

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

function describir(s: Pick<SolicitudFila, "tipo" | "fecha_inicio" | "fecha_fin" | "dias" | "fecha" | "hora_inicio" | "hora_fin" | "horas">): string {
  if (s.tipo === "vacaciones" && s.fecha_inicio && s.fecha_fin) {
    return `${tituloTipo(s.tipo)} del ${fechaCorta(s.fecha_inicio)} al ${fechaCorta(s.fecha_fin)} (${formatoDias(Number(s.dias ?? 0))} hábiles)`;
  }
  return `${tituloTipo(s.tipo)} el ${s.fecha ? fechaCorta(s.fecha) : ""} de ${s.hora_inicio?.slice(0, 5)} a ${s.hora_fin?.slice(0, 5)} (${formatoHoras(Number(s.horas ?? 0))})`;
}

const revalidar = () => {
  revalidatePath("/mis-solicitudes");
  revalidatePath("/rrhh");
};

// ---------- Consultas ----------

export type MiEmpleado = { id: string; nombre: string; laboral: boolean } | null;

export async function getMiEmpleado(): Promise<MiEmpleado> {
  const usuario = await getCurrentUsuario();
  if (!usuario) return null;
  // El empleado puede no tener acceso a la tabla empleados (sin permiso de
  // RRHH): se busca con el cliente de servicio, solo el vinculado a su usuario.
  const admin = createAdminClient();
  const { data } = await admin
    .from("empleados")
    .select("id, nombre, categoria_contrato")
    .eq("usuario_id", usuario.id)
    .eq("clinica_id", usuario.clinica_id)
    .eq("activo", true)
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, nombre: data.nombre, laboral: data.categoria_contrato === "laboral" } : null;
}

export async function getSaldosEmpleado(empleadoId: string): Promise<SaldosEmpleado | null> {
  if (!UUID.test(empleadoId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("fn_rrhh_saldos", { p_empleado: empleadoId });
  if (!data) return null;
  const d = data as SaldosEmpleado;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    laboral: Boolean(d.laboral),
    vacaciones: { generados: n(d.vacaciones.generados), tomados: n(d.vacaciones.tomados), pendientes: n(d.vacaciones.pendientes), disponibles: n(d.vacaciones.disponibles) },
    horas: { por_reponer: n(d.horas.por_reponer), repuestas: n(d.horas.repuestas), pendientes: n(d.horas.pendientes) },
  };
}

export async function getSolicitudes(filtro: { empleadoId?: string; estado?: "pendiente" | "resueltas"; limite?: number }): Promise<SolicitudFila[]> {
  const supabase = await createClient();
  let q = supabase.from("rrhh_solicitudes").select(SELECT_SOLICITUD);
  if (filtro.empleadoId && UUID.test(filtro.empleadoId)) q = q.eq("empleado_id", filtro.empleadoId);
  if (filtro.estado === "pendiente") q = q.eq("estado", "pendiente");
  if (filtro.estado === "resueltas") q = q.neq("estado", "pendiente");
  const { data } = await q.order("created_at", { ascending: filtro.estado === "pendiente" }).limit(filtro.limite ?? 100);
  return ((data ?? []) as unknown as SolicitudFila[]).map(numeros);
}

export async function contarDiasHabiles(desde: string, hasta: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("fn_rrhh_contar_dias", { p_desde: desde, p_hasta: hasta });
  return Number(data ?? 0);
}

// ---------- Acciones ----------

export async function crearSolicitud(input: EntradaSolicitud & { empleadoId?: string | null }): Promise<ResultadoAccion> {
  const invalido = validarSolicitud(input);
  if (invalido) return { error: invalido };
  if (input.empleadoId && !UUID.test(input.empleadoId)) return { error: "Empleado inválido." };
  const usuario = await getCurrentUsuario();
  if (!usuario) return { error: "Sesión inválida." };
  const supabase = await createClient();
  const vac = input.tipo === "vacaciones";
  const { data: id, error } = await supabase.rpc("fn_rrhh_solicitar", {
    p_empleado: input.empleadoId ?? null,
    p_tipo: input.tipo,
    p_fecha_inicio: vac ? input.fechaInicio : null,
    p_fecha_fin: vac ? input.fechaFin : null,
    p_fecha: vac ? null : input.fecha,
    p_hora_inicio: vac ? null : input.horaInicio,
    p_hora_fin: vac ? null : input.horaFin,
    p_motivo: (input.motivo ?? "").trim() || null,
  });
  if (error || !id) return { error: error ? mensajeError("crearSolicitud", error, "No se pudo registrar la solicitud.") : "No se pudo registrar la solicitud." };

  // Aviso a quienes aprueban (no bloquea si falla).
  const admin = createAdminClient();
  const [{ data: sol }, { data: aprobadores }] = await Promise.all([
    admin.from("rrhh_solicitudes").select("tipo, fecha_inicio, fecha_fin, dias, fecha, hora_inicio, hora_fin, horas, empleado:empleados(nombre)").eq("id", id).maybeSingle(),
    admin.rpc("fn_rrhh_aprobadores", { p_clinica: usuario.clinica_id }),
  ]);
  if (sol) {
    const correos = ((aprobadores ?? []) as { email: string }[]).map((a) => a.email).filter((c) => c !== usuario.email);
    await avisarSolicitudNueva({
      aprobadores: correos,
      empleado: (sol.empleado as unknown as { nombre: string } | null)?.nombre ?? "Un empleado",
      descripcion: describir(sol as unknown as SolicitudFila),
      url: `${siteUrl()}/rrhh?tab=solicitudes`,
    });
  }
  revalidar();
  return {};
}

export async function resolverSolicitud(input: { id: string; aprobar: boolean; modalidad?: ModalidadPermiso | null; comentario?: string }): Promise<ResultadoAccion> {
  if (!UUID.test(input.id)) return { error: "Solicitud inválida." };
  if (input.modalidad && !MODALIDADES.some((m) => m.valor === input.modalidad)) return { error: "Modalidad inválida." };
  const comentario = (input.comentario ?? "").trim();
  if (!input.aprobar && comentario.length < 3) return { error: "Escribe por qué se rechaza." };
  const supabase = await createClient();
  const { error: errorBd } = await supabase.rpc("fn_rrhh_resolver", {
    p_solicitud: input.id,
    p_aprobar: input.aprobar,
    p_modalidad: input.modalidad ?? null,
    p_comentario: comentario || null,
  });
  if (errorBd) return { error: mensajeError("resolverSolicitud", errorBd, "No se pudo resolver la solicitud.") };

  // Aviso al empleado: al correo de su usuario o, si no tiene, al de su ficha.
  const admin = createAdminClient();
  const { data: sol } = await admin
    .from("rrhh_solicitudes")
    .select("tipo, fecha_inicio, fecha_fin, dias, fecha, hora_inicio, hora_fin, horas, empleado:empleados(nombre, email, usuario:usuarios(email))")
    .eq("id", input.id)
    .maybeSingle();
  if (sol) {
    const e = sol.empleado as unknown as { nombre: string; email: string | null; usuario: { email: string } | null } | null;
    await avisarSolicitudResuelta({
      correo: e?.usuario?.email ?? e?.email ?? null,
      empleado: e?.nombre ?? "",
      descripcion: describir(sol as unknown as SolicitudFila),
      aprobada: input.aprobar,
      comentario: comentario || null,
      url: `${siteUrl()}/mis-solicitudes`,
    });
  }
  revalidar();
  return {};
}

export async function cancelarSolicitud(id: string): Promise<ResultadoAccion> {
  if (!UUID.test(id)) return { error: "Solicitud inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rrhh_cancelar", { p_solicitud: id });
  if (error) return { error: mensajeError("cancelarSolicitud", error, "No se pudo cancelar la solicitud.") };
  revalidar();
  return {};
}

export async function configurarSabadoLaboral(laboral: boolean): Promise<ResultadoAccion> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rrhh_config_sabado", { p_laboral: laboral });
  if (error) return { error: mensajeError("configurarSabadoLaboral", error, "No se pudo guardar la configuración.") };
  revalidar();
  return {};
}
