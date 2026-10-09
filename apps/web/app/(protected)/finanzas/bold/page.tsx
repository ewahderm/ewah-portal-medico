import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoFinanzas,
  getCambiosPagos,
  getConfigFinanzas,
  getCuentas,
  getImportacionesPasarela,
  getLiquidaciones,
  getPagosSinEmparejar,
  getPendientesPasarela,
} from "@/lib/finanzas/consultas";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BoldCliente } from "./bold-cliente";

// FC4: cobros con pasarela pendientes de abono, liquidación y su historial.
export default async function BoldPage() {
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
        <AlertDescription>La liquidación de las pasarelas de pago y las tarifas por medio de pago están disponibles en el plan Pro.</AlertDescription>
      </Alert>
    );
  }
  const [pendientes, cuentas, liquidaciones, sinEmparejar, cambios, importaciones] = await Promise.all([
    getPendientesPasarela(supabase),
    getCuentas(supabase),
    getLiquidaciones(supabase),
    getPagosSinEmparejar(supabase),
    getCambiosPagos(supabase),
    getImportacionesPasarela(supabase),
  ]);
  if (!pendientes) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription>No se pudieron consultar los cobros pendientes. Vuelve a intentarlo en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  return (
    // La clave reinicia la selección cuando cambian los pendientes.
    <BoldCliente
      key={pendientes.map((p) => p.movimiento_id).join(",")}
      pendientes={pendientes}
      liquidaciones={liquidaciones}
      cuentasPasarela={cuentas.filter((c) => c.tipo === "pasarela" && c.activa).map((c) => ({ id: c.id, nombre: c.nombre }))}
      pagosSinEmparejar={sinEmparejar.pagos}
      totalSinEmparejar={sinEmparejar.total}
      cambios={cambios}
      importaciones={importaciones}
      cuentas={cuentas.map((c) => ({ id: c.id, nombre: c.nombre, destino: c.activa && c.es_disponible && c.moneda === "COP", pasarela: c.tipo === "pasarela" }))}
      hoy={hoyBogota()}
      puedeCrear={acceso.puedeCrear}
      puedeAnular={acceso.puedeAnular}
    />
  );
}

