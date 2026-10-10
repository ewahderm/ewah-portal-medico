import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getConfigFinanzas, getCuentas, getIngresosPendientes, getCobrosFlujo } from "@/lib/finanzas/consultas";
import { vistaDeParametro } from "@/lib/finanzas/tratamientos";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CobrosCliente } from "./cobros-cliente";

// FC3: tratamientos por cobrar (crédito) y por revisar, y la puesta al día
// de los ingresos que el sistema puede registrar solo. ?ver= elige entre
// los pendientes (por defecto), los que ya entraron al flujo y los
// excluidos.
export default async function CobrosPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
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
  const vista = vistaDeParametro((await searchParams).ver);
  const [pendientes, cuentas, otraVista] = await Promise.all([
    getIngresosPendientes(supabase),
    getCuentas(supabase),
    vista === "pendientes" ? Promise.resolve([]) : getCobrosFlujo(supabase, vista),
  ]);
  if (!pendientes || !otraVista) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription>No se pudieron consultar los cobros pendientes. Vuelve a intentarlo en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  return (
    <CobrosCliente
      vista={vista}
      pendientes={pendientes}
      otraVista={otraVista}
      cuentas={cuentas.filter((c) => c.activa && c.moneda === "COP" && c.tipo !== "tarjeta_socio" && c.tipo !== "tarjeta_empresa").map((c) => ({ id: c.id, nombre: c.nombre }))}
      hoy={hoyBogota()}
      fechaInicio={config.fecha_inicio}
      puedeCrear={acceso.puedeCrear}
      puedeEditar={acceso.puedeEditar}
    />
  );
}
