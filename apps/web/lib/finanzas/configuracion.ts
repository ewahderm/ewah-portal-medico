"use server";

// Configuración del flujo de caja (FC1): asistente de arranque, fecha de
// inicio, cuentas, socios y categorías. La BD (0089) vuelve a validar todo;
// aquí se dan los mensajes claros y se exige el permiso antes de escribir.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { FECHA_ISO, esUuid, hoyBogota, mensajeError } from "@/lib/habilitacion/servidor";
import { ACTIVIDADES, MODULO_FINANZAS, type TipoCuenta } from "@/lib/finanzas/constantes";
import {
  saldoParaGuardar,
  validarAsistente,
  validarCuenta,
  validarSocio,
  type CuentaEntrada,
  type SocioEntrada,
} from "@/lib/finanzas/cuentas";

type Resultado = { error?: string };

const revalidar = () => revalidatePath("/finanzas", "layout");

async function requireEditar() {
  const check = await requirePermiso(MODULO_FINANZAS, "EDIT");
  if (!check.ok) return { ...check, gestion: false };
  const supabase = await createClient();
  const { data: gestion } = await supabase.rpc("has_entitlement", { modulo_code: MODULO_FINANZAS, feature_code: "gestion" });
  return { ...check, gestion: !!gestion };
}

export async function activarFinanzas(input: { fechaInicio: string; cuentas: CuentaEntrada[]; socios: SocioEntrada[] }): Promise<Resultado> {
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  const error = validarAsistente({ ...input, hoy: hoyBogota() }, check.gestion);
  if (error) return { error };

  const supabase = await createClient();
  const { error: errorBd } = await supabase.rpc("fn_fin_activar", {
    p_fecha_inicio: input.fechaInicio,
    p_socios: input.socios.map((s) => ({
      nombre: s.nombre.trim(),
      numero_identificacion: s.numeroIdentificacion.trim(),
      porcentaje_participacion: s.porcentaje,
    })),
    p_cuentas: input.cuentas.map((c, i) => ({
      nombre: c.nombre.trim(),
      tipo: c.tipo,
      moneda: c.moneda,
      saldo_inicial: saldoParaGuardar(c.tipo as TipoCuenta, c.saldo),
      socio_indice: c.tipo === "tarjeta_socio" ? c.socioIndice : null,
      orden: i,
    })),
  });
  if (errorBd) return { error: mensajeError("activarFinanzas", errorBd, "No se pudo activar el flujo de caja.") };
  revalidar();
  return {};
}

export async function cambiarFechaInicio(fecha: string): Promise<Resultado> {
  if (!FECHA_ISO.test(fecha)) return { error: "Elige la fecha de inicio." };
  if (fecha > hoyBogota()) return { error: "La fecha de inicio no puede ser futura." };
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_config").update({ fecha_inicio: fecha }).eq("clinica_id", check.usuario.clinica_id).select("fecha_inicio");
  if (error) return { error: mensajeError("cambiarFechaInicio", error, "No se pudo cambiar la fecha.") };
  if (!data?.length) return { error: "No tienes permiso para cambiar la fecha de inicio." };
  revalidar();
  return {};
}

export async function guardarCuenta(input: {
  id: string | null;
  nombre: string;
  tipo: string;
  moneda: string;
  saldo: number;
  socioId: string | null;
  ultimosDigitos: string | null;
}): Promise<Resultado> {
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const socios = input.socioId && esUuid(input.socioId) ? 1 : 0;
  const error = validarCuenta(
    { nombre: input.nombre, tipo: input.tipo, moneda: input.moneda, saldo: input.saldo, socioIndice: socios ? 0 : null },
    { gestion: check.gestion, socios },
  );
  if (error) return { error };
  const digitos = input.ultimosDigitos?.trim() || null;
  if (digitos && !/^\d{4}$/.test(digitos)) return { error: "Los últimos dígitos son 4 números." };
  const saldo = saldoParaGuardar(input.tipo as TipoCuenta, input.saldo);

  if (input.id) {
    if (!esUuid(input.id)) return { error: "Cuenta inválida." };
    const { data, error: e } = await supabase
      .from("fin_cuentas")
      .update({ nombre: input.nombre.trim(), saldo_inicial: saldo, ultimos_digitos: digitos })
      .eq("id", input.id)
      .select("id");
    if (e) return { error: mensajeError("guardarCuenta", e, "No se pudo guardar la cuenta.") };
    if (!data?.length) return { error: "No tienes permiso para editar cuentas." };
  } else {
    const { error: e } = await supabase.from("fin_cuentas").insert({
      clinica_id: check.usuario.clinica_id,
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      moneda: input.moneda,
      saldo_inicial: saldo,
      socio_id: input.tipo === "tarjeta_socio" ? input.socioId : null,
      ultimos_digitos: digitos,
    });
    if (e) {
      if (e.code === "23505") return { error: "Ya existe una cuenta con ese nombre." };
      return { error: mensajeError("guardarCuenta", e, "No se pudo crear la cuenta.") };
    }
  }
  revalidar();
  return {};
}

export async function cambiarEstadoCuenta(id: string, activa: boolean): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Cuenta inválida." };
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_cuentas").update({ activa }).eq("id", id).select("id");
  if (error) return { error: mensajeError("cambiarEstadoCuenta", error, "No se pudo actualizar la cuenta.") };
  if (!data?.length) return { error: "No tienes permiso para editar cuentas." };
  revalidar();
  return {};
}

export async function guardarSocio(input: {
  id: string | null;
  nombre: string;
  numeroIdentificacion: string;
  tipoIdentificacionId: string | null;
  porcentaje: number | null;
  empleadoId: string | null;
  activo: boolean;
}): Promise<Resultado> {
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  if (!check.gestion) return { error: "Los socios están disponibles en el plan Pro." };
  const error = validarSocio({ nombre: input.nombre, numeroIdentificacion: input.numeroIdentificacion, porcentaje: input.porcentaje });
  if (error) return { error };
  if (input.tipoIdentificacionId && !esUuid(input.tipoIdentificacionId)) return { error: "Tipo de identificación inválido." };
  if (input.empleadoId && !esUuid(input.empleadoId)) return { error: "Empleado inválido." };
  const datos = {
    nombre: input.nombre.trim(),
    numero_identificacion: input.numeroIdentificacion.trim(),
    tipo_identificacion_id: input.tipoIdentificacionId,
    porcentaje_participacion: input.porcentaje,
    empleado_id: input.empleadoId,
    activo: input.activo,
  };
  const supabase = await createClient();
  if (input.id) {
    if (!esUuid(input.id)) return { error: "Socio inválido." };
    const { data, error: e } = await supabase.from("fin_socios").update(datos).eq("id", input.id).select("id");
    if (e) return { error: e.code === "23505" ? "Ya hay un socio con esa identificación." : mensajeError("guardarSocio", e, "No se pudo guardar el socio.") };
    if (!data?.length) return { error: "No tienes permiso para editar socios." };
  } else {
    const { error: e } = await supabase.from("fin_socios").insert({ ...datos, clinica_id: check.usuario.clinica_id });
    if (e) return { error: e.code === "23505" ? "Ya hay un socio con esa identificación." : mensajeError("guardarSocio", e, "No se pudo crear el socio.") };
  }
  revalidar();
  return {};
}

// Renombra o activa/desactiva una categoría global (crea o actualiza su
// personalización), o edita una propia.
export async function personalizarCategoria(input: {
  codigo: string;
  personalizacionId: string | null;
  nombre: string | null;
  activa: boolean;
}): Promise<Resultado> {
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  const nombre = input.nombre?.trim() || null;
  if (nombre && (nombre.length < 3 || nombre.length > 60)) return { error: "El nombre va de 3 a 60 caracteres." };
  const supabase = await createClient();
  if (input.personalizacionId) {
    if (!esUuid(input.personalizacionId)) return { error: "Categoría inválida." };
    const { data, error } = await supabase
      .from("fin_categorias_clinica")
      .update({ nombre, activa: input.activa })
      .eq("id", input.personalizacionId)
      .select("id");
    if (error) return { error: error.code === "23505" ? "Ya hay una categoría con ese nombre." : mensajeError("personalizarCategoria", error, "No se pudo guardar la categoría.") };
    if (!data?.length) return { error: "No tienes permiso para editar categorías." };
  } else {
    if (!/^[A-Z][A-Z0-9_]{2,40}$/.test(input.codigo)) return { error: "Categoría inválida." };
    const { error } = await supabase
      .from("fin_categorias_clinica")
      .insert({ clinica_id: check.usuario.clinica_id, categoria_codigo: input.codigo, nombre, activa: input.activa });
    if (error) return { error: error.code === "23505" ? "Ya hay una categoría con ese nombre." : mensajeError("personalizarCategoria", error, "No se pudo guardar la categoría.") };
  }
  revalidar();
  return {};
}

export async function crearCategoriaPropia(input: { nombre: string; tipo: string; actividad: string }): Promise<Resultado> {
  const nombre = input.nombre.trim();
  if (nombre.length < 3 || nombre.length > 60) return { error: "El nombre va de 3 a 60 caracteres." };
  if (input.tipo !== "ingreso" && input.tipo !== "egreso") return { error: "Elige si es de entrada o de salida." };
  if (!ACTIVIDADES.some((a) => a.value === input.actividad)) return { error: "Elige la actividad." };
  const check = await requireEditar();
  if (!check.ok) return { error: check.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_categorias_clinica")
    .insert({ clinica_id: check.usuario.clinica_id, nombre, tipo: input.tipo, actividad: input.actividad });
  if (error) return { error: error.code === "23505" ? "Ya hay una categoría con ese nombre." : mensajeError("crearCategoriaPropia", error, "No se pudo crear la categoría.") };
  revalidar();
  return {};
}
