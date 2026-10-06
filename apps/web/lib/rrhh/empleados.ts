"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { campoOpcional, valorOpcionalSelect } from "@/lib/forms/opcional";
import type { ActionState } from "@/lib/auth/actions";

function requirePermiso(permiso: "CREATE" | "EDIT") {
  return requirePermisoBase("rrhh", permiso);
}

function datosEmpleadoDesdeForm(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    codigo: campoOpcional(formData, "codigo"),
    fechaNacimiento: campoOpcional(formData, "fechaNacimiento"),
    celular: campoOpcional(formData, "celular"),
    email: campoOpcional(formData, "email"),
    tipoIdentificacionId: valorOpcionalSelect(formData, "tipoIdentificacionId"),
    numeroIdentificacion: campoOpcional(formData, "numeroIdentificacion"),
    tipoContratoId: valorOpcionalSelect(formData, "tipoContratoId"),
    fechaInicioContrato: campoOpcional(formData, "fechaInicioContrato"),
    fechaFinContrato: campoOpcional(formData, "fechaFinContrato"),
    epsId: valorOpcionalSelect(formData, "epsId"),
    fondoPensionId: valorOpcionalSelect(formData, "fondoPensionId"),
    fondoCesantiasId: valorOpcionalSelect(formData, "fondoCesantiasId"),
    arlId: valorOpcionalSelect(formData, "arlId"),
    numeroTarjetaProfesional: campoOpcional(formData, "numeroTarjetaProfesional"),
    preferenciaPago: valorOpcionalSelect(formData, "preferenciaPago"),
    tipoCuentaBancariaId: valorOpcionalSelect(formData, "tipoCuentaBancariaId"),
    numeroCuenta: campoOpcional(formData, "numeroCuenta"),
    bancoId: valorOpcionalSelect(formData, "bancoId"),
    declaranteRenta: formData.get("declaranteRenta") === "on",
    usuarioId: valorOpcionalSelect(formData, "usuarioId"),
  };
}

export async function crearEmpleado(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const datos = datosEmpleadoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("empleados").insert({
    clinica_id: check.usuario.clinica_id,
    nombre: datos.nombre,
    codigo: datos.codigo,
    fecha_nacimiento: datos.fechaNacimiento,
    celular: datos.celular,
    email: datos.email,
    tipo_identificacion_id: datos.tipoIdentificacionId,
    numero_identificacion: datos.numeroIdentificacion,
    tipo_contrato_id: datos.tipoContratoId,
    fecha_inicio_contrato: datos.fechaInicioContrato,
    fecha_fin_contrato: datos.fechaFinContrato,
    eps_id: datos.epsId,
    fondo_pension_id: datos.fondoPensionId,
    fondo_cesantias_id: datos.fondoCesantiasId,
    arl_id: datos.arlId,
    numero_tarjeta_profesional: datos.numeroTarjetaProfesional,
    preferencia_pago: datos.preferenciaPago,
    tipo_cuenta_bancaria_id: datos.tipoCuentaBancariaId,
    numero_cuenta: datos.numeroCuenta,
    banco_id: datos.bancoId,
    declarante_renta: datos.declaranteRenta,
    usuario_id: datos.usuarioId,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un empleado con ese código." };
    return { error: "No se pudo crear el empleado." };
  }

  revalidatePath("/rrhh");
  return null;
}

export async function editarEmpleado(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Empleado inválido." };

  const datos = datosEmpleadoDesdeForm(formData);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };

  const check = await requirePermiso("EDIT");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("empleados")
    .update({
      nombre: datos.nombre,
      codigo: datos.codigo,
      fecha_nacimiento: datos.fechaNacimiento,
      celular: datos.celular,
      email: datos.email,
      tipo_identificacion_id: datos.tipoIdentificacionId,
      numero_identificacion: datos.numeroIdentificacion,
      tipo_contrato_id: datos.tipoContratoId,
      fecha_inicio_contrato: datos.fechaInicioContrato,
      fecha_fin_contrato: datos.fechaFinContrato,
      eps_id: datos.epsId,
      fondo_pension_id: datos.fondoPensionId,
      fondo_cesantias_id: datos.fondoCesantiasId,
      arl_id: datos.arlId,
      numero_tarjeta_profesional: datos.numeroTarjetaProfesional,
      preferencia_pago: datos.preferenciaPago,
      tipo_cuenta_bancaria_id: datos.tipoCuentaBancariaId,
      numero_cuenta: datos.numeroCuenta,
      banco_id: datos.bancoId,
      declarante_renta: datos.declaranteRenta,
      usuario_id: datos.usuarioId,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un empleado con ese código." };
    return { error: "No se pudo actualizar el empleado." };
  }

  revalidatePath("/rrhh");
  revalidatePath(`/rrhh/${id}`);
  return null;
}

export async function toggleEmpleado(id: string, activo: boolean) {
  const check = await requirePermiso("EDIT");
  if (!check.ok) throw new Error(check.error);

  const supabase = await createClient();
  const { error } = await supabase.from("empleados").update({ activo }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el empleado.");

  revalidatePath("/rrhh");
}
