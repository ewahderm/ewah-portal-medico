import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoFinanzas,
  getBancos,
  getCategorias,
  getConfigFinanzas,
  getCuentas,
  getEmpleadosPicker,
  getMediosPagoFinanzas,
  getSedesFinanzas,
  getSocios,
  getTiposIdentificacion,
} from "@/lib/finanzas/consultas";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfiguracionCliente } from "./configuracion-cliente";

// FC1: fecha de inicio, cuentas, socios y categorías. FC3: medios de pago.
export default async function ConfiguracionFinanzasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
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
        <AlertDescription>Primero activa el flujo de caja desde Inicio.</AlertDescription>
      </Alert>
    );
  }
  const [cuentas, socios, categorias, tiposIdentificacion, empleados, sedes, bancos, medios] = await Promise.all([
    getCuentas(supabase),
    getSocios(supabase),
    getCategorias(supabase),
    getTiposIdentificacion(supabase),
    acceso.gestion ? getEmpleadosPicker(supabase) : Promise.resolve([]),
    getSedesFinanzas(supabase),
    getBancos(supabase),
    getMediosPagoFinanzas(supabase),
  ]);
  const q = await searchParams;
  return (
    <ConfiguracionCliente
      tab={typeof q.tab === "string" ? q.tab : "general"}
      hoy={hoyBogota()}
      fechaInicio={config.fecha_inicio}
      historialFecha={config.historial ?? []}
      cuentas={cuentas}
      sedes={sedes}
      bancos={bancos}
      socios={socios}
      categorias={categorias}
      medios={medios}
      tiposIdentificacion={tiposIdentificacion}
      empleados={empleados}
      puedeEditar={acceso.puedeEditar}
      gestion={acceso.gestion}
    />
  );
}
