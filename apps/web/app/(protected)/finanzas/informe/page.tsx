import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getCategorias, getConfigFinanzas, getCuentas, getFlujo, getSaldos, getSedesFinanzas, getTasas } from "@/lib/finanzas/consultas";
import { armarInforme, claveMes, disponibleEnPesos, efectoTasa, leerMes, mesDe, nombreMes, primerDia, sumarMeses, ultimoDia, type Mes } from "@/lib/finanzas/informe";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InformeCliente } from "./informe-cliente";

const diaAntes = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);

// FC6: flujo de efectivo por actividades (operación, inversión y
// financiación) de un rango de meses, que cuadra con las cuentas.
export default async function InformePage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireUsuario();
  const acceso = await getAccesoFinanzas();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver el flujo de caja.</AlertDescription>
      </Alert>
    );
  }
  const supabase = await createClient();
  const config = await getConfigFinanzas(supabase);
  if (!config) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>Primero activa el flujo de caja desde Inicio.</AlertDescription>
      </Alert>
    );
  }
  if (!acceso.gestion) {
    return (
      <Alert>
        <AlertDescription>El informe de flujo de efectivo por actividades y sus exportes están disponibles en el plan Pro.</AlertDescription>
      </Alert>
    );
  }

  const q = await searchParams;
  const hoy = hoyBogota();
  const mesHoy = mesDe(hoy);
  const mesInicio = mesDe(config.fecha_inicio);
  const acotar = (m: Mes | null, porDefecto: Mes) => {
    const v = m ?? porDefecto;
    if (claveMes(v) < claveMes(mesInicio)) return mesInicio;
    if (claveMes(v) > claveMes(mesHoy)) return mesHoy;
    return v;
  };
  let desde = acotar(leerMes(typeof q.desde === "string" ? q.desde : null), mesHoy);
  let hasta = acotar(leerMes(typeof q.hasta === "string" ? q.hasta : null), desde);
  if (claveMes(desde) > claveMes(hasta)) [desde, hasta] = [hasta, desde];
  const sedeId = typeof q.sede === "string" && q.sede ? q.sede : null;
  const fDesde = primerDia(desde) < config.fecha_inicio ? config.fecha_inicio : primerDia(desde);
  const fHasta = ultimoDia(hasta) > hoy ? hoy : ultimoDia(hasta);

  // Últimos 12 meses hasta el final del rango (desde el inicio).
  const serieMeses: Mes[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = sumarMeses(hasta, -i);
    if (claveMes(m) >= claveMes(mesInicio)) serieMeses.push(m);
  }

  const [filas, cuentas, categorias, sedes, saldos0, saldos1, tasas0, tasas1, serie] = await Promise.all([
    getFlujo(supabase, fDesde, fHasta, sedeId),
    getCuentas(supabase),
    getCategorias(supabase),
    getSedesFinanzas(supabase),
    getSaldos(supabase, diaAntes(fDesde)),
    getSaldos(supabase, fHasta),
    getTasas(supabase, diaAntes(fDesde)),
    getTasas(supabase, fHasta),
    Promise.all(
      serieMeses.map(async (m) => {
        const desdeM = primerDia(m) < config.fecha_inicio ? config.fecha_inicio : primerDia(m);
        const hastaM = ultimoDia(m) > hoy ? hoy : ultimoDia(m);
        // Netos por categoría (lo anulado no infla las barras).
        const i = armarInforme((await getFlujo(supabase, desdeM, hastaM, sedeId)) ?? [], (c) => c);
        return { mes: claveMes(m), entradas: i.entradas, salidas: i.salidas };
      }),
    ),
  ]);
  if (!filas) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription>No se pudo calcular el informe. Vuelve a intentarlo en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  const nombres = new Map(categorias.map((c) => [c.codigo, c.nombre]));
  const informe = armarInforme(filas, (c) => nombres.get(c) ?? c);
  // Si a la fecha inicial aún no se había usado una tasa (p. ej. dólares con
  // saldo inicial), se usa la primera conocida del periodo.
  const tasasIni = new Map([...tasas1, ...tasas0]);
  const ini = disponibleEnPesos(cuentas, saldos0, tasasIni);
  const fin = disponibleEnPesos(cuentas, saldos1, tasas1);
  const inicial = sedeId ? null : ini.total;
  const final = sedeId ? null : fin.total;
  const sinTasa = [...new Set([...ini.sinTasa, ...fin.sinTasa])];

  return (
    <InformeCliente
      titulo={claveMes(desde) === claveMes(hasta) ? nombreMes(desde) : `${nombreMes(desde)} a ${nombreMes(hasta)}`}
      periodo={{ desde: claveMes(desde), hasta: claveMes(hasta), fDesde, fHasta, min: claveMes(mesInicio), max: claveMes(mesHoy) }}
      sedeId={sedeId}
      sedes={sedes}
      informe={informe}
      saldoInicial={inicial}
      saldoFinal={final}
      efecto={inicial !== null && final !== null ? efectoTasa(inicial, informe.variacion, final) : null}
      sinTasa={sinTasa}
      serie={serie}
      puedeExportar={acceso.puedeExportar}
    />
  );
}
