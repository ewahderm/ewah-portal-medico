import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoFinanzas,
  getArqueos,
  getConfigFinanzas,
  getCuentas,
  getIngresosPendientes,
  getPendientesPasarela,
  getPeriodos,
  getSaldos,
} from "@/lib/finanzas/consultas";
import { claveMes, mesesCerrables, siguientePorCerrar, ultimoDia } from "@/lib/finanzas/informe";
import { resumirPendientes } from "@/lib/finanzas/tratamientos";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CierreCliente } from "./cierre-cliente";

// FC6: cierre mensual en orden, con lista de verificación y arqueo; los
// meses cerrados se pueden reabrir (el último) con motivo.
export default async function CierrePage() {
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
        <AlertDescription>El cierre mensual con arqueo está disponible en el plan Pro.</AlertDescription>
      </Alert>
    );
  }
  const hoy = hoyBogota();
  const [periodos, arqueos, cuentas] = await Promise.all([getPeriodos(supabase), getArqueos(supabase), getCuentas(supabase)]);
  const cerrables = mesesCerrables(config.fecha_inicio, hoy);
  const cerrados = new Set(periodos.filter((p) => p.estado === "cerrado").map((p) => claveMes(p)));
  const siguiente = siguientePorCerrar(cerrables, cerrados);

  let verificacion = null;
  if (siguiente) {
    const fin = ultimoDia(siguiente);
    const [saldos, pasarela, pendientes] = await Promise.all([getSaldos(supabase, fin), getPendientesPasarela(supabase), getIngresosPendientes(supabase)]);
    const resumen = resumirPendientes(pendientes ?? []);
    verificacion = {
      boldVencidos: (pasarela ?? []).filter((p) => (p.fecha_esperada ?? p.fecha) <= fin).length,
      porRevisar: resumen.porRevisar + resumen.porGenerar.cantidad + resumen.anuladosConIngreso + resumen.sinCobrar.cantidad,
      cuentas: cuentas
        .filter((c) => c.es_disponible && (c.activa || (saldos.get(c.id) ?? 0) !== 0))
        .map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda, saldo: saldos.get(c.id) ?? c.saldo_inicial })),
    };
  }

  return (
    <CierreCliente
      siguiente={siguiente}
      verificacion={verificacion}
      periodos={periodos}
      arqueos={arqueos}
      nombreCuenta={Object.fromEntries(cuentas.map((c) => [c.id, c.nombre]))}
      monedaCuenta={Object.fromEntries(cuentas.map((c) => [c.id, c.moneda]))}
      hayCerrables={cerrables.length > 0}
      puedeAprobar={acceso.puedeAprobar}
    />
  );
}
