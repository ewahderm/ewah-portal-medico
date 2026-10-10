"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { hoy } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso as requirePermisoBase } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";
import { campoOpcional } from "@/lib/forms/opcional";
import { rangoPagina, esRangoFueraDeLimite } from "@/lib/pagination";
import type { ResultadoAccion } from "@/lib/forms/resultado";

export type InventarioActionState = { error?: string; warning?: string } | null;

function requirePermiso(permiso: "VIEW" | "CREATE" | "VOID") {
  return requirePermisoBase("inventario", permiso);
}

// Los motivos de dropdown (compra, desecho, etc.) son un catálogo editable
// por clínica (motivos_movimiento_inventario) — ya no un enum fijo en
// código, así que hay que resolver su categoría (entrada/salida) en BD para
// saber qué signo aplicar al stock. Si el código no existe o está desactivado
// para esta clínica, se trata como inválido (alguien pudo mandar un valor
// viejo que el admin ya desactivó, o un valor inventado a mano).
async function categoriaMotivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicaId: string,
  codigo: string,
): Promise<"entrada" | "salida" | null> {
  const { data } = await supabase
    .from("motivos_movimiento_inventario")
    .select("categoria")
    .eq("clinica_id", clinicaId)
    .eq("codigo", codigo)
    .eq("activo", true)
    .maybeSingle();
  return (data?.categoria as "entrada" | "salida" | undefined) ?? null;
}

// Devuelve el id del lote recién creado para que quien lo llame pueda
// seleccionarlo de una (el diálogo de movimiento crea el lote justo para
// usarlo acto seguido). Sin error = éxito, igual que ActionState.
export type CrearLoteState = { error?: string; loteId?: string } | null;

export async function crearLote(
  _prevState: CrearLoteState,
  formData: FormData,
): Promise<CrearLoteState> {
  const insumoId = String(formData.get("insumoId") ?? "");
  const sedeId = String(formData.get("sedeId") ?? "");
  const numeroLote = String(formData.get("numeroLote") ?? "").trim();
  const motivoEntrada = String(formData.get("motivoEntrada") ?? "");
  const fechaVencimiento = campoOpcional(formData, "fechaVencimiento");
  const costoTexto = campoOpcional(formData, "costoUnitario");
  const cantidadTexto = String(formData.get("cantidadRecibida") ?? "").trim();

  if (!insumoId || !sedeId || !numeroLote || !cantidadTexto || !motivoEntrada) {
    return { error: "Insumo, sede, número de lote, motivo y cantidad recibida son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad recibida debe ser un número mayor que cero." };
  }

  const costoUnitario = costoTexto ? Number(costoTexto) : null;
  if (costoTexto && (Number.isNaN(costoUnitario) || (costoUnitario ?? 0) < 0)) {
    return { error: "El costo unitario debe ser un número válido." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("inventario");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();

  const categoria = await categoriaMotivo(supabase, check.usuario.clinica_id, motivoEntrada);
  if (categoria !== "entrada") return { error: "Elige un motivo de ingreso válido." };

  const { data: lote, error: loteError } = await supabase
    .from("lotes")
    .insert({
      clinica_id: check.usuario.clinica_id,
      insumo_id: insumoId,
      sede_id: sedeId,
      numero_lote: numeroLote,
      fecha_vencimiento: fechaVencimiento,
      // Sin proveedor: vive en el insumo (insumos.proveedor_id), no en el
      // lote — el proveedor de un producto no cambia lote a lote. Ver la
      // migración 0031.
      costo_unitario: costoUnitario,
      created_by: check.usuario.id,
    })
    .select("id")
    .single();

  if (loteError || !lote) return { error: "No se pudo crear el lote." };

  const { error: movimientoError } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: lote.id,
    tipo: "entrada",
    motivo_movimiento: motivoEntrada,
    cantidad,
    created_by: check.usuario.id,
  });

  if (movimientoError) {
    // El lote quedó sin su entrada inicial — no lo dejamos huérfano.
    await supabase.from("lotes").delete().eq("id", lote.id);
    return { error: "No se pudo registrar la entrada del lote." };
  }

  revalidatePath("/inventario");
  return { loteId: lote.id };
}

// Un lote no se elimina nunca (append-only, igual que todo lo demás en
// Inventario) — "desactivar" es la forma de sacarlo de circulación cuando
// se agotó o se dio de baja, sin perder su historial de movimientos. No
// existía ninguna forma de hacerlo desde la UI hasta ahora.
export async function toggleLote(id: string, activo: boolean): Promise<ResultadoAccion> {
  const check = await requirePermiso("VOID");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("inventario");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();
  const { error } = await supabase.from("lotes").update({ activo }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el lote." };

  revalidatePath("/inventario");
  return {};
}

export async function registrarAjusteLote(id: string, cantidad: number, motivo: string): Promise<ResultadoAccion> {
  if (!motivo.trim()) return { error: "El motivo del ajuste es obligatorio." };
  if (cantidad === 0) return { error: "La cantidad del ajuste no puede ser cero." };

  const check = await requirePermiso("VOID");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("inventario");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();
  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: id,
    tipo: "ajuste",
    cantidad,
    motivo: motivo.trim(),
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar el ajuste." };

  revalidatePath("/inventario");
  return {};
}

export type LotePorId = {
  id: string;
  numero_lote: string | null;
  fecha_vencimiento: string | null;
  cantidad_actual: number;
  activo: boolean;
  insumo_id: string;
  sede_id: string;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};

// Usado por la pantalla de escaneo (/inventario/escanear) y por el registro
// de consumo escaneado (InsumosDialog): el código QR de la etiqueta solo
// contiene el id del lote — nunca datos sensibles — así que cualquier
// "código inventado" que alguien intente pasar aquí simplemente no
// encuentra nada (RLS ya limita la búsqueda a la propia clínica, esto no
// necesita un chequeo de pertenencia aparte).
export async function buscarLotePorId(id: string): Promise<LotePorId | null | { error: string }> {
  const check = await requirePermiso("VIEW");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("inventario");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();
  const { data } = await supabase
    .from("lotes")
    .select(
      `id, numero_lote, fecha_vencimiento, cantidad_actual, activo, insumo_id, sede_id,
       insumos(nombre, unidad_medida), sedes(nombre)`,
    )
    .eq("id", id)
    .maybeSingle();

  return data as unknown as LotePorId | null;
}

export async function registrarMovimiento(
  _prevState: InventarioActionState,
  formData: FormData,
): Promise<InventarioActionState> {
  const loteId = String(formData.get("loteId") ?? "");
  const motivo = String(formData.get("motivoMovimiento") ?? "");
  const cantidadTexto = String(formData.get("cantidad") ?? "").trim();
  const observaciones = campoOpcional(formData, "observaciones");

  if (!loteId || !cantidadTexto || !motivo) {
    return { error: "Lote, tipo de movimiento y cantidad son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número mayor que cero." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("inventario");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();

  const categoria = await categoriaMotivo(supabase, check.usuario.clinica_id, motivo);
  if (!categoria) return { error: "Elige un tipo de movimiento válido." };
  const esSalida = categoria === "salida";

  const { data: lote } = await supabase
    .from("lotes")
    .select("cantidad_actual")
    .eq("id", loteId)
    .maybeSingle();

  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteId,
    tipo: categoria,
    motivo_movimiento: motivo,
    cantidad,
    motivo: observaciones,
    created_by: check.usuario.id,
  });

  if (error) return { error: "No se pudo registrar el movimiento." };

  revalidatePath("/inventario");

  if (esSalida) {
    const stockRestante = (lote?.cantidad_actual ?? 0) - cantidad;
    if (stockRestante < 0) {
      return { warning: "El lote queda con stock negativo — revisa el conteo físico." };
    }
  }
  return null;
}

export async function registrarTraslado(
  _prevState: InventarioActionState,
  formData: FormData,
): Promise<InventarioActionState> {
  const loteOrigenId = String(formData.get("loteOrigenId") ?? "");
  const sedeDestinoId = String(formData.get("sedeDestinoId") ?? "");
  const cantidadTexto = String(formData.get("cantidad") ?? "").trim();
  const observaciones = campoOpcional(formData, "observaciones");

  if (!loteOrigenId || !sedeDestinoId || !cantidadTexto) {
    return { error: "Lote de origen, sede destino y cantidad son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número mayor que cero." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const checkPlan = await requireEntitlement("inventario");
  if (!checkPlan.ok) return { error: checkPlan.error };

  const supabase = await createClient();
  const { data: loteOrigen } = await supabase
    .from("lotes")
    .select("id, insumo_id, sede_id, numero_lote, fecha_vencimiento, proveedor, costo_unitario, cantidad_actual")
    .eq("id", loteOrigenId)
    .maybeSingle();

  if (!loteOrigen) return { error: "El lote de origen no existe." };
  if (loteOrigen.sede_id === sedeDestinoId) {
    return { error: "La sede destino debe ser distinta a la sede de origen." };
  }

  let loteDestinoId: string;
  const { data: loteExistente } = await supabase
    .from("lotes")
    .select("id")
    .eq("insumo_id", loteOrigen.insumo_id)
    .eq("sede_id", sedeDestinoId)
    .eq("numero_lote", loteOrigen.numero_lote)
    .eq("activo", true)
    .maybeSingle();

  if (loteExistente) {
    loteDestinoId = loteExistente.id;
  } else {
    const { data: loteNuevo, error: loteError } = await supabase
      .from("lotes")
      .insert({
        clinica_id: check.usuario.clinica_id,
        insumo_id: loteOrigen.insumo_id,
        sede_id: sedeDestinoId,
        numero_lote: loteOrigen.numero_lote,
        fecha_vencimiento: loteOrigen.fecha_vencimiento,
        proveedor: loteOrigen.proveedor,
        costo_unitario: loteOrigen.costo_unitario,
        created_by: check.usuario.id,
      })
      .select("id")
      .single();

    if (loteError || !loteNuevo) return { error: "No se pudo crear el lote en la sede destino." };
    loteDestinoId = loteNuevo.id;
  }

  const trasladoId = randomUUID();
  const { error: salidaError } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteOrigenId,
    tipo: "salida",
    motivo_movimiento: "traslado",
    cantidad,
    motivo: observaciones,
    traslado_id: trasladoId,
    created_by: check.usuario.id,
  });
  if (salidaError) return { error: "No se pudo registrar la salida del traslado." };

  const { error: entradaError } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteDestinoId,
    tipo: "entrada",
    motivo_movimiento: "traslado",
    cantidad,
    motivo: observaciones,
    traslado_id: trasladoId,
    created_by: check.usuario.id,
  });
  if (entradaError) return { error: "La salida ya se registró, pero falló la entrada en destino — revisa el lote manualmente." };

  revalidatePath("/inventario");

  const stockRestante = loteOrigen.cantidad_actual - cantidad;
  return stockRestante < 0
    ? { warning: "El lote de origen queda con stock negativo — revisa el conteo físico." }
    : null;
}

export async function registrarConsumo(
  _prevState: InventarioActionState,
  formData: FormData,
): Promise<InventarioActionState> {
  const tratamientoId = String(formData.get("tratamientoId") ?? "");
  const loteId = String(formData.get("loteId") ?? "");
  const cantidadTexto = String(formData.get("cantidad") ?? "").trim();
  const cantidadInvimaTexto = campoOpcional(formData, "cantidadInvima");
  const sitioAnatomico = campoOpcional(formData, "sitioAnatomico");
  const motivo = campoOpcional(formData, "motivo");

  if (!tratamientoId || !loteId || !cantidadTexto) {
    return { error: "Insumo/lote y cantidad son obligatorios." };
  }

  const cantidad = Number(cantidadTexto);
  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número mayor que cero." };
  }

  const cantidadInvima = cantidadInvimaTexto ? Number(cantidadInvimaTexto) : null;
  if (cantidadInvimaTexto && (Number.isNaN(cantidadInvima) || (cantidadInvima ?? 0) < 0)) {
    return { error: "La cantidad INVIMA debe ser un número válido." };
  }

  const check = await requirePermiso("CREATE");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const [{ data: lote }, { data: tratamiento }] = await Promise.all([
    supabase.from("lotes").select("cantidad_actual").eq("id", loteId).maybeSingle(),
    supabase.from("tratamientos").select("fecha").eq("id", tratamientoId).maybeSingle(),
  ]);

  // El consumo se registra en el sistema cuando alguien alcanza a capturarlo,
  // pero el insumo se usó en la fecha del tratamiento — pueden ser días
  // distintos (captura tardía). created_at debe reflejar cuándo se aplicó,
  // no cuándo se tipeó, porque de eso dependen los filtros de fecha y los
  // reportes de Inventario (ver listarMovimientos). Hora fija (mediodía
  // Colombia) para no cruzar de día al convertir date -> timestamptz. Si el
  // tratamiento es de hoy se deja la hora real: con mediodía fijo, un lote
  // recibido esta tarde aparecía DESPUÉS de su propio consumo.
  const fechaUso =
    tratamiento?.fecha && tratamiento.fecha !== hoy() ? `${tratamiento.fecha}T12:00:00-05:00` : undefined;

  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: loteId,
    tipo: "salida",
    motivo_movimiento: "consumo_tratamiento",
    cantidad,
    cantidad_invima: cantidadInvima,
    tratamiento_id: tratamientoId,
    sitio_anatomico: sitioAnatomico,
    motivo,
    created_by: check.usuario.id,
    ...(fechaUso ? { created_at: fechaUso } : {}),
  });

  // Los rechazos de la BD (0112: lote de otra sede, tratamiento anulado…)
  // están escritos para la persona.
  if (error) return { error: error.code === "P0001" ? error.message : "No se pudo registrar el consumo." };

  revalidatePath("/tratamientos");
  revalidatePath("/inventario");

  const stockRestante = (lote?.cantidad_actual ?? 0) - cantidad;
  return stockRestante < 0
    ? { warning: "El lote queda con stock negativo — revisa el conteo físico." }
    : null;
}

export async function listarMovimientos(filtros: {
  insumoId?: string;
  sedeId?: string;
  tipo?: string;
  motivo?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}) {
  const supabase = await createClient();
  const embedLote = filtros.insumoId || filtros.sedeId ? "lotes!inner" : "lotes";

  let query = supabase
    .from("movimientos_insumos")
    .select(
      `id, tipo, motivo_movimiento, cantidad, cantidad_invima, sitio_anatomico, motivo, created_at,
       ${embedLote}(numero_lote, insumo_id, sede_id, insumos(nombre, unidad_medida), sedes(nombre)),
       tratamientos(fecha, pacientes(primer_nombre, primer_apellido)),
       creador:usuarios!movimientos_insumos_created_by_fkey(nombre)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (filtros.insumoId) query = query.eq("lotes.insumo_id", filtros.insumoId);
  if (filtros.sedeId) query = query.eq("lotes.sede_id", filtros.sedeId);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros.motivo) query = query.eq("motivo_movimiento", filtros.motivo);
  if (filtros.desde) query = query.gte("created_at", filtros.desde);
  if (filtros.hasta) query = query.lte("created_at", `${filtros.hasta}T23:59:59`);

  const paginaPedida = filtros.pagina ?? 1;
  const { data, count, error } = await query.range(...rangoPagina(paginaPedida));

  // Los filtros pueden cambiar entre una carga y la siguiente (alguien
  // ajusta el rango de fechas mientras está en la página 3) y esa página
  // deja de existir — Supabase devuelve un error de rango, no una lista
  // vacía. En vez de dejarlo pasar, se reconstruye la consulta completa
  // (mismos filtros) pidiendo la página 1, que nunca puede fallar por esto.
  if (esRangoFueraDeLimite(error) && paginaPedida > 1) {
    return listarMovimientos({ ...filtros, pagina: 1 });
  }

  return { movimientos: data ?? [], total: count ?? 0, pagina: paginaPedida };
}

export async function listarConsumoTratamiento(tratamientoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos_insumos")
    .select(
      `id, cantidad, cantidad_invima, sitio_anatomico, motivo, motivo_movimiento, revierte_movimiento_id, created_at,
       lotes(numero_lote, insumos(nombre, unidad_medida))`,
    )
    .eq("tratamiento_id", tratamientoId)
    .in("motivo_movimiento", ["consumo_tratamiento", "reverso_consumo"])
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function revertirConsumo(movimientoId: string, motivo: string): Promise<ResultadoAccion> {
  if (!motivo.trim()) return { error: "El motivo de la reversa es obligatorio." };

  // Mismo nivel de permiso que anular un tratamiento o ajustar stock — no
  // el permiso operativo básico (CREATE) que cualquiera usa para registrar
  // un consumo normal. Revertir borra de facto el rastro de uso de un
  // insumo, así que exige la misma autorización elevada que cualquier otra
  // corrección del sistema.
  const check = await requirePermiso("VOID");
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { data: original } = await supabase
    .from("movimientos_insumos")
    .select("id, lote_id, cantidad, tratamiento_id, motivo_movimiento")
    .eq("id", movimientoId)
    .maybeSingle();

  if (!original || original.motivo_movimiento !== "consumo_tratamiento") {
    return { error: "Ese movimiento no es un consumo válido para revertir." };
  }

  const { data: yaRevertido } = await supabase
    .from("movimientos_insumos")
    .select("id")
    .eq("revierte_movimiento_id", movimientoId)
    .maybeSingle();
  if (yaRevertido) return { error: "Este consumo ya fue revertido." };

  const { error } = await supabase.from("movimientos_insumos").insert({
    clinica_id: check.usuario.clinica_id,
    lote_id: original.lote_id,
    tipo: "entrada",
    motivo_movimiento: "reverso_consumo",
    cantidad: original.cantidad,
    tratamiento_id: original.tratamiento_id,
    revierte_movimiento_id: original.id,
    motivo: motivo.trim(),
    created_by: check.usuario.id,
  });
  if (error) return { error: "No se pudo revertir el consumo." };

  revalidatePath("/tratamientos");
  revalidatePath("/inventario");
  return {};
}

export type CorteInventarioFila = {
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  ingresos: number;
  egresos: number;
  saldo: number;
};

export async function calcularCorteInventario(fechaCorte: string, sedeId?: string) {
  const supabase = await createClient();
  const embedLote = sedeId ? "lotes!inner" : "lotes";

  let query = supabase
    .from("movimientos_insumos")
    .select(`tipo, cantidad, ${embedLote}(sede_id, insumo_id, insumos(nombre, unidad_medida))`)
    .lte("created_at", `${fechaCorte}T23:59:59`);

  if (sedeId) query = query.eq("lotes.sede_id", sedeId);

  const { data } = await query;

  const acumulado = new Map<string, CorteInventarioFila>();
  for (const fila of (data ?? []) as unknown as {
    tipo: string;
    cantidad: number;
    lotes: { insumo_id: string; insumos: { nombre: string; unidad_medida: string } | null } | null;
  }[]) {
    const insumo = fila.lotes?.insumos;
    const insumoId = fila.lotes?.insumo_id;
    if (!insumo || !insumoId) continue;

    const entrada = acumulado.get(insumoId) ?? {
      insumoId,
      nombre: insumo.nombre,
      unidadMedida: insumo.unidad_medida,
      ingresos: 0,
      egresos: 0,
      saldo: 0,
    };

    if (fila.tipo === "entrada") entrada.ingresos += fila.cantidad;
    else if (fila.tipo === "salida") entrada.egresos += fila.cantidad;
    else if (fila.tipo === "ajuste") {
      if (fila.cantidad > 0) entrada.ingresos += fila.cantidad;
      else entrada.egresos += Math.abs(fila.cantidad);
    }
    entrada.saldo = entrada.ingresos - entrada.egresos;

    acumulado.set(insumoId, entrada);
  }

  return Array.from(acumulado.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
