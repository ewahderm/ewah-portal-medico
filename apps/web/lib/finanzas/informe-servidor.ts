// Cálculo del informe de flujo de efectivo en el servidor (FC6): lo usan
// la pantalla y el exporte para que den lo mismo.

import { createClient } from "@/lib/supabase/server";
import { getCategorias, getCuentas, getFlujo, getSaldos, getTasas } from "@/lib/finanzas/consultas";
import { armarInforme, disponibleEnPesos, efectoTasa, type Informe } from "@/lib/finanzas/informe";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type InformeCalculado = {
  informe: Informe;
  saldoInicial: number | null;
  saldoFinal: number | null;
  efecto: number | null;
  sinTasa: string[];
};

const diaAntes = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);

export async function calcularInforme(supabase: Supabase, desde: string, hasta: string, sedeId: string | null): Promise<InformeCalculado | null> {
  const [filas, cuentas, categorias, saldos0, saldos1, tasas0, tasas1] = await Promise.all([
    getFlujo(supabase, desde, hasta, sedeId),
    getCuentas(supabase),
    getCategorias(supabase),
    getSaldos(supabase, diaAntes(desde)),
    getSaldos(supabase, hasta),
    getTasas(supabase, diaAntes(desde)),
    getTasas(supabase, hasta),
  ]);
  if (!filas) return null;
  const nombres = new Map(categorias.map((c) => [c.codigo, c.nombre]));
  const informe = armarInforme(filas, (c) => nombres.get(c) ?? c);
  if (sedeId) return { informe, saldoInicial: null, saldoFinal: null, efecto: null, sinTasa: [] };
  // Si a la fecha inicial aún no se había usado una tasa (p. ej. dólares con
  // saldo inicial), se usa la del final del periodo.
  const ini = disponibleEnPesos(cuentas, saldos0, new Map([...tasas1, ...tasas0]));
  const fin = disponibleEnPesos(cuentas, saldos1, tasas1);
  return {
    informe,
    saldoInicial: ini.total,
    saldoFinal: fin.total,
    efecto: efectoTasa(ini.total, informe.variacion, fin.total),
    sinTasa: [...new Set([...ini.sinTasa, ...fin.sinTasa])],
  };
}
