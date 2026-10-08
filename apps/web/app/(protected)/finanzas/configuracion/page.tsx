import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoFinanzas,
  getCategorias,
  getConfigFinanzas,
  getCuentas,
  getEmpleadosPicker,
  getSocios,
  getTiposIdentificacion,
} from "@/lib/finanzas/consultas";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfiguracionCliente } from "./configuracion-cliente";

// FC1: fecha de inicio, cuentas, socios y categorías.
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
  const [cuentas, socios, categorias, tiposIdentificacion, empleados] = await Promise.all([
    getCuentas(supabase),
    getSocios(supabase),
    getCategorias(supabase),
    getTiposIdentificacion(supabase),
    acceso.gestion ? getEmpleadosPicker(supabase) : Promise.resolve([]),
  ]);
  const q = await searchParams;
  return (
    <ConfiguracionCliente
      tab={typeof q.tab === "string" ? q.tab : "general"}
      hoy={hoyBogota()}
      fechaInicio={config.fecha_inicio}
      cuentas={cuentas}
      socios={socios}
      categorias={categorias}
      tiposIdentificacion={tiposIdentificacion}
      empleados={empleados}
      puedeEditar={acceso.puedeEditar}
      gestion={acceso.gestion}
    />
  );
}
