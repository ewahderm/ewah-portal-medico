import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getConfigFinanzas, getFlujoMeses, getSedesFinanzas } from "@/lib/finanzas/consultas";
import { calcularInforme } from "@/lib/finanzas/informe-servidor";
import { claveMes, leerMes, mesDe, nombreMes, primerDia, sumarMeses, ultimoDia, type Mes } from "@/lib/finanzas/informe";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InformeCliente } from "./informe-cliente";

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
  const inicioSerie = primerDia(sumarMeses(hasta, -11)) < config.fecha_inicio ? config.fecha_inicio : primerDia(sumarMeses(hasta, -11));

  const [calculo, sedes, serie] = await Promise.all([
    calcularInforme(supabase, fDesde, fHasta, sedeId),
    getSedesFinanzas(supabase),
    getFlujoMeses(supabase, inicioSerie, fHasta, sedeId),
  ]);
  if (!calculo) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription>No se pudo calcular el informe. Vuelve a intentarlo en unos minutos.</AlertDescription>
      </Alert>
    );
  }

  return (
    <InformeCliente
      titulo={claveMes(desde) === claveMes(hasta) ? nombreMes(desde) : `${nombreMes(desde)} a ${nombreMes(hasta)}`}
      periodo={{ desde: claveMes(desde), hasta: claveMes(hasta), fDesde, fHasta, min: claveMes(mesInicio), max: claveMes(mesHoy) }}
      sedeId={sedeId}
      sedes={sedes}
      informe={calculo.informe}
      saldoInicial={calculo.saldoInicial}
      saldoFinal={calculo.saldoFinal}
      efecto={calculo.efecto}
      sinTasa={calculo.sinTasa}
      serie={serie}
      puedeExportar={acceso.puedeExportar}
    />
  );
}
