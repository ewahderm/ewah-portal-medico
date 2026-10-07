"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { verificarAdminExport } from "@/lib/exportar/acceso";
import { leerFilasXlsx } from "@/lib/exportar/xlsx";
import { COLUMNAS_PACIENTES } from "@/lib/pacientes/exportar";
import {
  getTiposIdentificacionActivos,
  getGenerosActivos,
  getPaisesActivos,
  getCanalesCaptacionActivos,
} from "@/lib/catalogos";
import type { ActionState } from "@/lib/auth/actions";
import { valorOpcionalSelect, campoOpcional } from "@/lib/forms/opcional";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import type { ResultadoAccion } from "@/lib/forms/resultado";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("pacientes", permiso);
}

// null = puede seguir creando. Cuenta solo pacientes activos — uno
// desactivado no sigue "ocupando" un cupo del plan.
async function verificarLimitePacientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicaId: string,
): Promise<string | null> {
  const { data: clinica } = await supabase
    .from("clinicas")
    .select("planes(nombre, limite_pacientes)")
    .eq("id", clinicaId)
    .maybeSingle();

  const plan = clinica?.planes as unknown as { nombre: string; limite_pacientes: number | null } | null;
  if (!plan?.limite_pacientes) return null;

  const { count } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinicaId)
    .eq("activo", true);

  if ((count ?? 0) >= plan.limite_pacientes) {
    return `Tu plan ${plan.nombre} permite hasta ${plan.limite_pacientes} pacientes activos. Desactiva alguno o solicita el plan Pro desde Suscripción para seguir agregando.`;
  }
  return null;
}

function datosPacienteDesdeForm(formData: FormData) {
  return {
    tipo_identificacion_id: String(formData.get("tipoIdentificacionId") ?? ""),
    numero_identificacion: String(formData.get("numeroIdentificacion") ?? "").trim(),
    primer_nombre: String(formData.get("primerNombre") ?? "").trim(),
    segundo_nombre: campoOpcional(formData, "segundoNombre"),
    primer_apellido: String(formData.get("primerApellido") ?? "").trim(),
    segundo_apellido: campoOpcional(formData, "segundoApellido"),
    fecha_nacimiento: campoOpcional(formData, "fechaNacimiento"),
    genero_id: valorOpcionalSelect(formData, "generoId"),
    nacionalidad_id: valorOpcionalSelect(formData, "nacionalidadId"),
    pais_residencia_id: valorOpcionalSelect(formData, "paisResidenciaId"),
    canal_captacion_id: valorOpcionalSelect(formData, "canalCaptacionId"),
    campana_id: valorOpcionalSelect(formData, "campanaId"),
    eps_id: valorOpcionalSelect(formData, "epsId"),
    email: campoOpcional(formData, "email"),
    telefono1: campoOpcional(formData, "telefono1"),
    telefono2: campoOpcional(formData, "telefono2"),
    direccion: campoOpcional(formData, "direccion"),
    contacto_emergencia_nombre: campoOpcional(formData, "contactoEmergenciaNombre"),
    contacto_emergencia_telefono: campoOpcional(formData, "contactoEmergenciaTelefono"),
  };
}

export async function crearPaciente(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosPacienteDesdeForm(formData);

  if (!datos.tipo_identificacion_id || !datos.numero_identificacion) {
    return { error: "Tipo y número de identificación son obligatorios." };
  }
  if (!datos.primer_nombre || !datos.primer_apellido) {
    return { error: "Nombre y apellido son obligatorios." };
  }
  if (!datos.email || !datos.telefono1) {
    return { error: "Correo y teléfono principal son obligatorios." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const limiteAlcanzado = await verificarLimitePacientes(supabase, check.usuario.clinica_id);
  if (limiteAlcanzado) return { error: limiteAlcanzado };

  const { error } = await supabase.from("pacientes").insert({
    ...datos,
    clinica_id: check.usuario.clinica_id,
    created_by: check.usuario.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un paciente con ese tipo y número de identificación." };
    }
    return { error: "No se pudo crear el paciente." };
  }

  revalidatePath("/pacientes");
  return null;
}

export async function actualizarPaciente(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Paciente inválido." };

  const datos = datosPacienteDesdeForm(formData);

  if (!datos.tipo_identificacion_id || !datos.numero_identificacion) {
    return { error: "Tipo y número de identificación son obligatorios." };
  }
  if (!datos.primer_nombre || !datos.primer_apellido) {
    return { error: "Nombre y apellido son obligatorios." };
  }
  if (!datos.email || !datos.telefono1) {
    return { error: "Correo y teléfono principal son obligatorios." };
  }

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("pacientes").update(datos).eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un paciente con ese tipo y número de identificación." };
    }
    return { error: "No se pudo actualizar el paciente." };
  }

  revalidatePath("/pacientes");
  return null;
}

export type PacienteRapidoState =
  | { error: string; creado?: undefined }
  | { error?: undefined; creado: { id: string; nombre: string } }
  | null;

// Creación mínima desde Agenda: solo lo que ya se conoce en una llamada o
// un WhatsApp (nombre, apellido, correo, teléfono). El documento de
// identidad queda pendiente a propósito — se completa en el consultorio
// en la primera visita. Ver lib/pacientes/completitud.ts para cómo eso
// bloquea la creación de tratamientos hasta que se complete.
export async function crearPacienteRapido(
  _prevState: PacienteRapidoState,
  formData: FormData,
): Promise<PacienteRapidoState> {
  const primerNombre = String(formData.get("primerNombre") ?? "").trim();
  const primerApellido = String(formData.get("primerApellido") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telefono1 = String(formData.get("telefono1") ?? "").trim();

  if (!primerNombre || !primerApellido || !email || !telefono1) {
    return { error: "Nombre, apellido, correo y teléfono son obligatorios." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const limiteAlcanzado = await verificarLimitePacientes(supabase, check.usuario.clinica_id);
  if (limiteAlcanzado) return { error: limiteAlcanzado };

  const { data: paciente, error } = await supabase
    .from("pacientes")
    .insert({
      primer_nombre: primerNombre,
      primer_apellido: primerApellido,
      email,
      telefono1,
      clinica_id: check.usuario.clinica_id,
      created_by: check.usuario.id,
    })
    .select("id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido")
    .single();

  if (error || !paciente) return { error: "No se pudo crear el paciente." };

  revalidatePath("/pacientes");
  return { creado: { id: paciente.id, nombre: nombreCompleto(paciente) } };
}

export async function toggleActivoPaciente(id: string, activo: boolean): Promise<ResultadoAccion> {
  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("pacientes").update({ activo }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el estado del paciente." };

  revalidatePath("/pacientes");
  return {};
}

export type ImportarPacientesResultado =
  | { error: string }
  | { importados: number; errores: { fila: number; motivo: string }[] };

// Exclusivo de Administrador (requireAdminExport, no requirePermiso) — ver
// lib/exportar/acceso.ts. Inserta fila por fila (no un solo insert masivo)
// a propósito: así un duplicado o un dato inválido en una fila no tumba
// todo el archivo, y el resumen final puede decir exactamente cuál falló.
export async function importarPacientes(formData: FormData): Promise<ImportarPacientesResultado> {
  const acceso = await verificarAdminExport();
  if (!acceso.ok) return { error: acceso.error };
  const usuario = acceso.usuario;

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona un archivo .xlsx." };
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const filas = leerFilasXlsx(buffer, COLUMNAS_PACIENTES);
  if (filas.length === 0) {
    return { error: "El archivo no tiene filas para importar." };
  }

  const supabase = await createClient();
  const [tiposIdentificacion, generos, paises, canalesCaptacion, { data: clinica }, { count: pacientesActuales }] =
    await Promise.all([
      getTiposIdentificacionActivos(supabase),
      getGenerosActivos(supabase),
      getPaisesActivos(supabase),
      getCanalesCaptacionActivos(supabase),
      supabase.from("clinicas").select("planes(nombre, limite_pacientes)").eq("id", usuario.clinica_id).maybeSingle(),
      supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("clinica_id", usuario.clinica_id).eq("activo", true),
    ]);

  // Mapa de nombre (sin mayúsculas/espacios) → id, para resolver el texto
  // legible que trae el Excel de vuelta a la llave foránea real.
  function mapaPorNombre(filas: { id: string; nombre: string }[]) {
    return new Map(filas.map((f) => [f.nombre.trim().toLowerCase(), f.id]));
  }
  const idPorTipoIdentificacion = mapaPorNombre(tiposIdentificacion);
  const idPorGenero = mapaPorNombre(generos);
  const idPorPais = mapaPorNombre(paises);
  const idPorCanalCaptacion = mapaPorNombre(canalesCaptacion);

  const plan = clinica?.planes as unknown as { nombre: string; limite_pacientes: number | null } | null;
  let cuposDisponibles = plan?.limite_pacientes
    ? plan.limite_pacientes - (pacientesActuales ?? 0)
    : Infinity;
  if (cuposDisponibles <= 0) {
    return {
      importados: 0,
      errores: [
        {
          fila: 0,
          motivo: `Tu plan ${plan?.nombre} ya alcanzó el límite de ${plan?.limite_pacientes} pacientes activos.`,
        },
      ],
    };
  }

  const errores: { fila: number; motivo: string }[] = [];
  let importados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2; // +1 por el encabezado, +1 porque Excel es 1-indexado

    if (cuposDisponibles <= 0) {
      errores.push({ fila: numeroFila, motivo: "No se importó: se alcanzó el límite de pacientes del plan." });
      continue;
    }

    if (!fila.tipo_identificacion || !fila.numero_identificacion || !fila.primer_nombre || !fila.primer_apellido || !fila.email || !fila.telefono1) {
      errores.push({
        fila: numeroFila,
        motivo: "Faltan campos obligatorios (tipo/número de identificación, nombre, apellido, correo o teléfono).",
      });
      continue;
    }

    const tipoIdentificacionId = idPorTipoIdentificacion.get(fila.tipo_identificacion.toLowerCase());
    if (!tipoIdentificacionId) {
      errores.push({ fila: numeroFila, motivo: `Tipo de identificación "${fila.tipo_identificacion}" no existe.` });
      continue;
    }

    const generoId = fila.genero ? idPorGenero.get(fila.genero.toLowerCase()) : undefined;
    if (fila.genero && !generoId) {
      errores.push({ fila: numeroFila, motivo: `Género "${fila.genero}" no existe.` });
      continue;
    }

    const nacionalidadId = fila.nacionalidad ? idPorPais.get(fila.nacionalidad.toLowerCase()) : undefined;
    if (fila.nacionalidad && !nacionalidadId) {
      errores.push({ fila: numeroFila, motivo: `Nacionalidad "${fila.nacionalidad}" no existe.` });
      continue;
    }

    const paisResidenciaId = fila.pais_residencia ? idPorPais.get(fila.pais_residencia.toLowerCase()) : undefined;
    if (fila.pais_residencia && !paisResidenciaId) {
      errores.push({ fila: numeroFila, motivo: `País de residencia "${fila.pais_residencia}" no existe.` });
      continue;
    }

    const canalCaptacionId = fila.canal_captacion ? idPorCanalCaptacion.get(fila.canal_captacion.toLowerCase()) : undefined;
    if (fila.canal_captacion && !canalCaptacionId) {
      errores.push({ fila: numeroFila, motivo: `Canal de captación "${fila.canal_captacion}" no existe.` });
      continue;
    }

    if (fila.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha_nacimiento)) {
      errores.push({ fila: numeroFila, motivo: "Fecha de nacimiento debe tener el formato AAAA-MM-DD." });
      continue;
    }

    const { error } = await supabase.from("pacientes").insert({
      clinica_id: usuario.clinica_id,
      created_by: usuario.id,
      tipo_identificacion_id: tipoIdentificacionId,
      numero_identificacion: fila.numero_identificacion,
      primer_nombre: fila.primer_nombre,
      segundo_nombre: fila.segundo_nombre || null,
      primer_apellido: fila.primer_apellido,
      segundo_apellido: fila.segundo_apellido || null,
      fecha_nacimiento: fila.fecha_nacimiento || null,
      genero_id: generoId ?? null,
      nacionalidad_id: nacionalidadId ?? null,
      pais_residencia_id: paisResidenciaId ?? null,
      canal_captacion_id: canalCaptacionId ?? null,
      email: fila.email,
      telefono1: fila.telefono1,
      telefono2: fila.telefono2 || null,
      direccion: fila.direccion || null,
      contacto_emergencia_nombre: fila.contacto_emergencia_nombre || null,
      contacto_emergencia_telefono: fila.contacto_emergencia_telefono || null,
    });

    if (error) {
      const motivo =
        error.code === "23505"
          ? "Ya existe un paciente con ese tipo y número de identificación."
          : "No se pudo guardar este paciente.";
      errores.push({ fila: numeroFila, motivo });
      continue;
    }

    importados++;
    if (cuposDisponibles !== Infinity) cuposDisponibles--;
  }

  revalidatePath("/pacientes");
  return { importados, errores };
}
