import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getSedesActivas(supabase: Supabase) {
  const { data } = await supabase
    .from("sedes")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getMediosPagoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("medios_pago")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposTratamientoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_tratamiento")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposIdentificacionActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_identificacion")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getGenerosActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("generos")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getPaisesActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("paises")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getCanalesCaptacionActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("canales_captacion")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getCampanasActivas(supabase: Supabase) {
  const { data } = await supabase
    .from("campanas")
    .select("id, nombre")
    .eq("activo", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getEpsActivos(supabase: Supabase) {
  const { data } = await supabase.from("eps").select("id, nombre").eq("activo", true).order("orden");
  return data ?? [];
}

export async function getProveedoresActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("proveedores")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getConsultoriosActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("consultorios")
    .select("id, nombre, sede_id")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getNeverasActivas(supabase: Supabase) {
  const { data } = await supabase
    .from("neveras")
    .select("id, nombre, sede_id")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposExtintorActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_extintor")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

// id = codigo (no el uuid de la fila) a propósito: es lo que viaja en el
// formulario y lo que queda guardado en movimientos_insumos.motivo_movimiento
// — así los componentes existentes que ya usan la forma Opcion (toItems,
// etc.) funcionan sin cambios.
export async function getMotivosMovimientoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("motivos_movimiento_inventario")
    .select("codigo, nombre, categoria")
    .eq("activo", true)
    .order("orden");
  const filas = data ?? [];
  return {
    entrada: filas.filter((m) => m.categoria === "entrada").map((m) => ({ id: m.codigo, nombre: m.nombre })),
    salida: filas.filter((m) => m.categoria === "salida").map((m) => ({ id: m.codigo, nombre: m.nombre })),
  };
}

// Picker de solo id+nombre vía fn_empleados_picker() — desde el módulo
// RRHH (0048), `empleados` restringió su SELECT a has_permission('rrhh',
// 'VIEW'), así que un usuario de Medio Ambiente sin ese permiso ya no
// podría leer la tabla directo. La función RPC expone solo lo necesario
// para el selector, sin exigir permiso de RRHH.
export async function getEmpleadosActivos(supabase: Supabase) {
  const { data } = await supabase.rpc("fn_empleados_picker");
  const filas = (data ?? []) as { id: string; nombre: string }[];
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function getPaisOperacionClinica(supabase: Supabase) {
  const { data } = await supabase
    .from("clinicas")
    .select("pais_operacion_id, exoneracion_aportes_salud_parafiscales, paises:pais_operacion_id(codigo, nombre)")
    .single();
  return data;
}

export async function getTiposIdentificacionTodos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_identificacion")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposContratoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_contrato")
    .select("id, nombre, categoria")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getEpsActivasPorPais(supabase: Supabase, paisId: string) {
  const { data } = await supabase
    .from("eps")
    .select("id, nombre")
    .eq("activo", true)
    .eq("pais_id", paisId)
    .order("orden");
  return data ?? [];
}

export async function getFondosPensionActivos(supabase: Supabase, paisId: string) {
  const { data } = await supabase
    .from("fondos_pension")
    .select("id, nombre")
    .eq("activo", true)
    .eq("pais_id", paisId)
    .order("orden");
  return data ?? [];
}

export async function getFondosCesantiasActivos(supabase: Supabase, paisId: string) {
  const { data } = await supabase
    .from("fondos_cesantias")
    .select("id, nombre")
    .eq("activo", true)
    .eq("pais_id", paisId)
    .order("orden");
  return data ?? [];
}

export async function getArlsActivas(supabase: Supabase, paisId: string) {
  const { data } = await supabase
    .from("arls")
    .select("id, nombre")
    .eq("activo", true)
    .eq("pais_id", paisId)
    .order("orden");
  return data ?? [];
}

export async function getBancosActivos(supabase: Supabase, paisId: string) {
  const { data } = await supabase
    .from("bancos")
    .select("id, nombre")
    .eq("activo", true)
    .eq("pais_id", paisId)
    .order("orden");
  return data ?? [];
}

export async function getClasesRiesgoActivas(supabase: Supabase, paisId: string) {
  const { data } = await supabase
    .from("clases_riesgo")
    .select("id, nombre, tarifa_arl")
    .eq("activo", true)
    .eq("pais_id", paisId)
    .order("orden");
  return data ?? [];
}

export async function getTiposCuentaBancariaActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_cuenta_bancaria")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposExamenOcupacionalActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_examen_ocupacional")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposVacunaActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_vacuna")
    .select("id, nombre")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getCargosActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("cargos")
    .select("id, nombre, clase_riesgo_id")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getTiposDocumentoNormativoActivos(supabase: Supabase) {
  const { data } = await supabase
    .from("tipos_documento_normativo")
    .select("id, nombre, categoria")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

export async function getValoresLegalesAnio(supabase: Supabase, paisId: string, anio: number) {
  const { data } = await supabase
    .from("valores_legales_pais")
    .select("smlv, auxilio_transporte, uvt")
    .eq("pais_id", paisId)
    .eq("anio", anio)
    .maybeSingle();
  return data;
}
