// Precio de los tratamientos y reparto del cobro de una atención: lógica
// pura que comparten el formulario de tratamiento, el cobro de la atención
// y Parámetros. La BD (0109) guarda el historial y vuelve a validar.

export type PrecioTratamiento = {
  tipo_tratamiento_id: string;
  valor: number;
  vigente_desde: string;
  created_at: string;
};

// El precio que regía para un tipo en una fecha: la vigencia más reciente
// que no sea posterior a la fecha y, con la misma vigencia, el último
// registrado (igual que fn_precio_vigente).
export function precioVigente(precios: PrecioTratamiento[], tipoId: string, fecha: string): number | null {
  let mejor: PrecioTratamiento | null = null;
  for (const p of precios) {
    if (p.tipo_tratamiento_id !== tipoId || p.vigente_desde > fecha) continue;
    if (
      !mejor ||
      p.vigente_desde > mejor.vigente_desde ||
      (p.vigente_desde === mejor.vigente_desde && p.created_at > mejor.created_at)
    ) {
      mejor = p;
    }
  }
  return mejor ? Number(mejor.valor) : null;
}

export type ItemCobro = {
  id: string;
  // Valor antes del reparto (lo que se iba a cobrar por el tratamiento).
  base: number;
  // false = a este tratamiento nunca se le hace descuento: no cambia.
  aplicaDescuento: boolean;
};

// Reparte el total a cobrar entre los tratamientos que aceptan descuento,
// en proporción a su valor, en pesos enteros. Lo que no cuadra por el
// redondeo se le suma o resta al de mayor valor, así la suma da exacto.
export function repartirTotal(items: ItemCobro[], total: number): { valores: Record<string, number> } | { error: string } {
  if (!Number.isFinite(total) || total < 0) return { error: "Escribe un total válido." };
  const fijos = items.filter((i) => !i.aplicaDescuento).reduce((s, i) => s + i.base, 0);
  const ajustables = items.filter((i) => i.aplicaDescuento);
  const baseAjustable = ajustables.reduce((s, i) => s + i.base, 0);
  const objetivo = Math.round(total) - fijos;
  if (objetivo < 0) return { error: "El total es menor que lo de los tratamientos sin descuento." };
  const valores: Record<string, number> = {};
  for (const i of items) valores[i.id] = i.base;
  if (ajustables.length === 0) {
    return objetivo === 0 ? { valores } : { error: "Marca al menos un tratamiento al que se le aplique el descuento." };
  }
  if (baseAjustable <= 0) {
    // Sin base para repartir en proporción: partes iguales.
    const parte = Math.floor(objetivo / ajustables.length);
    ajustables.forEach((i) => (valores[i.id] = parte));
    valores[ajustables[0].id] += objetivo - parte * ajustables.length;
    return { valores };
  }
  let asignado = 0;
  for (const i of ajustables) {
    valores[i.id] = Math.round((i.base * objetivo) / baseAjustable);
    asignado += valores[i.id];
  }
  const mayor = ajustables.reduce((a, b) => (b.base > a.base ? b : a));
  valores[mayor.id] += objetivo - asignado;
  if (valores[mayor.id] < 0) return { error: "No se pudo repartir ese total." };
  return { valores };
}

export function sumaValores(valores: Record<string, number>): number {
  return Object.values(valores).reduce((s, v) => s + v, 0);
}
