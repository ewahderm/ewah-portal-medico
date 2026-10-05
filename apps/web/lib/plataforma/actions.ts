"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// es_super_admin es una bandera cross-tenant que solo se asigna a mano en
// la base de datos (ver 0047) — nunca otorgable desde ninguna pantalla.
// Cada acción la vuelve a chequear ella misma: las policies de `clinicas`
// (0047) ya la exigen para select/update, esto es solo para devolver un
// error claro en vez de uno crudo de Postgres si alguien sin la bandera
// llega a invocar la acción directo.
async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: esSuperAdmin } = await supabase.rpc("es_super_admin");
  if (!esSuperAdmin) throw new Error("No tienes permiso para esta acción.");
  return supabase;
}

export type ClinicaPlataforma = {
  id: string;
  nombre: string;
  nombre_comercial: string | null;
  nit: string;
  activo: boolean;
  plan_id: string;
  planes: { codigo: string; nombre: string } | null;
  total_pacientes: number;
};

export async function listarClinicasPlataforma(): Promise<ClinicaPlataforma[]> {
  const supabase = await requireSuperAdmin();

  const [{ data: clinicas }, { data: conteos }] = await Promise.all([
    supabase
      .from("clinicas")
      .select("id, nombre, nombre_comercial, nit, activo, plan_id, planes(codigo, nombre)")
      .order("nombre"),
    supabase.rpc("fn_conteo_pacientes_por_clinica"),
  ]);

  const totalPorClinica = new Map<string, number>(
    (conteos ?? []).map((fila: { clinica_id: string; total: number }) => [fila.clinica_id, fila.total]),
  );

  return (clinicas ?? []).map((c) => ({
    ...(c as unknown as Omit<ClinicaPlataforma, "total_pacientes">),
    total_pacientes: totalPorClinica.get(c.id) ?? 0,
  }));
}

export async function cambiarPlanClinicaPlataforma(clinicaId: string, planCodigo: string) {
  const supabase = await requireSuperAdmin();

  const { data: plan } = await supabase.from("planes").select("id").eq("codigo", planCodigo).maybeSingle();
  if (!plan) throw new Error("Plan inválido.");

  const { error } = await supabase.from("clinicas").update({ plan_id: plan.id }).eq("id", clinicaId);
  if (error) throw new Error("No se pudo cambiar el plan.");

  revalidatePath("/plataforma");
}

export async function toggleActivoClinicaPlataforma(clinicaId: string, activo: boolean) {
  const supabase = await requireSuperAdmin();

  const { error } = await supabase.from("clinicas").update({ activo }).eq("id", clinicaId);
  if (error) throw new Error("No se pudo actualizar la clínica.");

  revalidatePath("/plataforma");
}
